// src/utils/validationComptes.js
// Règle métier : les comptes créés par l'admin ADM-0010 sont toujours créés
// « en attente » et seul ADM-0010 peut les activer.

const MATRICULE_VALIDATEUR = 'ADM-0010';

const estValidateur = (user) =>
  String(user?.matricule || '').toUpperCase() === MATRICULE_VALIDATEUR;

/** Statut initial d'un compte selon l'admin qui le crée. */
const statutInitial = (createur) => (estValidateur(createur) ? 'en_attente' : 'actif');

/**
 * Vrai si `acteur` n'a pas le droit d'activer le compte `cible`
 * (compte créé par ADM-0010 et acteur différent d'ADM-0010).
 */
const activationInterdite = async (acteur, cible) => {
  if (estValidateur(acteur)) return false;
  if (!cible.cree_par) return false;
  const { Utilisateur } = require('../models');
  const createur = await Utilisateur.findByPk(cible.cree_par, { attributes: ['matricule'] });
  return estValidateur(createur);
};

module.exports = { MATRICULE_VALIDATEUR, estValidateur, statutInitial, activationInterdite };
