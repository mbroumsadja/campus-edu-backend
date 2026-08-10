// src/modules/search/search.controller.js
const { Cours, Sujet, UE, Filiere, Ecole, Telechargement } = require('../../models');
const { Op } = require('sequelize');
const { success, error } = require('../../utils/apiResponse');
const { downloadStoredFile } = require('../../middlewares/upload');

// ──────────────────────────────────────────────────────────────────
//  GET /api/search/documents
//  Public — recherche de documents (Cours + Sujets d'examen)
//  Query:
//    - nom ou q (requis) : texte à rechercher
//    - niveau (optionnel) : L1, L2, L3, M1, M2
//    - filiere (optionnel) : code de la filière (ex: INFO, MATH)
//    - filiere_id (optionnel) : identifiant de la filière
//    - ecole (optionnel) : nom de l'école
//    - ecole_id (optionnel) : identifiant de l'école
//    - annee (optionnel) : année académique ou année de sujet
//    - type (optionnel) : pdf, video, slide, autre, partiel, rattrapage, terminal, tp, td
//  Retourne : liste de documents avec lien de téléchargement, type, niveau, filière, école, code UE
// ──────────────────────────────────────────────────────────────────
const rechercherDocuments = async (req, res, next) => {
  try {
    const {
      nom, q,
      niveau, semestre,
      ue, ue_id,
      filiere, filiere_id,
      ecole, ecole_id,
      type, annee,
    } = req.query;

    const searchTerm = (nom || q || '').trim();
    const hasFilters = Boolean(
      niveau || semestre || ue || ue_id ||
      filiere || filiere_id || ecole || ecole_id ||
      type || annee
    );

    if (!searchTerm && !hasFilters) {
      return error(res, 'Fournissez un terme de recherche ou au moins un filtre.', 400);
    }

    const searchCondition = searchTerm ? { [Op.like]: `%${searchTerm}%` } : undefined;

    const ueWhere = {};
    const filiereWhere = {};
    const ecoleWhere = {};

    if (niveau) ueWhere.niveau = niveau;
    if (semestre) ueWhere.semestre = semestre;
    if (ue) {
      const normalizedUE = String(ue).trim();
      ueWhere[Op.or] = [
        { code: { [Op.like]: `%${normalizedUE}%` } },
        { intitule: { [Op.like]: `%${normalizedUE}%` } },
      ];
    }
    if (ue_id) ueWhere.id = Number(ue_id);

    if (filiere) {
      const normalizedFiliere = String(filiere).trim();
      filiereWhere[Op.or] = [
        { code: { [Op.like]: normalizedFiliere } },
        { nom: { [Op.like]: normalizedFiliere } },
      ];
    }
    if (filiere_id) filiereWhere.id = Number(filiere_id);
    if (ecole) ecoleWhere.ecole = ecole;
    if (ecole_id) ecoleWhere.id = Number(ecole_id);

    const includeEcole = {
      model: Ecole,
      as: 'ecole',
      where: Object.keys(ecoleWhere).length > 0 ? ecoleWhere : undefined,
      required: Boolean(ecole || ecole_id),
      attributes: ['id', 'ecole'],
    };

    const includeFiliere = {
      model: Filiere,
      as: 'filiere',
      where: Object.keys(filiereWhere).length > 0 ? filiereWhere : undefined,
      required: Boolean(filiere || filiere_id || ecole || ecole_id),
      attributes: ['id', 'code', 'nom'],
      include: [includeEcole],
    };

    const includeUE = {
      model: UE,
      as: 'ue',
      where: Object.keys(ueWhere).length > 0 ? ueWhere : undefined,
      required: Boolean(
        niveau || semestre || ue || ue_id ||
        filiere || filiere_id || ecole || ecole_id
      ),
      attributes: ['id', 'code', 'intitule', 'niveau', 'semestre'],
      include: [includeFiliere],
    };

    const coursWhere = {
      statut: 'publie',
    };

    const sujetWhere = {
      statut: 'publie',
    };

    if (searchCondition) {
      coursWhere[Op.or] = [
        { titre: searchCondition },
        { nomFichierOriginal: searchCondition },
        { '$ue.intitule$': searchCondition },
        { '$ue.code$': searchCondition },
        { '$ue.filiere.code$': searchCondition },
        { '$ue.filiere.nom$': searchCondition },
        { '$ue.filiere.ecole.ecole$': searchCondition },
      ];

      sujetWhere[Op.or] = [
        { titre: searchCondition },
        { '$ue.intitule$': searchCondition },
        { '$ue.code$': searchCondition },
        { '$ue.filiere.code$': searchCondition },
        { '$ue.filiere.nom$': searchCondition },
        { '$ue.filiere.ecole.ecole$': searchCondition },
      ];
    }

    if (type) {
      coursWhere.type = type;
      sujetWhere.type = type;
    }

    if (annee) {
      coursWhere.anneAcademique = annee;
      const parsedYear = parseInt(annee, 10);
      if (!Number.isNaN(parsedYear)) {
        sujetWhere.annee = parsedYear;
      }
    }

    const cours = await Cours.findAll({
      where: coursWhere,
      include: [includeUE],
      attributes: ['id', 'titre', 'type', 'cheminFichier', 'tailleFichier', 'nomFichierOriginal', 'anneAcademique', 'telechargemements'],
      order: [['createdAt', 'DESC']],
    });

    const sujets = await Sujet.findAll({
      where: sujetWhere,
      include: [includeUE],
      attributes: ['id', 'titre', 'type', 'cheminFichier', 'annee', 'telechargemements'],
      order: [['annee', 'DESC']],
    });

    const documents = [];
    const downloadedCourseIds = new Set();
    if (req.user) {
      const downloadedRows = await Telechargement.findAll({
        where: { utilisateur_id: req.user.id },
        attributes: ['cours_id'],
      });
      downloadedRows.forEach(row => downloadedCourseIds.add(row.cours_id));
    }

    cours.forEach(c => {
      if (c.ue && c.ue.filiere) {
        documents.push({
          id: c.id,
          type_contenu: 'cours',
          nom: c.titre,
          type: c.type,
          disponible: true,
          deja_telecharge: downloadedCourseIds.has(c.id),
          telechargements: c.telechargemements,
          lien_telechargement: `/api/search/documents/telecharger?type=cours&id=${c.id}`,
          taille_octets: c.tailleFichier,
          taille_lisible: formatTaille(c.tailleFichier),
          niveau: c.ue.niveau,
          semestre: c.ue.semestre,
          filiere_code: c.ue.filiere.code,
          filiere_nom: c.ue.filiere.nom,
          ecole_nom: c.ue.filiere.ecole ? c.ue.filiere.ecole.ecole : null,
          code_ue: c.ue.code,
          intitule_ue: c.ue.intitule,
          annee_academique: c.anneAcademique || null,
        });
      }
    });

    sujets.forEach(s => {
      if (s.ue && s.ue.filiere) {
        documents.push({
          id: s.id,
          type_contenu: 'sujet_examen',
          nom: s.titre,
          type: s.type,
          disponible: true,
          deja_telecharge: false,
          telechargements: s.telechargemements,
          lien_telechargement: `/api/search/documents/telecharger?type=sujet&id=${s.id}`,
          taille_octets: null,
          taille_lisible: 'Non disponible',
          niveau: s.ue.niveau,
          semestre: s.ue.semestre,
          filiere_code: s.ue.filiere.code,
          filiere_nom: s.ue.filiere.nom,
          ecole_nom: s.ue.filiere.ecole ? s.ue.filiere.ecole.ecole : null,
          code_ue: s.ue.code,
          intitule_ue: s.ue.intitule,
          annee: s.annee,
        });
      }
    });

    documents.sort((a, b) => {
      if (a.type_contenu !== b.type_contenu) {
        return a.type_contenu === 'cours' ? -1 : 1;
      }
      return 0;
    });

    if (documents.length === 0) {
      return success(res, {
        nombre_resultats: 0,
        documents: [],
      }, `Aucun document trouvé pour "${nom || q}"`);
    }

    return success(res, {
      nombre_resultats: documents.length,
      documents,
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

      cours.increment('telechargemements').catch(() => {});

      if (req.user) {
        Telechargement.create({
          utilisateur_id: req.user.id,
          cours_id: cours.id,
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get('User-Agent'),
        }).catch(() => {});
      }

      const fallback = `${cours.titre.replace(/\s+/g, '_')}${path.extname(cours.nomFichierOriginal || '') || '.pdf'}`;
      return downloadStoredFile(res, cours.cheminFichier, cours.nomFichierOriginal || fallback);
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

      const storagePath = useCorrige ? sujet.cheminCorrige : sujet.cheminFichier;
      const fileName = useCorrige
        ? `corrige_${sujet.titre.replace(/\s+/g, '_')}.pdf`
        : `sujet_${sujet.titre.replace(/\s+/g, '_')}.pdf`;

      sujet.increment('telechargemements').catch(() => {});
      return downloadStoredFile(res, storagePath, fileName);
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