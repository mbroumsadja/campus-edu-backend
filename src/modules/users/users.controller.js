// src/modules/users/users.controller.js

const bcrypt        = require('bcryptjs');
const { Utilisateur, Filiere, AuditLog } = require('../../models');
const { Op }        = require('sequelize');
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
        { nom:       { [Op.like]: `%${search}%` } },
        { prenom:    { [Op.like]: `%${search}%` } },
        { matricule: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Utilisateur.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [{ model: Filiere, as: 'filiere', attributes: ['id', 'nom', 'code'] }],
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
      include: [{ model: Filiere, as: 'filiere' }],
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
      statut:   'actif',
    });

    await AuditLog.create({
      action:          'CREATE_USER',
      utilisateur_id:  req.user.id,
      details:         { cible: user.matricule, role: user.role },
      ipAddress:       req.ip,
    });

    const { password: _, refreshToken: __, ...userSafe } = user.toJSON();
    return created(res, userSafe, 'Utilisateur créé avec succès.');
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

    if (nom)        updates.nom        = nom;
    if (prenom)     updates.prenom     = prenom;
    if (email)      updates.email      = email;
    if (statut)     updates.statut     = statut;
    if (filiere_id) updates.filiere_id = filiere_id;
    if (niveau)     updates.niveau     = niveau;

    await user.update(updates);

    await AuditLog.create({
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
    await user.update({ statut });

    // Si on suspend, on invalide aussi sa session
    if (statut === 'suspendu') {
      await user.update({ refreshToken: null });
    }

    await AuditLog.create({
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

    await AuditLog.create({
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
