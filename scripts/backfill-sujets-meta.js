#!/usr/bin/env node
// CE-11 — Renseigne sha256, taille_octets, mime et nom_origine des sujets existants.
//   node scripts/backfill-sujets-meta.js --dry-run   (rapport sans écriture)
//   node scripts/backfill-sujets-meta.js
// Ne télécharge que des URL Vercel Blob de confiance. Les doublons (même empreinte) sont
// signalés et laissés intacts : à traiter à la main dans l'administration.

require('dotenv').config();
const crypto = require('crypto');
const { sequelize, Sujet } = require('../src/models');
const { isTrustedFileUrl } = require('../src/utils/fileUrl');
const { cleanFileName } = require('../src/utils/fileName');

const dryRun = process.argv.includes('--dry-run');

const digest = async (url) => {
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const chunk of res.body) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size, mime: res.headers.get('content-type') };
};

(async () => {
  const todo = await Sujet.findAll({ where: { sha256: null }, order: [['id', 'ASC']] });
  console.log(`${todo.length} sujet(s) sans empreinte${dryRun ? ' (dry-run)' : ''}`);
  const stats = { ok: 0, doublons: 0, ignores: 0, erreurs: 0 };

  for (const s of todo) {
    if (!isTrustedFileUrl(s.cheminFichier)) { stats.ignores++; console.log(`#${s.id} ignoré (URL non fiable)`); continue; }
    try {
      const { sha256, size, mime } = await digest(s.cheminFichier);
      const twin = await Sujet.findOne({ where: { sha256 }, attributes: ['id'] });
      if (twin && twin.id !== s.id) { stats.doublons++; console.log(`#${s.id} DOUBLON de #${twin.id}`); continue; }
      if (!dryRun) {
        await s.update({
          sha256, taille_octets: size, mime,
          nom_origine: cleanFileName(new URL(s.cheminFichier).pathname),
        });
      }
      stats.ok++;
    } catch (e) {
      stats.erreurs++; console.log(`#${s.id} erreur : ${e.message}`);
    }
  }
  console.log(stats);
  await sequelize.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
