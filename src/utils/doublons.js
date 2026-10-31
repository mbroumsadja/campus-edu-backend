// src/utils/doublons.js
// Recherche d'un fichier déjà présent à partir de son empreinte SHA-256 (sujets, corrigés, documents de cours).
const { Op } = require('sequelize');

const SHA256_RE = /^[0-9a-f]{64}$/;
const normaliserSha = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const estSha256 = (v) => SHA256_RE.test(normaliserSha(v));

// Retourne { [sha]: [{ type, id, titre, statut }] } pour chaque empreinte demandée
const chercherDoublons = async (shas) => {
  const { Sujet, CoursDocument, Cours } = require('../models');
  const liste = [...new Set(shas.map(normaliserSha).filter(estSha256))];
  const res = Object.fromEntries(liste.map((s) => [s, []]));
  if (!liste.length) return res;

  const sujets = await Sujet.findAll({
    where: { [Op.or]: [{ sha256: liste }, { corrige_sha256: liste }] },
    attributes: ['id', 'titre', 'statut', 'sha256', 'corrige_sha256'],
  });
  for (const s of sujets) {
    if (res[s.sha256]) res[s.sha256].push({ type: 'sujet', id: s.id, titre: s.titre, statut: s.statut });
    if (res[s.corrige_sha256]) res[s.corrige_sha256].push({ type: 'sujet_corrige', id: s.id, titre: s.titre, statut: s.statut });
  }

  const docs = await CoursDocument.findAll({
    where: { sha256: liste },
    attributes: ['id', 'sha256', 'nomFichierOriginal'],
    include: [{ model: Cours, as: 'cours', attributes: ['id', 'titre', 'statut'] }],
  });
  for (const d of docs) {
    res[d.sha256].push({ type: 'cours', id: d.cours.id, document_id: d.id, titre: d.cours.titre, statut: d.cours.statut });
  }
  return res;
};

module.exports = { chercherDoublons, normaliserSha, estSha256 };
