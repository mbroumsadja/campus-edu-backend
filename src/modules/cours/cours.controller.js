// src/modules/cours/cours.controller.js

const { Cours, UE, Utilisateur, Filiere, Telechargement, CoursDocument } = require('../../models');
const { Op } = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const { downloadStoredFile, deleteStoredFile } = require('../../middlewares/upload');

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
          as: 'fichiers',
          attributes: ['id', 'nomFichierOriginal', 'tailleFichier'],
        }
      ],
      attributes: { exclude: ['cheminFichier'] }, // Ne pas exposer le chemin réel
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true, // Nécessaire avec findAndCountAll + include
    });

    return paginated(res, rows, count, page, limit);
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
        { model: CoursDocument, as: 'fichiers', attributes: ['id', 'nomFichierOriginal', 'tailleFichier'] }
      ],
      attributes: { exclude: ['cheminFichier'] },
    });

    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie' && req.user.role === 'etudiant') {
      return error(res, 'Ce cours n\'est pas disponible.', 403);
    }

    // Incrémenter le compteur de vues (sans bloquer la réponse)
    cours.increment('vues').catch(() => { });

    return success(res, cours);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours/:id/telecharger
//  Renvoie le fichier avec un nom propre + incrémente compteur
// ──────────────────────────────────────────────────────────────────
const telechargerCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, {
      attributes: ['id', 'titre', 'cheminFichier', 'nomFichierOriginal', 'statut'],
    });

    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie') return error(res, 'Cours non disponible.', 403);

    cours.increment('telechargemments').catch(() => { }); // vérifie le nom exact du champ en base

    if (req.user) {
      Telechargement.create({
        utilisateur_id: req.user.id,
        cours_id: cours.id,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.get('User-Agent'),
      }).catch(() => { });
    }

    const ext = (cours.nomFichierOriginal || '').includes('.') ? '' : '.pdf';
    const fallback = `cours_${cours.id}${ext}`;

    return await downloadStoredFile(res, cours.cheminFichier, cours.nomFichierOriginal || fallback);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /cours — Enseignant ou Admin seulement
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

    // Flux "client upload" : le navigateur a déjà envoyé les fichiers
    // directement à Vercel Blob (voir /api/upload/client-token) pour
    // contourner la limite de 4,5 Mo par requête sur Vercel Functions.
    // Le body JSON contient alors un tableau `fichiers` avec les blobs
    // déjà uploadés, au lieu de fichiers multipart.
    if (Array.isArray(req.body?.fichiers)) {
      req.body.fichiers.forEach((f) => {
        if (!f?.url) return;
        uploadedFiles.push({
          url: f.url,
          originalname: f.nomFichierOriginal || f.pathname || 'document',
          size: f.tailleFichier || f.size || null,
        });
      });
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

const documents = uploadedFiles.map((file) => ({
      cours_id: cours.id,
      cheminFichier: file.path || file.url,
      nomFichierOriginal: file.originalname,
      tailleFichier: file.size,
    }));
    await CoursDocument.bulkCreate(documents);

    return created(res, cours, 'Cours déposé avec succès. En attente de validation.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PUT /cours/:id — Son créateur ou un admin
// ──────────────────────────────────────────────────────────────────
const modifierCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id);
    if (!cours) return error(res, 'Cours introuvable.', 404);

    const { titre, description, type, ue_id, anneAcademique } = req.body;
    const updates = {};

    if (typeof titre !== 'undefined') {
      const cleanedTitre = String(titre).trim();
      if (!cleanedTitre) return error(res, 'Le titre est obligatoire.', 400);
      updates.titre = cleanedTitre;
    }
    if (typeof description !== 'undefined') updates.description = description;
    if (typeof type !== 'undefined') updates.type = type;
    if (typeof anneAcademique !== 'undefined') {
      updates.anneAcademique = anneAcademique;
    }
    if (typeof ue_id !== 'undefined') {
      const ue = await UE.findByPk(ue_id);
      if (!ue) return error(res, 'Unité d\'enseignement introuvable.', 404);
      updates.ue_id = ue_id;
    }

    // Gestion des fichiers uploadés : champ 'main' remplace le fichier principal
    // et 'documents' ajoute des fichiers rattachés.
    // Les fichiers peuvent aussi être fournis via req.body.fichiers (tableau d'objets { url, nomFichierOriginal, tailleFichier }).
    const uploadedMain = req.files?.main?.[0] ?? null;
    const uploadedDocs = (req.files?.documents && Array.isArray(req.files.documents)) ? req.files.documents : [];

    // Si un nouveau main est envoyé, supprimer l'ancien stockage et mettre à jour les champs
    if (uploadedMain) {
      // supprimer l'ancien fichier stocké (s'il existe)
      await deleteStoredFile(cours.cheminFichier).catch(() => {});
      updates.cheminFichier = uploadedMain.path || uploadedMain.url || null;
      updates.nomFichierOriginal = uploadedMain.originalname || uploadedMain.filename || null;
      updates.tailleFichier = uploadedMain.size || null;
    }

    // Créer des documents supplémentaires si fournis
    const newDocuments = [];
    if (Array.isArray(req.body?.fichiers)) {
      req.body.fichiers.forEach((f) => {
        if (!f?.url) return;
        newDocuments.push({
          cours_id: cours.id,
          cheminFichier: f.url,
          nomFichierOriginal: f.nomFichierOriginal || f.pathname || 'document',
          tailleFichier: f.tailleFichier || f.size || null,
        });
      });
    }

    if (uploadedDocs.length) {
      uploadedDocs.forEach((file) => {
        newDocuments.push({
          cours_id: cours.id,
          cheminFichier: file.path || file.url,
          nomFichierOriginal: file.originalname || file.filename,
          tailleFichier: file.size || null,
        });
      });
    }

    // Appliquer mises à jour de métadonnées
    if (Object.keys(updates).length > 0) {
      await cours.update(updates);
    }

    if (newDocuments.length > 0) {
      await CoursDocument.bulkCreate(newDocuments);
    }

    if (req.user.role === 'enseignant') {
      await cours.update({ statut: 'en_attente' });
    }

    const refreshed = await Cours.findByPk(cours.id, { include: [{ model: CoursDocument, as: 'fichiers' }] });
    return success(res, refreshed, 'Cours modifié avec succès.');
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
//  DELETE /cours/:id — Son créateur ou un admin
// ──────────────────────────────────────────────────────────────────
const supprimerCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, { include: [{ model: CoursDocument, as: 'fichiers' }] });
    if (!cours) return error(res, 'Cours introuvable.', 404);

    // Supprimer fichier principal depuis le stockage (local ou distant)
    if (cours.cheminFichier) {
      await deleteStoredFile(cours.cheminFichier).catch(() => {});
    }

    // Supprimer chaque document rattaché du stockage
    for (const doc of (cours.fichiers || [])) {
      if (doc.cheminFichier) await deleteStoredFile(doc.cheminFichier).catch(() => {});
    }

    // Supprimer les enregistrements associés
    await CoursDocument.destroy({ where: { cours_id: cours.id } });
    await cours.destroy();
    return success(res, {}, 'Cours supprimé.');
  } catch (err) {
    next(err);
  }
};

const telechargerDocument = async (req, res, next) => {
  try {
    const { coursId, documentId } = req.params;

    const cours = await Cours.findByPk(coursId, { attributes: ['id', 'statut'] });
    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie') return error(res, 'Cours non disponible.', 403);

    const document = await CoursDocument.findOne({ where: { id: documentId, cours_id: coursId } });
    if (!document) return error(res, 'Document introuvable.', 404);

    cours.increment('telechargemements').catch(() => { });

    if (req.user) {
      Telechargement.create({
        utilisateur_id: req.user.id,
        cours_id: cours.id,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.get('User-Agent'),
      }).catch(() => { });
    }

    const ext = (document.nomFichierOriginal || '').includes('.') ? '' : '.pdf';
    const fallback = `cours_${cours.id}_doc_${document.id}${ext}`;

    return await downloadStoredFile(res, document.cheminFichier, document.nomFichierOriginal || fallback);
  } catch (err) {
    next(err);
  }
};

module.exports = { listerCours, getCours, telechargerCours, telechargerDocument, creerCours, modifierCours, changerStatut, supprimerCours };
