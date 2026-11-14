#!/usr/bin/env node
// Audit des doublons dans le Blob (LECTURE SEULE : aucune écriture en base, aucune suppression).
//
//   node scripts/blob-doublons.js                       -> rapport à l'écran + fichier CSV
//   node scripts/blob-doublons.js --out=doublons.csv    -> choisir le fichier CSV
//   node scripts/blob-doublons.js --concurrence=4       -> nombre de téléchargements en parallèle (8 par défaut)
//
// Principe :
//   1. liste tous les fichiers référencés par la base (cours, cours_documents, sujets et corrigés) ;
//   2. relève la taille de chaque fichier (requête HEAD) ;
//   3. ne télécharge que les fichiers dont la taille est partagée avec un autre fichier,
//      et calcule leur empreinte SHA-256 (celle déjà enregistrée en base est réutilisée) ;
//   4. regroupe les fichiers identiques : un groupe de 3 URL = 2 copies en trop.
//
// Variables d'environnement : DB_URL (et DB_SSL=false en local). Le Blob est public : aucun jeton requis.

require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

const arg = (nom, defaut) => (process.argv.find((a) => a.startsWith(`--${nom}=`)) || '').split('=')[1] || defaut;
const SORTIE = arg('out', 'rapport-doublons-blob.csv');
const CONCURRENCE = Math.max(1, Number(arg('concurrence', 8)));
// Réservé aux essais locaux : accepte n'importe quel hôte (en production, seuls les hôtes Blob sont lus)
const TOUT_HOTE = process.argv.includes('--autoriser-tout-hote');

const ssl = process.env.DB_SSL === 'false' ? {} : { ssl: { require: true, rejectUnauthorized: false } };
const db = new Sequelize(process.env.DB_URL, { dialect: 'postgres', logging: false, dialectOptions: ssl });

const hoteBlob = (url) => {
  try { return /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(new URL(url).hostname); } catch { return false; }
};
const lisible = (url) => TOUT_HOTE ? /^https?:\/\//i.test(url) : hoteBlob(url);
const mo = (octets) => `${(octets / (1024 * 1024)).toFixed(1)} Mo`;

// Exécute `tache` sur chaque élément, `n` à la fois
const enParallele = async (elements, n, tache) => {
  const resultats = new Array(elements.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, async () => {
    while (i < elements.length) { const k = i++; resultats[k] = await tache(elements[k], k); }
  }));
  return resultats;
};

const taille = async (url) => {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) return { erreur: `HTTP ${res.status}` };
  return { octets: Number(res.headers.get('content-length')) };
};

const empreinte = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return { erreur: `HTTP ${res.status}` };
  const hash = crypto.createHash('sha256');
  for await (const morceau of res.body) hash.update(morceau);
  return { sha256: hash.digest('hex') };
};

(async () => {
  // 1. Références en base
  const q = (sql) => db.query(sql, { type: QueryTypes.SELECT });
  const lignes = [
    ...(await q(`SELECT 'cours' AS table_, id, titre AS libelle, chemin_fichier AS url, NULL AS sha256 FROM cours`)),
    ...(await q(`SELECT 'cours_documents' AS table_, d.id, c.titre AS libelle, d.chemin_fichier AS url, d.sha256
                   FROM cours_documents d JOIN cours c ON c.id = d.cours_id`)),
    ...(await q(`SELECT 'sujets' AS table_, id, titre AS libelle, chemin_fichier AS url, sha256 FROM sujets`)),
    ...(await q(`SELECT 'sujets (corrigé)' AS table_, id, titre AS libelle, chemin_corrige AS url, corrige_sha256 AS sha256
                   FROM sujets WHERE chemin_corrige IS NOT NULL`)),
  ].filter((l) => l.url && lisible(l.url));

  const parUrl = new Map();
  for (const l of lignes) {
    if (!parUrl.has(l.url)) parUrl.set(l.url, { url: l.url, refs: [], sha256: null });
    const f = parUrl.get(l.url);
    f.refs.push(l);
    if (l.sha256 && !f.sha256) f.sha256 = l.sha256;
  }
  const fichiers = [...parUrl.values()];
  console.log(`${lignes.length} références en base, ${fichiers.length} fichiers distincts (par URL).`);

  // 2. Tailles
  console.log('Lecture des tailles…');
  const introuvables = [];
  await enParallele(fichiers, CONCURRENCE, async (f) => {
    try {
      const t = await taille(f.url);
      if (t.erreur) { f.erreur = t.erreur; introuvables.push(f); } else f.octets = t.octets;
    } catch (e) { f.erreur = e.message; introuvables.push(f); }
  });
  const valides = fichiers.filter((f) => !f.erreur);

  // 3. Empreintes : seulement pour les fichiers dont la taille est partagée
  const parTaille = new Map();
  for (const f of valides) parTaille.set(f.octets, [...(parTaille.get(f.octets) || []), f]);
  const aHacher = valides.filter((f) => !f.sha256 && parTaille.get(f.octets).length > 1);
  console.log(`${aHacher.length} fichier(s) à télécharger pour comparer (taille identique à un autre fichier).`);
  let fait = 0;
  await enParallele(aHacher, CONCURRENCE, async (f) => {
    try {
      const r = await empreinte(f.url);
      if (r.erreur) { f.erreur = r.erreur; introuvables.push(f); } else f.sha256 = r.sha256;
    } catch (e) { f.erreur = e.message; introuvables.push(f); }
    if (++fait % 10 === 0) console.log(`  ${fait}/${aHacher.length}`);
  });

  // 4. Groupes de fichiers identiques (même empreinte)
  const groupes = new Map();
  for (const f of valides.filter((x) => x.sha256 && !x.erreur)) {
    groupes.set(f.sha256, [...(groupes.get(f.sha256) || []), f]);
  }
  const doublons = [...groupes.entries()].filter(([, fs_]) => fs_.length > 1);

  // Le fichier conservé serait le plus ancien : celui dont la plus petite référence est la plus basse
  const cle = (f) => Math.min(...f.refs.map((r) => Number(r.id)));
  let gaspille = 0;
  let enTrop = 0;
  const csv = ['groupe;sha256;role;taille_octets;url;references'];
  doublons.forEach(([sha, liste], i) => {
    liste.sort((a, b) => cle(a) - cle(b));
    gaspille += (liste.length - 1) * liste[0].octets;
    enTrop += liste.length - 1;
    liste.forEach((f, k) => csv.push([
      i + 1, sha, k === 0 ? 'a_garder' : 'doublon', f.octets, f.url,
      `"${f.refs.map((r) => `${r.table_}#${r.id} ${String(r.libelle).replace(/"/g, "'")}`).join(' | ')}"`,
    ].join(';')));
  });
  introuvables.forEach((f) => csv.push(['', '', 'introuvable', '', f.url,
    `"${f.erreur} : ${f.refs.map((r) => `${r.table_}#${r.id}`).join(' | ')}"`].join(';')));
  fs.writeFileSync(SORTIE, `﻿${csv.join('\n')}\n`);

  // Rapport
  console.log('\n──── Rapport ────');
  console.log(`Groupes de fichiers identiques : ${doublons.length}`);
  console.log(`Fichiers en trop              : ${enTrop}`);
  console.log(`Espace récupérable            : ${mo(gaspille)}`);
  console.log(`Fichiers introuvables         : ${introuvables.length}`);
  doublons.slice(0, 15).forEach(([, liste], i) => {
    console.log(`\n#${i + 1}  ${liste.length} copies, ${mo(liste[0].octets)} chacune`);
    liste.forEach((f, k) => console.log(`   ${k === 0 ? 'garder ' : 'doublon'}  ${f.url}\n            ${f.refs.map((r) => `${r.table_}#${r.id}`).join(', ')}`));
  });
  if (doublons.length > 15) console.log(`\n… et ${doublons.length - 15} autre(s) groupe(s) dans ${SORTIE}`);
  console.log(`\nRapport complet : ${SORTIE}  (aucune modification n'a été faite)`);
  await db.close();
})().catch(async (e) => { console.error('ERREUR', e.message); await db.close().catch(() => {}); process.exit(1); });
