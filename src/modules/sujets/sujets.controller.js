// src/modules/sujets/sujets.controller.js

const { Sujet, UE, Utilisateur, Filiere } = require('../../models');
const { Op }      = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const path        = require('path');

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

    const filePath = path.resolve(avecCorrige ? sujet.cheminCorrige : sujet.cheminFichier);
    const fileName = avecCorrige
      ? `corrige_${sujet.titre.replace(/\s/g,'_')}.pdf`
      : `sujet_${sujet.titre.replace(/\s/g,'_')}.pdf`;

    sujet.increment('telechargemements').catch(() => {});
    return res.download(filePath, fileName);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /sujets — Enseignant ou Admin
// ──────────────────────────────────────────────────────────────────
const creerSujet = async (req, res, next) => {
  try {
    const fichierSujet   = req.files?.sujet?.[0];
    const fichierCorrige = req.files?.corrige?.[0];

    if (!fichierSujet) return error(res, 'Le fichier sujet est obligatoire.', 400);

    const { titre, type, session, annee, ue_id } = req.body;

    const ue = await UE.findByPk(ue_id);
    if (!ue) return error(res, 'UE introuvable.', 404);

    const sujet = await Sujet.create({
      titre,
      type,
      session,
      annee:         parseInt(annee),
      ue_id,
      enseignant_id: req.user.id,
      cheminFichier: fichierSujet.path,
      avecCorrige:   !!fichierCorrige,
      cheminCorrige: fichierCorrige?.path || null,
      statut:        req.user.role === 'admin' ? 'publie' : 'en_attente',
    });

    return created(res, sujet, 'Sujet déposé avec succès.');
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

module.exports = { listerSujets, getSujet, telechargerSujet, creerSujet, changerStatut };
