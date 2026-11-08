// src/utils/fichiersPartages.js
// Un même fichier peut être rattaché à plusieurs cours (tronc commun : une copie par filière).
// Le fichier stocké ne doit donc être supprimé que lorsque plus aucun enregistrement ne l'utilise.
const { Op } = require('sequelize');

// Vrai si un autre enregistrement (copie de cours, document, sujet) pointe encore vers ce fichier.
// `sauf.coursId` exclut les lignes du cours en cours de suppression/modification.
const fichierEncoreUtilise = async (chemin, { sauf = {} } = {}) => {
  if (!chemin) return false;
  const { Cours, CoursDocument, Sujet } = require('../models');

  const whereCours = { cheminFichier: chemin };
  const whereDocs = { cheminFichier: chemin };
  if (sauf.coursId) {
    whereCours.id = { [Op.ne]: sauf.coursId };
    whereDocs.cours_id = { [Op.ne]: sauf.coursId };
  }

  const [cours, docs, sujets] = await Promise.all([
    Cours.count({ where: whereCours }),
    CoursDocument.count({ where: whereDocs }),
    Sujet.count({ where: { [Op.or]: [{ cheminFichier: chemin }, { cheminCorrige: chemin }] } }),
  ]);
  return cours + docs + sujets > 0;
};

// Supprime le fichier stocké seulement s'il n'est plus utilisé ailleurs. Retourne true si supprimé.
const supprimerFichierSiOrphelin = async (chemin, options) => {
  if (!chemin) return false;
  if (await fichierEncoreUtilise(chemin, options)) return false;
  const { deleteStoredFile } = require('../middlewares/upload');
  await deleteStoredFile(chemin).catch(() => {});
  return true;
};

module.exports = { fichierEncoreUtilise, supprimerFichierSiOrphelin };
