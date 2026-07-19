// src/modules/search/search.controller.js
const { Cours, Sujet, UE, Filiere, Utilisateur } = require('../../models');
const { Op }          = require('sequelize');
const { success, error } = require('../../utils/apiResponse');

// ──────────────────────────────────────────────────────────────────
//  GET /api/search
//  Public — pas de JWT requis
//  Query: q (nom du cours/UE), filiere_id, niveau, annee, type
//  Retourne : { ue: [...], résultats groupés par cours → sujets }
// ──────────────────────────────────────────────────────────────────
const rechercher = async (req, res, next) => {
  try {
    const { q, filiere_id, niveau, annee, type } = req.query;

    if (!q && !filiere_id && !niveau) {
      return error(res, 'Veuillez fournir un terme de recherche ou un filtre (filière/niveau).', 400);
    }

    // Filtre sur l'UE (point commun entre Cours et Sujet)
    const ueWhere = {};
    if (filiere_id) ueWhere.filiere_id = filiere_id;
    if (niveau)     ueWhere.niveau     = niveau;
    if (q)          ueWhere[Op.or] = [{ intitule: { [Op.like]: `%${q}%` } }, { code: { [Op.like]: `%${q}%` } }];

    const includeUE = {
      model: UE,
      as: 'ue',
      where: ueWhere,
      attributes: ['id', 'code', 'intitule', 'niveau', 'semestre'],
      include: [{ model: Filiere, as: 'filiere', attributes: ['id', 'nom', 'code'] }],
    };

    // Cours (uniquement publiés — accès public)
    const coursWhere = { statut: 'publie' };
    if (type)  coursWhere.type = type;
    if (annee) coursWhere.anneAcademique = annee;

    const cours = await Cours.findAll({
      where: coursWhere,
      include: [includeUE, { model: Utilisateur, as: 'enseignant', attributes: ['nom', 'prenom'] }],
      attributes: ['id', 'titre', 'description', 'type', 'nomFichierOriginal', 'tailleFichier', 'anneAcademique', 'vues', 'telechargemements'],
      order: [['createdAt', 'DESC']],
    });

    // Sujets (uniquement publiés)
    const sujetWhere = { statut: 'publie' };
    if (annee) sujetWhere.annee = parseInt(annee);

    const sujets = await Sujet.findAll({
      where: sujetWhere,
      include: [includeUE, { model: Utilisateur, as: 'enseignant', attributes: ['nom', 'prenom'] }],
      attributes: ['id', 'titre', 'type', 'session', 'annee', 'avecCorrige', 'telechargemements'],
      order: [['annee', 'DESC']],
    });

    // ── Regroupement par UE → { niveau, filiere, cours[], sujets[] } ──
    const groupes = {};

    const ajouter = (item, cle) => {
      const ueId = item.ue.id;
      if (!groupes[ueId]) {
        groupes[ueId] = {
          ue: { id: item.ue.id, code: item.ue.code, intitule: item.ue.intitule, niveau: item.ue.niveau },
          filiere: item.ue.filiere,
          cours: [],
          sujets: [],
        };
      }
      groupes[ueId][cle].push(item);
    };

    cours.forEach(c => ajouter(c, 'cours'));
    sujets.forEach(s => ajouter(s, 'sujets'));

    return success(res, Object.values(groupes));
  } catch (err) {
    next(err);
  }
};

module.exports = { rechercher };