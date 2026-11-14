// src/utils/fichiersPartages.js
// Un même fichier peut être rattaché à plusieurs cours (tronc commun : une copie par filière).
// Le fichier stocké ne doit donc être supprimé que lorsque plus aucun enregistrement ne l'utilise.
const { Op } = require('sequelize');

// Vrai si un autre enregistrement (copie de cours, document, sujet) pointe encore vers ce fichier.
// `sauf.coursId` exclut les lignes du cours en cours de suppression/modification.
const fichierEncoreUtilise = async (chemin, { sauf = {}, transaction } = {}) => {
  if (!chemin) return false;
  const { Cours, CoursDocument, Sujet } = require('../models');

  const whereCours = { cheminFichier: chemin };
  const whereDocs = { cheminFichier: chemin };
  if (sauf.coursId) {
    whereCours.id = { [Op.ne]: sauf.coursId };
    whereDocs.cours_id = { [Op.ne]: sauf.coursId };
  }

  const [cours, docs, sujets] = await Promise.all([
    Cours.count({ where: whereCours, transaction }),
    CoursDocument.count({ where: whereDocs, transaction }),
    Sujet.count({ where: { [Op.or]: [{ cheminFichier: chemin }, { cheminCorrige: chemin }] }, transaction }),
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

// Règle du tout ou rien (base de données + stockage) :
// à appeler DANS la transaction SQL, APRÈS les destroy/update des lignes concernées.
// Supprime du stockage les fichiers devenus orphelins (les lignes déjà supprimées ne comptent plus).
// Si le stockage échoue, StockageError est levée : l'appelant annule (rollback) la transaction,
// la base reste donc identique au stockage.
const supprimerFichiersOrphelins = async (chemins, { transaction } = {}) => {
  const { deleteStoredFilesStrict } = require('../middlewares/upload');
  const orphelins = [];
  for (const chemin of new Set((chemins || []).filter(Boolean))) {
    if (!(await fichierEncoreUtilise(chemin, { transaction }))) orphelins.push(chemin);
  }
  if (orphelins.length) await deleteStoredFilesStrict(orphelins);
  return orphelins;
};

// Réponse HTTP standard quand le stockage a échoué (transaction annulée, rien n'a changé).
const repondreErreurStockage = (res, err) => {
  const { StockageError } = require('../middlewares/upload');
  if (!(err instanceof StockageError)) return false;
  console.error('[stockage]', err.message);
  res.status(502).json({
    success: false,
    message: 'Suppression annulée : le fichier n\'a pas pu être supprimé du stockage. Rien n\'a été modifié, réessayez.',
  });
  return true;
};

module.exports = { fichierEncoreUtilise, supprimerFichierSiOrphelin, supprimerFichiersOrphelins, repondreErreurStockage };
