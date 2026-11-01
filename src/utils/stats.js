// src/utils/stats.js
// CE-21 : compteurs quotidiens (un UPSERT atomique par événement, plus de ligne par téléchargement).
const { sequelize } = require('../models');
const { normalizeSearch } = require('./searchText');
const logger = require('./logger');

const JOUR = "(now() AT TIME ZONE 'UTC')::date";

const sans = async (label, fn) => {
  try { await fn(); } catch (err) { logger.warn(`${label} : ${err.message}`); }
};

const compterTelechargement = (type, cibleId) => sans('stats', () => sequelize.query(
  `INSERT INTO stats_quotidiennes (jour, type, cible_id, telechargements) VALUES (${JOUR}, :type, :id, 1)
   ON CONFLICT (jour, type, cible_id) DO UPDATE SET telechargements = stats_quotidiennes.telechargements + 1`,
  { replacements: { type, id: cibleId } }));

// Terme normalisé (minuscules, sans accents), tronqué : aucune donnée personnelle attendue
const journaliserRechercheVide = (terme) => {
  const t = normalizeSearch(String(terme || '')).slice(0, 100);
  if (t.length < 2) return Promise.resolve();
  return sans('recherche vide', () => sequelize.query(
    `INSERT INTO recherches_vides (jour, terme, nb) VALUES (${JOUR}, :t, 1)
     ON CONFLICT (jour, terme) DO UPDATE SET nb = recherches_vides.nb + 1`,
    { replacements: { t } }));
};

// Historique par utilisateur : une seule ligne par (utilisateur, cours)
const memoriserTelechargement = (Telechargement, valeurs) => sans('historique', () => Telechargement.findOrCreate({
  where: { utilisateur_id: valeurs.utilisateur_id, cours_id: valeurs.cours_id },
  defaults: valeurs,
}));

module.exports = { compterTelechargement, journaliserRechercheVide, memoriserTelechargement };
