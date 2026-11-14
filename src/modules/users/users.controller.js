// src/modules/users/users.controller.js

const bcrypt        = require('bcryptjs');
const { Utilisateur, Filiere } = require('../../models');
const { audit } = require('../../utils/audit');
const { MATRICULE_VALIDATEUR, statutInitial, activationInterdite } = require('../../utils/validationComptes');
const { revoquer } = require('../auth/sessions');
const { Op }        = require('sequelize');
const { containsText } = require('../../utils/searchText');
const { success, created, error, paginated } = require('../../utils/apiResponse');

const SALT_ROUNDS = 12;

// ──────────────────────────────────────────────────────────────────
//  GET /users  (Admin uniquement)
// ──────────────────────────────────────────────────────────────────
const listerUtilisateurs = async (req, res, next) => {
  try {
    const { role, statut, filiere_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (role)       where.role       = role;
    if (statut)     where.statut     = statut;
    if (filiere_id) where.filiere_id = filiere_id;
    if (search) {
      where[Op.or] = [
        containsText('Utilisateur.nom', search),
        containsText('Utilisateur.prenom', search),
        containsText('Utilisateur.matricule', search),
      ];
    }

    const { count, rows } = await Utilisateur.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [
        { model: Filiere, as: 'filiere', attributes: ['id', 'nom', 'code'] },
        { model: Utilisateur, as: 'createur', attributes: ['id', 'matricule'] },
      ],
      order:  [['createdAt', 'DESC']],
      limit:  parseInt(limit),
      offset: parseInt(offset),
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /users/:id
// ──────────────────────────────────────────────────────────────────
const getUtilisateur = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [
        { model: Filiere, as: 'filiere' },
        { model: Utilisateur, as: 'createur', attributes: ['id', 'matricule'] },
      ],
    });
    if (!user) return error(res, 'Utilisateur introuvable.', 404);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /users  (Admin : créer étudiant ou enseignant)
// ──────────────────────────────────────────────────────────────────
const creerUtilisateur = async (req, res, next) => {
  try {
    const { matricule, nom, prenom, email, role, niveau, filiere_id, password } = req.body;

    // Mot de passe temporaire = matricule si non fourni
    const mdpInitial  = password || matricule;
    const mdpHache    = await bcrypt.hash(mdpInitial, SALT_ROUNDS);

    const user = await Utilisateur.create({
      matricule: matricule.toUpperCase(),
      nom, prenom, email, role, niveau, filiere_id,
      password: mdpHache,
      // Comptes créés par ADM-0010 : en attente jusqu'à sa validation
      statut:   statutInitial(req.user),
      cree_par: req.user.id,
    });

    await audit({
      action:          'CREATE_USER',
      utilisateur_id:  req.user.id,
      details:         { cible: user.matricule, role: user.role },
      ipAddress:       req.ip,
    });

    const { password: _, refreshToken: __, ...userSafe } = user.toJSON();
    return created(
      res,
      userSafe,
      user.statut === 'en_attente'
        ? `Utilisateur créé. Le compte reste en attente de validation par ${MATRICULE_VALIDATEUR}.`
        : 'Utilisateur créé avec succès.'
    );
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PUT /users/:id  (Admin)
// ──────────────────────────────────────────────────────────────────
const modifierUtilisateur = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id);
    if (!user) return error(res, 'Utilisateur introuvable.', 404);

    const { nom, prenom, email, statut, filiere_id, niveau } = req.body;
    const updates = {};

    if (statut === 'actif' && await activationInterdite(req.user, user)) {
      return error(res, `Ce compte doit être validé par ${MATRICULE_VALIDATEUR}.`, 403);
    }

    if (nom)        updates.nom        = nom;
    if (prenom)     updates.prenom     = prenom;
    if (email)      updates.email      = email;
    if (statut)     updates.statut     = statut;
    if (filiere_id) updates.filiere_id = filiere_id;
    if (niveau)     updates.niveau     = niveau;

    await user.update(updates);

    await audit({
      action:         'UPDATE_USER',
      utilisateur_id: req.user.id,
      details:        { cible: user.matricule, modifications: Object.keys(updates) },
      ipAddress:      req.ip,
    });

    const { password: _, refreshToken: __, ...userSafe } = user.toJSON();
    return success(res, userSafe, 'Utilisateur mis à jour.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PATCH /users/:id/statut  (Admin : activer / suspendre)
// ──────────────────────────────────────────────────────────────────
const changerStatut = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id);
    if (!user) return error(res, 'Utilisateur introuvable.', 404);

    const { statut } = req.body;
    if (statut === 'actif' && await activationInterdite(req.user, user)) {
      return error(res, `Ce compte doit être validé par ${MATRICULE_VALIDATEUR}.`, 403);
    }
    await user.update({ statut });

    // Si on suspend, on invalide aussi sa session
    if (statut === 'suspendu') {
      await revoquer({ utilisateur_id: user.id }, 'suspension');
    }

    await audit({
      action:         statut === 'actif' ? 'ACTIVATE_USER' : 'SUSPEND_USER',
      utilisateur_id: req.user.id,
      details:        { cible: user.matricule, nouveauStatut: statut },
      ipAddress:      req.ip,
    });

    return success(res, { id: user.id, statut }, `Compte ${statut}.`);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  DELETE /users/:id  (Admin)
// ──────────────────────────────────────────────────────────────────
const supprimerUtilisateur = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id);
    if (!user) return error(res, 'Utilisateur introuvable.', 404);

    // Empêcher un admin de se supprimer lui-même
    if (user.id === req.user.id) {
      return error(res, 'Impossible de supprimer votre propre compte.', 400);
    }

    await audit({
      action:         'DELETE_USER',
      utilisateur_id: req.user.id,
      details:        { cible: user.matricule },
      ipAddress:      req.ip,
    });

    await user.destroy();
    return success(res, {}, 'Utilisateur supprimé.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listerUtilisateurs, getUtilisateur, creerUtilisateur,
  modifierUtilisateur, changerStatut, supprimerUtilisateur,
};
