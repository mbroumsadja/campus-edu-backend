// src/modules/sujets/sujets.controller.js

const { Sujet, UE, Utilisateur, Filiere } = require('../../models');
const { Op }      = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const { downloadStoredFile, deleteStoredFile } = require('../../middlewares/upload');

// ──────────────────────────────────────────────────────────────────
//  GET /sujets
//  Filtrés automatiquement pour les étudiants (filière + niveau)
//  Query: ue_id, type, session, annee, page, limit, search
// ──────────────────────────────────────────────────────────────────
const listerSujets = async (req, res, next) => {
  try {
    const { ue_id, type, session, annee, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { statut: 'publie' };
    if (ue_id)   where.ue_id   = ue_id;
    if (type)    where.type    = type;
    if (session) where.session = session;
    if (annee)   where.annee   = parseInt(annee);
    if (search)  where.titre   = { [Op.like]: `%${search}%` };

    const includeUE = {
      model:      UE,
      as:         'ue',
      attributes: ['id', 'code', 'intitule', 'niveau', 'semestre'],
      include: [{ model: Filiere, as: 'filiere', attributes: ['id', 'nom', 'code'] }],
    };

    // Étudiant : seulement ses sujets (filière + niveau)
    if (req.user.role === 'etudiant') {
      includeUE.where = {
        filiere_id: req.user.filiere_id,
        niveau:     req.user.niveau,
      };
    }

    const { count, rows } = await Sujet.findAndCountAll({
      where,
      include: [
        includeUE,
        { model: Utilisateur, as: 'enseignant', attributes: ['id', 'nom', 'prenom'] },
      ],
      attributes: { exclude: ['cheminFichier', 'cheminCorrige'] },
      order: [['annee', 'DESC'], ['createdAt', 'DESC']],
      limit:  parseInt(limit),
      offset: parseInt(offset),
      distinct: true,
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /sujets/:id
// ──────────────────────────────────────────────────────────────────
const getSujet = async (req, res, next) => {
  try {
    const sujet = await Sujet.findByPk(req.params.id, {
      include: [
        { model: UE, as: 'ue', include: [{ model: Filiere, as: 'filiere' }] },
        { model: Utilisateur, as: 'enseignant', attributes: ['id', 'nom', 'prenom'] },
      ],
      attributes: { exclude: ['cheminFichier', 'cheminCorrige'] },
    });

    if (!sujet) return error(res, 'Sujet introuvable.', 404);
    return success(res, sujet);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /sujets/:id/telecharger?corrige=true
// ──────────────────────────────────────────────────────────────────
const telechargerSujet = async (req, res, next) => {
  try {
    const sujet = await Sujet.findByPk(req.params.id);
    if (!sujet || sujet.statut !== 'publie') return error(res, 'Sujet non disponible.', 404);

    const avecCorrige = req.query.corrige === 'true';

    if (avecCorrige && !sujet.avecCorrige) {
      return error(res, 'Aucun corrigé disponible pour ce sujet.', 404);
    }

    const storagePath = avecCorrige ? sujet.cheminCorrige : sujet.cheminFichier;
    const fileName = avecCorrige
      ? `corrige_${sujet.titre.replace(/\s/g,'_')}.pdf`
      : `sujet_${sujet.titre.replace(/\s/g,'_')}.pdf`;

    sujet.increment('telechargemements').catch(() => {});
    return downloadStoredFile(res, storagePath, fileName);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /sujets — Enseignant ou Admin
// ──────────────────────────────────────────────────────────────────
const creerSujet = async (req, res, next) => {
  try {
    let fichierSujet   = req.files?.sujet?.[0];
    let fichierCorrige = req.files?.corrige?.[0];

    // Flux "client upload" : fichiers déjà envoyés directement à Vercel
    // Blob depuis le navigateur (voir /api/upload/client-token), le
    // body JSON contient alors leurs métadonnées au lieu de multipart.
    if (!fichierSujet && req.body?.sujet?.url) {
      fichierSujet = { url: req.body.sujet.url, size: req.body.sujet.tailleFichier };
    }
    if (!fichierCorrige && req.body?.corrige?.url) {
      fichierCorrige = { url: req.body.corrige.url, size: req.body.corrige.tailleFichier };
    }

    if (!fichierSujet) return error(res, 'Le fichier sujet est obligatoire.', 400);

    const { titre, type, session, annee, ue_id } = req.body;

    const ue = await UE.findByPk(ue_id);
    if (!ue) return error(res, 'UE introuvable.', 404);

    const storedSujetPath = fichierSujet?.path || fichierSujet?.url || null;
    const storedCorrigePath = fichierCorrige?.path || fichierCorrige?.url || null;

    const sujet = await Sujet.create({
      titre,
      type,
      session,
      annee:         parseInt(annee),
      ue_id,
      enseignant_id: req.user.id,
      cheminFichier: storedSujetPath,
      avecCorrige:   !!fichierCorrige,
      cheminCorrige: storedCorrigePath,
      statut:        req.user.role === 'admin' ? 'publie' : 'en_attente',
    });

    return created(res, sujet, 'Sujet déposé avec succès.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PUT /sujets/:id — Son créateur ou un admin
// ──────────────────────────────────────────────────────────────────
const modifierSujet = async (req, res, next) => {
  try {
    const sujet = await Sujet.findByPk(req.params.id);
    if (!sujet) return error(res, 'Sujet introuvable.', 404);

    const { titre, type, session, annee, ue_id } = req.body;
    const updates = {};

    if (typeof titre !== 'undefined') {
      const cleanedTitre = String(titre).trim();
      if (!cleanedTitre) return error(res, 'Titre obligatoire.', 400);
      updates.titre = cleanedTitre;
    }
    if (typeof type !== 'undefined') updates.type = type;
    if (typeof session !== 'undefined') updates.session = session;
    if (typeof annee !== 'undefined') updates.annee = parseInt(annee, 10);
    if (typeof ue_id !== 'undefined') {
      const ue = await UE.findByPk(ue_id);
      if (!ue) return error(res, 'UE introuvable.', 404);
      updates.ue_id = ue_id;
    }

    // Fichiers uploadés
    const uploadedSujet = req.files?.sujet?.[0] ?? null;
    const uploadedCorrige = req.files?.corrige?.[0] ?? null;

    if (uploadedSujet) {
      // supprimer ancien fichier
      await deleteStoredFile(sujet.cheminFichier).catch(() => {});
      updates.cheminFichier = uploadedSujet.path || uploadedSujet.url || null;
    }
    if (uploadedCorrige) {
      await deleteStoredFile(sujet.cheminCorrige).catch(() => {});
      updates.cheminCorrige = uploadedCorrige.path || uploadedCorrige.url || null;
      updates.avecCorrige = true;
    }

    if (Object.keys(updates).length === 0) {
      return error(res, 'Aucune modification fournie.', 400);
    }

    await sujet.update(updates);
    if (req.user.role === 'enseignant') {
      await sujet.update({ statut: 'en_attente' });
    }

    const refreshed = await Sujet.findByPk(sujet.id);
    return success(res, refreshed, 'Sujet modifié avec succès.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PATCH /sujets/:id/statut — Admin
// ──────────────────────────────────────────────────────────────────
const changerStatut = async (req, res, next) => {
  try {
    const sujet = await Sujet.findByPk(req.params.id);
    if (!sujet) return error(res, 'Sujet introuvable.', 404);
    await sujet.update({ statut: req.body.statut });
    return success(res, sujet, 'Statut mis à jour.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  DELETE /sujets/:id — Son créateur ou un admin
// ──────────────────────────────────────────────────────────────────
const supprimerSujet = async (req, res, next) => {
  try {
    const sujet = await Sujet.findByPk(req.params.id);
    if (!sujet) return error(res, 'Sujet introuvable.', 404);

    if (sujet.cheminFichier) await deleteStoredFile(sujet.cheminFichier).catch(() => {});
    if (sujet.cheminCorrige) await deleteStoredFile(sujet.cheminCorrige).catch(() => {});

    await sujet.destroy();
    return success(res, {}, 'Sujet supprimé.');
  } catch (err) {
    next(err);
  }
};

module.exports = { listerSujets, getSujet, telechargerSujet, creerSujet, modifierSujet, changerStatut, supprimerSujet };
