// src/modules/search/search.controller.js
const { Cours, Sujet, UE, Filiere, Utilisateur } = require('../../models');
const { Op }          = require('sequelize');
const { success, error } = require('../../utils/apiResponse');
const path            = require('path');

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
    const { nom, q, niveau, filiere, type } = req.query;
    const searchTerm = (nom || q || '').trim();

    // Validation : le paramètre 'nom' ou 'q' est requis
    if (!searchTerm) {
      return error(res, 'Le paramètre "nom" ou "q" est requis pour rechercher des documents.', 400);
    }

    // Construire la condition WHERE pour la recherche par nom
    const searchCondition = {
      [Op.iLike]: `%${searchTerm}%`
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
      required: Boolean(niveau || filiere),
      attributes: ['id', 'code', 'intitule', 'niveau'],
      include: [{
        model: Filiere,
        as: 'filiere',
        where: Object.keys(filiereWhere).length > 0 ? filiereWhere : undefined,
        required: Boolean(filiere),
        attributes: ['id', 'code', 'nom'],
      }],
    };

    // Recherche dans les Cours publiés
    const coursWhere = { 
      statut: 'publie',
      [Op.or]: [
        { titre: searchCondition },
        { nomFichierOriginal: searchCondition },
        { '$ue.intitule$': searchCondition },
        { '$ue.code$': searchCondition },
      ],
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
          lien_telechargement: `/api/search/documents/telecharger?type=cours&id=${c.id}`,
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
          lien_telechargement: `/api/search/documents/telecharger?type=sujet&id=${s.id}`,
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
      return success(res, [], `Aucun document trouvé pour "${nom || q}"`);
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
//  GET /api/search/documents/telecharger
//  Public — téléchargement de documents sans JWT
// ──────────────────────────────────────────────────────────────────
const telechargerDocument = async (req, res, next) => {
  try {
    const { type, id, corrige } = req.query;
    if (!type || !id) {
      return error(res, 'Les paramètres "type" et "id" sont requis pour le téléchargement.', 400);
    }

    const documentId = parseInt(id, 10);
    if (Number.isNaN(documentId)) {
      return error(res, 'ID invalide.', 400);
    }

    if (type === 'cours') {
      const cours = await Cours.findByPk(documentId, {
        attributes: ['id', 'titre', 'cheminFichier', 'nomFichierOriginal', 'statut'],
      });

      if (!cours || cours.statut !== 'publie') {
        return error(res, 'Cours non disponible.', 404);
      }

      const filePath = path.resolve(cours.cheminFichier);
      cours.increment('telechargemements').catch(() => {});

      const ext = path.extname(cours.cheminFichier) || '.pdf';
      const fallback = `${cours.titre.replace(/\s+/g, '_')}${ext}`;
      return res.download(filePath, cours.nomFichierOriginal || fallback);
    }

    if (type === 'sujet') {
      const sujet = await Sujet.findByPk(documentId, {
        attributes: ['id', 'titre', 'cheminFichier', 'cheminCorrige', 'statut', 'avecCorrige'],
      });

      if (!sujet || sujet.statut !== 'publie') {
        return error(res, 'Sujet non disponible.', 404);
      }

      const useCorrige = corrige === 'true';
      if (useCorrige) {
        if (!sujet.avecCorrige || !sujet.cheminCorrige) {
          return error(res, 'Aucun corrigé disponible pour ce sujet.', 404);
        }
      }

      const filePath = path.resolve(useCorrige ? sujet.cheminCorrige : sujet.cheminFichier);
      const fileName = useCorrige
        ? `corrige_${sujet.titre.replace(/\s+/g, '_')}.pdf`
        : `sujet_${sujet.titre.replace(/\s+/g, '_')}.pdf`;

      sujet.increment('telechargemements').catch(() => {});
      return res.download(filePath, fileName);
    }

    return error(res, 'Type invalide. Utilisez "cours" ou "sujet".', 400);
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

module.exports = { rechercherDocuments, telechargerDocument };