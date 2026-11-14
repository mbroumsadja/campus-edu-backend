// src/modules/stats/stats.controller.js
// CE-21 : tableau de bord admin alimenté par les compteurs quotidiens (aucune lecture de lignes brutes).
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../models');
const { success, error } = require('../../utils/apiResponse');

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => d.toISOString().slice(0, 10);

// GET /stats?depuis=AAAA-MM-JJ&jusqua=AAAA-MM-JJ  (30 derniers jours par défaut, 366 jours maximum)
const tableauDeBord = async (req, res, next) => {
  try {
    const jusqua = req.query.jusqua || iso(new Date());
    const depuis = req.query.depuis || iso(new Date(Date.now() - 29 * 86400000));
    if (!JOUR_RE.test(depuis) || !JOUR_RE.test(jusqua) || Number.isNaN(Date.parse(depuis)) || Number.isNaN(Date.parse(jusqua))) {
      return error(res, 'Dates invalides : format AAAA-MM-JJ.', 400);
    }
    if (depuis > jusqua) return error(res, '"depuis" doit précéder "jusqua".', 400);
    if ((Date.parse(jusqua) - Date.parse(depuis)) / 86400000 > 365) return error(res, 'Période limitée à 366 jours.', 400);

    const r = { replacements: { depuis, jusqua }, type: QueryTypes.SELECT };
    const [parJour, top, vides] = await Promise.all([
      sequelize.query(`SELECT jour::text AS jour, sum(telechargements)::int AS telechargements
                         FROM stats_quotidiennes WHERE jour BETWEEN :depuis AND :jusqua GROUP BY jour ORDER BY jour`, r),
      sequelize.query(`SELECT s.type, s.cible_id AS id, sum(s.telechargements)::int AS telechargements,
                              COALESCE(su.titre, c.titre) AS titre
                         FROM stats_quotidiennes s
                         LEFT JOIN sujets su ON s.type = 'sujet' AND su.id = s.cible_id
                         LEFT JOIN cours c   ON s.type = 'cours'  AND c.id  = s.cible_id
                        WHERE s.jour BETWEEN :depuis AND :jusqua
                        GROUP BY s.type, s.cible_id, su.titre, c.titre
                        ORDER BY telechargements DESC, s.cible_id LIMIT 10`, r),
      sequelize.query(`SELECT terme, sum(nb)::int AS nb FROM recherches_vides
                        WHERE jour BETWEEN :depuis AND :jusqua GROUP BY terme ORDER BY nb DESC, terme LIMIT 20`, r),
    ]);

    return success(res, {
      periode: { depuis, jusqua },
      total_telechargements: parJour.reduce((n, j) => n + j.telechargements, 0),
      par_jour: parJour,
      top_documents: top,
      recherches_sans_resultat: vides,
    });
  } catch (err) { next(err); }
};

// GET /stats/a-traiter — compteurs des badges de l'admin (contenus à valider, demandes nouvelles)
const aTraiter = async (_req, res, next) => {
  try {
    const { Cours, Sujet, Demande } = require('../../models');
    const [cours, supports, sujets, demandes] = await Promise.all([
      Cours.count({ where: { statut: 'en_attente', categorie: 'cours' } }),
      Cours.count({ where: { statut: 'en_attente', categorie: 'support' } }),
      Sujet.count({ where: { statut: 'en_attente' } }),
      Demande.count({ where: { statut: 'nouvelle' } }),
    ]);
    return success(res, { cours_en_attente: cours, supports_en_attente: supports, sujets_en_attente: sujets, demandes_nouvelles: demandes });
  } catch (err) { next(err); }
};

// GET /stats/appareils — appareils qui utilisent l'application.
// Un appareil = une famille de sessions (connexion + rotations de son refresh token).
//   total  : tous les appareils qui se sont connectés depuis le début
//   actifs : appareils actuellement connectés (session non révoquée et non expirée)
const appareils = async (_req, res, next) => {
  try {
    const [r] = await sequelize.query(
      `SELECT count(DISTINCT famille_id)::int AS total,
              (count(DISTINCT famille_id) FILTER (WHERE revoked_at IS NULL AND expires_at > now()))::int AS actifs
         FROM sessions`,
      { type: QueryTypes.SELECT }
    );
    return success(res, { total: r.total, actifs: r.actifs });
  } catch (err) { next(err); }
};

module.exports = { tableauDeBord, aTraiter, appareils };
