// src/modules/cours/cours.controller.js

const { bump } = require('../../utils/audit');
const { compterTelechargement, memoriserTelechargement } = require('../../utils/stats');
const { chercherDoublons, estSha256, normaliserSha } = require('../../utils/doublons');
const { sequelize, Cours, UE, Utilisateur, Filiere, Telechargement, CoursDocument } = require('../../models');
const { supprimerFichierSiOrphelin } = require('../../utils/fichiersPartages');
const { Op } = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const { downloadStoredFile } = require('../../middlewares/upload');
const { isTrustedFileUrl } = require('../../utils/fileUrl');
const { estAdmin } = require('../../utils/roles');
const { cleanFileName } = require('../../utils/fileName');
const { containsText } = require('../../utils/searchText');

// Liste d'identifiants d'UE (tableau JSON ou chaîne JSON), sans doublon
const lireUeIds = (valeur) => {
  let liste = valeur;
  if (typeof liste === 'string') {
    try { liste = JSON.parse(liste); } catch (_e) { return []; }
  }
  if (!Array.isArray(liste)) return [];
  return [...new Set(liste.map(Number).filter(Number.isInteger))];
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
    if (search) where[Op.and] = [...(where[Op.and] || []), containsText('Cours.titre', search)];

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
      distinct: true,
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

    // Incrémenter le compteur de vues
    await bump(cours, 'vues');

    return success(res, cours);
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
          originalname: cleanFileName(f.nomFichierOriginal || f.pathname) || 'document',
          size: f.tailleFichier || f.size || null,
          sha256: estSha256(f.sha256) ? normaliserSha(f.sha256) : null,
        });
      });
    }

    if (uploadedFiles.length === 0) {
      return error(res, 'Aucun fichier fourni.', 400);
    }

    // Anti-SSRF : les URL fournies par le client doivent pointer vers Vercel Blob
    if (uploadedFiles.some((f) => f.url && !isTrustedFileUrl(f.url))) {
      return error(res, 'URL de fichier non autorisée.', 400);
    }

    // Doublons : un même fichier ne peut pas être déposé deux fois (empreinte fournie par le client)
    const shas = uploadedFiles.map((f) => f.sha256).filter(Boolean);
    if (shas.length) {
      const dejaLa = await chercherDoublons(shas);
      const premier = Object.values(dejaLa).flat()[0];
      if (premier) {
        return error(res, `Ce fichier existe déjà (${premier.type} #${premier.id} : ${premier.titre}).`, 409);
      }
    }

    const { titre, description, type, ue_id, anneAcademique } = req.body;

    // Tronc commun : le même cours est copié dans plusieurs UE (une par filière),
    // toutes les copies pointent vers les mêmes fichiers. Réservé à l'admin.
    const ueIdsDemandes = lireUeIds(req.body.ue_ids);
    const troncCommun = ueIdsDemandes.length > 0;

    if (troncCommun && !estAdmin(req.user)) {
      return error(res, 'Seul un administrateur peut enregistrer un cours en tronc commun.', 403);
    }

    const idsVoulus = troncCommun ? ueIdsDemandes : [Number(ue_id)];
    const uesTrouvees = await UE.findAll({ where: { id: idsVoulus } });
    const uesParId = new Map(uesTrouvees.map((u) => [u.id, u]));
    const introuvables = idsVoulus.filter((id) => !uesParId.has(id));
    if (introuvables.length) {
      return error(
        res,
        troncCommun
          ? `Unité(s) d'enseignement introuvable(s) : ${introuvables.join(', ')}.`
          : 'Unité d\'enseignement introuvable.',
        404
      );
    }
    const ues = idsVoulus.map((id) => uesParId.get(id));
    const ue = ues[0];

    if (req.user.role === 'enseignant') {
      const enseignant = await Utilisateur.findByPk(req.user.id, { attributes: ['filiere_id'] });
      if (ue.filiere_id !== enseignant.filiere_id) {
        return error(res, 'Vous ne pouvez déposer des cours que dans votre filière.', 403);
      }
    }

    // Tout ou rien : si une copie échoue, aucune n'est enregistrée.
    const copies = await sequelize.transaction(async (transaction) => {
      const creees = [];
      for (const ueCible of ues) {
        const cours = await Cours.create({
          titre,
          description,
          type: type || 'pdf',
          ue_id: ueCible.id,
          enseignant_id: req.user.id,
          cheminFichier: uploadedFiles[0]?.path || uploadedFiles[0]?.url || null,
          nomFichierOriginal: uploadedFiles[0]?.originalname,
          tailleFichier: uploadedFiles[0]?.size,
          anneAcademique: anneAcademique || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          statut: estAdmin(req.user) ? 'publie' : 'en_attente',
        }, { transaction });

        await CoursDocument.bulkCreate(uploadedFiles.map((file) => ({
          cours_id: cours.id,
          cheminFichier: file.path || file.url,
          nomFichierOriginal: cleanFileName(file.originalname),
          tailleFichier: file.size,
          sha256: file.sha256 || null,
        })), { transaction });

        creees.push(cours);
      }
      return creees;
    });

    if (troncCommun) {
      return created(
        res,
        { cours: copies, total: copies.length },
        `Cours enregistré dans ${copies.length} unité${copies.length > 1 ? 's' : ''} d'enseignement.`
      );
    }

    return created(res, copies[0], 'Cours déposé avec succès. En attente de validation.');
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
      // supprimer l'ancien fichier stocké (s'il existe), sauf s'il est partagé avec une autre copie
      await supprimerFichierSiOrphelin(cours.cheminFichier, { sauf: { coursId: cours.id } });
      updates.cheminFichier = uploadedMain.path || uploadedMain.url || null;
      updates.nomFichierOriginal = uploadedMain.originalname || uploadedMain.filename || null;
      updates.tailleFichier = uploadedMain.size || null;
    }

    // Créer des documents supplémentaires si fournis
    const newDocuments = [];
    if (Array.isArray(req.body?.fichiers)) {
      if (req.body.fichiers.some((f) => f?.url && !isTrustedFileUrl(f.url))) {
        return error(res, 'URL de fichier non autorisée.', 400);
      }
      req.body.fichiers.forEach((f) => {
        if (!f?.url) return;
        newDocuments.push({
          cours_id: cours.id,
          cheminFichier: f.url,
          nomFichierOriginal: cleanFileName(f.nomFichierOriginal || f.pathname) || 'document',
          tailleFichier: f.tailleFichier || f.size || null,
        });
      });
    }

    if (uploadedDocs.length) {
      uploadedDocs.forEach((file) => {
        newDocuments.push({
          cours_id: cours.id,
          cheminFichier: file.path || file.url,
          nomFichierOriginal: cleanFileName(file.originalname || file.filename),
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

    // Supprimer les fichiers du stockage (local ou distant) — sauf ceux encore utilisés
    // par une autre copie (tronc commun : plusieurs cours partagent les mêmes fichiers).
    const chemins = new Set([
      cours.cheminFichier,
      ...(cours.fichiers || []).map((doc) => doc.cheminFichier),
    ].filter(Boolean));
    for (const chemin of chemins) {
      await supprimerFichierSiOrphelin(chemin, { sauf: { coursId: cours.id } });
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

    await bump(cours, 'telechargemements');
    await compterTelechargement('cours', cours.id);

    if (req.user) {
      await memoriserTelechargement(Telechargement, {
        utilisateur_id: req.user.id,
        cours_id: cours.id,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.get('User-Agent'),
      });
    }

    const ext = (document.nomFichierOriginal || '').includes('.') ? '' : '.pdf';
    const fallback = `cours_${cours.id}_doc_${document.id}${ext}`;

    return await downloadStoredFile(res, document.cheminFichier, document.nomFichierOriginal || fallback);
  } catch (err) {
    next(err);
  }
};

module.exports = { listerCours, getCours, telechargerDocument, creerCours, modifierCours, changerStatut, supprimerCours };
