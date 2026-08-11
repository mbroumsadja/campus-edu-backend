// src/modules/cours/cours.controller.js

const { Cours, UE, Utilisateur, Filiere, Telechargement, CoursDocument } = require('../../models');
const { Op } = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const { downloadStoredFile, deleteStoredFile } = require('../../middlewares/upload');

// ──────────────────────────────────────────────────────────────────
//  Helper : fusionne le fichier principal du cours + les documents
//  additionnels (table CoursDocument) en un tableau unique 'fichiers'
//  Le fichier principal utilise l'id sentinelle 0 (jamais pris par un
//  vrai cours ni un vrai CoursDocument, AUTO_INCREMENT démarrant à 1)
//  pour le distinguer sans ambiguïté des documents additionnels côté
//  téléchargement — réutiliser cours.id créait des collisions avec
//  des CoursDocument.id d'autres cours.
// ──────────────────────────────────────────────────────────────────
const withFichiers = (coursInstance) => {
  const plain = coursInstance.toJSON();
  const fichiers = [
    {
      id: 0,
      nomFichierOriginal: plain.nomFichierOriginal,
      tailleFichier: plain.tailleFichier,
    },
    ...(plain.documents || []),
  ];
  delete plain.documents;
  delete plain.nomFichierOriginal;
  delete plain.tailleFichier;
  return { ...plain, fichiers };
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours
//  Accessible aux étudiants : filtrés automatiquement par filière + niveau
//  Query params: ue_id, type, annee, page, limit, search
// ──────────────────────────────────────────────────────────────────
const listerCours = async (req, res, next) => {
  try {
    const { ue_id, type, annee, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Construire le WHERE selon le rôle
    const where = { statut: 'publie' };

    if (ue_id) where.ue_id = ue_id;
    if (type) where.type = type;
    if (annee) where.anneAcademique = annee;
    if (search) where.titre = { [Op.like]: `%${search}%` };

    // Pour un étudiant : restreindre aux cours de sa filière/niveau
    const includeUE = {
      model: UE,
      as: 'ue',
      attributes: ['id', 'code', 'intitule', 'niveau', 'semestre'],
      include: [{
        model: Filiere,
        as: 'filiere',
        attributes: ['id', 'nom', 'code'],
      }],
    };

    if (req.user.role === 'etudiant') {
      includeUE.where = {
        filiere_id: req.user.filiere_id,
        niveau: req.user.niveau,
      };
    }

    const { count, rows } = await Cours.findAndCountAll({
      where,
      include: [
        includeUE,
        {
          model: Utilisateur,
          as: 'enseignant',
          attributes: ['id', 'nom', 'prenom', 'matricule'],
        },
        {
          model: CoursDocument,
          as: 'documents',
          attributes: ['id', 'nomFichierOriginal', 'tailleFichier', 'ordre'],
        },
      ],
      attributes: { exclude: ['cheminFichier'] }, // Ne pas exposer le chemin réel
      order: [['createdAt', 'DESC'], [{ model: CoursDocument, as: 'documents' }, 'ordre', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true, // Nécessaire avec findAndCountAll + include
    });

    const data = rows.map(withFichiers);

    return paginated(res, data, count, page, limit);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours/:id
// ──────────────────────────────────────────────────────────────────
const getCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, {
      include: [
        { model: UE, as: 'ue', include: [{ model: Filiere, as: 'filiere' }] },
        { model: Utilisateur, as: 'enseignant', attributes: ['id', 'nom', 'prenom'] },
        { model: CoursDocument, as: 'documents', attributes: ['id', 'nomFichierOriginal', 'tailleFichier'] },
      ],
      attributes: { exclude: ['cheminFichier','ordre'] },
      order: [[{ model: CoursDocument, as: 'documents' }, 'ordre', 'ASC']],
    });

    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie' && req.user.role === 'etudiant') {
      return error(res, 'Ce cours n\'est pas disponible.', 403);
    }

    // Incrémenter le compteur de vues (sans bloquer la réponse)
    cours.increment('vues').catch(() => { });

    return success(res, withFichiers(cours));
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours/:coursId/documents/:documentId/telecharger
//  documentId === '0' → fichier principal du cours
//  documentId != '0'   → document additionnel (table CoursDocument)
//  Renvoie le fichier avec un nom propre + incrémente compteur
// ──────────────────────────────────────────────────────────────────
const telechargerDocument = async (req, res, next) => {
  try {
    const { coursId, documentId } = req.params;

    const cours = await Cours.findByPk(coursId, {
      attributes: ['id', 'titre', 'cheminFichier', 'nomFichierOriginal', 'statut'],
    });

    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie' && req.user?.role === 'etudiant') {
      return error(res, 'Cours non disponible.', 403);
    }

    let cheminFichier, nomFichier;

    // documentId === '0' → fichier principal du cours (voir withFichiers)
    if (String(documentId) === '0') {
      // Téléchargement du fichier principal du cours
      cheminFichier = cours.cheminFichier;
      nomFichier = cours.nomFichierOriginal;
    } else {
      // Téléchargement d'un document additionnel
      const doc = await CoursDocument.findOne({
        where: { id: documentId, cours_id: coursId },
        attributes: ['cheminFichier', 'nomFichierOriginal'],
      });
      if (!doc) return error(res, 'Document introuvable.', 404);
      cheminFichier = doc.cheminFichier;
      nomFichier = doc.nomFichierOriginal;
    }

    // Nom exact du champ en base : 'telechargemements' (voir models/index.js)
    cours.increment('telechargements').catch(() => { });

    if (req.user) {
      Telechargement.create({
        utilisateur_id: req.user.id,
        cours_id: cours.id,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.get('User-Agent'),
      }).catch(() => { });
    }

    const ext = (nomFichier || '').includes('.') ? '' : '.pdf';
    const fallback = `cours_${cours.id}${ext}`;

    return await downloadStoredFile(res, cheminFichier, nomFichier || fallback);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /cours — Enseignant ou Admin seulement
//  Accepte plusieurs fichiers (upload.array('fichiers', N)) :
//    - le 1er fichier devient le fichier principal du Cours
//    - les suivants sont enregistrés dans CoursDocument
// ──────────────────────────────────────────────────────────────────
const creerCours = async (req, res, next) => {
  try {
    const uploadedFiles = [];
    if (req.file) uploadedFiles.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) {
        uploadedFiles.push(...req.files);
      } else {
        Object.values(req.files).forEach((fileGroup) => {
          if (Array.isArray(fileGroup)) uploadedFiles.push(...fileGroup);
        });
      }
    }

    if (uploadedFiles.length === 0) {
      return error(res, 'Aucun fichier fourni.', 400);
    }

    const { titre, description, type, ue_id, anneAcademique } = req.body;

    const ue = await UE.findByPk(ue_id);
    if (!ue) return error(res, 'Unité d\'enseignement introuvable.', 404);

    if (req.user.role === 'enseignant') {
      const enseignant = await Utilisateur.findByPk(req.user.id, { attributes: ['filiere_id'] });
      if (ue.filiere_id !== enseignant.filiere_id) {
        return error(res, 'Vous ne pouvez déposer des cours que dans votre filière.', 403);
      }
    }

    const cours = await Cours.create({
      titre,
      description,
      type: type || 'pdf',
      ue_id,
      enseignant_id: req.user.id,
      cheminFichier: uploadedFiles[0]?.path || uploadedFiles[0]?.url || null,
      nomFichierOriginal: uploadedFiles[0]?.originalname,
      tailleFichier: uploadedFiles[0]?.size,
      anneAcademique: anneAcademique || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      statut: req.user.role === 'admin' ? 'publie' : 'en_attente',
    });

    // Fichiers additionnels (2e, 3e, ...) → table CoursDocument
    if (uploadedFiles.length > 1) {
      // localiser le bloc qui construit "documents" pour bulkCreate
      const documents = fichiersAdditionnels.map((f, index) => ({
        cours_id: cours.id,
        ordre: index,        // ← ajouter cette ligne
        cheminFichier: f.cheminFichier,
        nomFichierOriginal: f.originalname,
        tailleFichier: f.size,
      }));
      await CoursDocument.bulkCreate(documents);
      await CoursDocument.bulkCreate(documents);
    }

    return created(res, cours, 'Cours déposé avec succès. En attente de validation.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PATCH /cours/:id/statut — Admin seulement (valider / archiver)
// ──────────────────────────────────────────────────────────────────
const changerStatut = async (req, res, next) => {
  try {
    const { statut } = req.body;
    const cours = await Cours.findByPk(req.params.id);
    if (!cours) return error(res, 'Cours introuvable.', 404);

    await cours.update({ statut });
    return success(res, cours, `Cours ${statut} avec succès.`);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  DELETE /cours/:id — Admin seulement
//  Supprime le fichier principal + tous les documents additionnels
//  (fichiers physiques/Blob + lignes CoursDocument)
// ──────────────────────────────────────────────────────────────────
const supprimerCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, {
      include: [{ model: CoursDocument, as: 'documents' }],
    });
    if (!cours) return error(res, 'Cours introuvable.', 404);

    await deleteStoredFile(cours.cheminFichier);
    await Promise.all(
      (cours.documents || []).map((doc) => deleteStoredFile(doc.cheminFichier))
    );

    // Si l'association a onDelete: 'CASCADE', les CoursDocument sont
    // supprimés automatiquement ; sinon, les supprimer explicitement :
    await CoursDocument.destroy({ where: { cours_id: cours.id } });

    await cours.destroy();
    return success(res, {}, 'Cours supprimé.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listerCours,
  getCours,
  telechargerDocument,
  creerCours,
  changerStatut,
  supprimerCours,
};