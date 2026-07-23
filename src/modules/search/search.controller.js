// src/modules/search/search.controller.js
const { Cours, Sujet, UE, Filiere, Utilisateur } = require('../../models');
const { Op }          = require('sequelize');
const { success, error } = require('../../utils/apiResponse');
const path            = require('path');

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

// ──────────────────────────────────────────────────────────────────
//  GET /api/search/documents
//  Public — recherche de documents (Cours + Sujets d'examen)
//  Query: 
//    - nom (requis) : nom du document à rechercher
//    - niveau (optionnel) : L1, L2, L3, M1, M2
//    - filiere (optionnel) : code de la filière (ex: INFO, MATH)
//    - type (optionnel) : pdf, video, slide, autre, partiel, rattrapage, etc.
//  Retourne : array de documents avec lien téléchargement, taille, type, niveau, filière, code UE
// ──────────────────────────────────────────────────────────────────
const rechercherDocuments = async (req, res, next) => {
  try {
    const { nom, niveau, filiere, type } = req.query;

    // Validation : le paramètre 'nom' est requis
    if (!nom || nom.trim() === '') {
      return error(res, 'Le paramètre "nom" est requis pour rechercher des documents.', 400);
    }

    // Construire la condition WHERE pour la recherche par nom
    const searchCondition = {
      [Op.like]: `%${nom.trim()}%`
    };

    // Filtre sur l'UE (si niveau ou filière fournis)
    const ueWhere = {};
    const filiereWhere = {};
    
    if (niveau) ueWhere.niveau = niveau;
    if (filiere) filiereWhere.code = filiere;

    const includeUE = {
      model: UE,
      as: 'ue',
      where: Object.keys(ueWhere).length > 0 ? ueWhere : undefined,
      attributes: ['id', 'code', 'intitule', 'niveau'],
      include: [{
        model: Filiere,
        as: 'filiere',
        where: Object.keys(filiereWhere).length > 0 ? filiereWhere : undefined,
        attributes: ['id', 'code', 'nom'],
      }],
    };

    // Recherche dans les Cours publiés
    const coursWhere = { 
      statut: 'publie',
      titre: searchCondition
    };
    if (type) coursWhere.type = type;

    const cours = await Cours.findAll({
      where: coursWhere,
      include: [includeUE],
      attributes: ['id', 'titre', 'type', 'cheminFichier', 'tailleFichier', 'nomFichierOriginal'],
      order: [['createdAt', 'DESC']],
    });

    // Recherche dans les Sujets publiés
    const sujetWhere = {
      statut: 'publie',
      titre: searchCondition
    };
    if (type) sujetWhere.type = type;

    const sujets = await Sujet.findAll({
      where: sujetWhere,
      include: [includeUE],
      attributes: ['id', 'titre', 'type', 'cheminFichier', 'annee'],
      order: [['annee', 'DESC']],
    });

    // Formatter les résultats
    const documents = [];

    // Ajouter les cours formatés
    cours.forEach(c => {
      // Vérifier que l'UE a été trouvée (pour les filtres appliqués)
      if (c.ue && c.ue.filiere) {
        documents.push({
          id: c.id,
          type_contenu: 'cours',
          nom: c.titre,
          type: c.type,
          lien_telechargement: `/uploads/${c.cheminFichier}`,
          taille_octets: c.tailleFichier,
          taille_lisible: formatTaille(c.tailleFichier),
          niveau: c.ue.niveau,
          filiere_code: c.ue.filiere.code,
          filiere_nom: c.ue.filiere.nom,
          code_ue: c.ue.code,
          intitule_ue: c.ue.intitule,
        });
      }
    });

    // Ajouter les sujets formatés
    sujets.forEach(s => {
      // Vérifier que l'UE a été trouvée (pour les filtres appliqués)
      if (s.ue && s.ue.filiere) {
        documents.push({
          id: s.id,
          type_contenu: 'sujet_examen',
          nom: s.titre,
          type: s.type,
          lien_telechargement: `/uploads/${s.cheminFichier}`,
          taille_octets: null,
          taille_lisible: 'Non disponible',
          niveau: s.ue.niveau,
          filiere_code: s.ue.filiere.code,
          filiere_nom: s.ue.filiere.nom,
          code_ue: s.ue.code,
          intitule_ue: s.ue.intitule,
          annee: s.annee,
        });
      }
    });

    // Trier par date de création décroissante
    documents.sort((a, b) => {
      // Les cours en premier, puis les sujets
      if (a.type_contenu !== b.type_contenu) {
        return a.type_contenu === 'cours' ? -1 : 1;
      }
      return 0;
    });

    if (documents.length === 0) {
      return success(res, [], `Aucun document trouvé pour "${nom}"`);
    }

    return success(res, {
      nombre_resultats: documents.length,
      documents: documents,
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  Utilitaire : formatter la taille du fichier en lisible (Ko, Mo, Go)
// ──────────────────────────────────────────────────────────────────
const formatTaille = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = { rechercher, rechercherDocuments };