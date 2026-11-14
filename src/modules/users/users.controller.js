// src/modules/users/users.controller.js

const bcrypt        = require('bcryptjs');
const { Utilisateur, Filiere } = require('../../models');
const { audit } = require('../../utils/audit');
const { estSuperAdmin, estCompteAdmin } = require('../../utils/roles');
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

    if (role === 'super_admin' && !estSuperAdmin(req.user)) {
      return error(res, 'Seul un super administrateur peut créer un super administrateur.', 403);
    }
    // Un compte administrateur créé par un simple admin attend la validation du super admin
    const statut = estCompteAdmin({ role }) && !estSuperAdmin(req.user) ? 'en_attente' : 'actif';

    // Mot de passe temporaire = matricule si non fourni
    const mdpInitial  = password || matricule;
    const mdpHache    = await bcrypt.hash(mdpInitial, SALT_ROUNDS);

    const user = await Utilisateur.create({
      matricule: matricule.toUpperCase(),
      nom, prenom, email, role, niveau, filiere_id,
      password: mdpHache,
      statut,
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
        ? 'Compte administrateur créé. Il reste en attente de validation par un super administrateur.'
        : 'Utilisateur créé avec succès.'
    );
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PUT /users/:id  (Admin)
// ──────────────────────────────────────────────────────────────────
// Dernier super admin actif : on ne peut ni le suspendre, ni le rétrograder, ni le supprimer
// (sinon plus personne ne pourrait valider les comptes administrateurs).
const estDernierSuperAdmin = async (user) => {
  if (user.role !== 'super_admin' || user.statut !== 'actif') return false;
  const autres = await Utilisateur.count({ where: { role: 'super_admin', statut: 'actif', id: { [Op.ne]: user.id } } });
  return autres === 0;
};

const modifierUtilisateur = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id);
    if (!user) return error(res, 'Utilisateur introuvable.', 404);

    const { nom, prenom, email, statut, filiere_id, niveau } = req.body;
    const updates = {};

    if (statut && estCompteAdmin(user) && !estSuperAdmin(req.user)) {
      return error(res, 'Seul un super administrateur peut valider ou modifier le statut d\'un compte administrateur.', 403);
    }

    if (statut && statut !== 'actif') {
      if (user.id === req.user.id) return error(res, 'Vous ne pouvez pas désactiver votre propre compte.', 403);
      if (await estDernierSuperAdmin(user)) return error(res, 'Impossible : c\'est le dernier super administrateur actif.', 409);
    }

    if (nom)        updates.nom        = nom;
    if (prenom)     updates.prenom     = prenom;
    if (email)      updates.email      = email;
    if (statut)     updates.statut     = statut;
    if (filiere_id) updates.filiere_id = filiere_id;
    if (niveau)     updates.niveau     = niveau;

    await user.update(updates);
    if (statut && statut !== 'actif') await revoquer({ utilisateur_id: user.id }, 'suspension');

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
    if (estCompteAdmin(user) && !estSuperAdmin(req.user)) {
      return error(res, 'Seul un super administrateur peut valider, suspendre ou activer un compte administrateur.', 403);
    }
    if (user.id === req.user.id && statut !== 'actif') {
      return error(res, 'Vous ne pouvez pas désactiver votre propre compte.', 403);
    }
    if (statut !== 'actif' && await estDernierSuperAdmin(user)) {
      return error(res, 'Impossible : c\'est le dernier super administrateur actif.', 409);
    }
    await user.update({ statut });

    // Un compte suspendu ou remis en attente est déconnecté de tous ses appareils
    if (statut !== 'actif') {
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
//  PATCH /users/:id/role  (Admin)
//  - super admin : tous les rôles (nommer / retirer admin et super admin)
//  - admin       : uniquement étudiant ↔ enseignant
// ──────────────────────────────────────────────────────────────────
const changerRole = async (req, res, next) => {
  try {
    const user = await Utilisateur.findByPk(req.params.id);
    if (!user) return error(res, 'Utilisateur introuvable.', 404);

    const { role } = req.body;
    if (role === user.role) return success(res, { id: user.id, role }, 'Rôle inchangé.');
    if (user.id === req.user.id) return error(res, 'Vous ne pouvez pas modifier votre propre rôle.', 403);

    const touchePrivilegies = estCompteAdmin(user) || estCompteAdmin({ role });
    if (touchePrivilegies && !estSuperAdmin(req.user)) {
      return error(res, 'Seul un super administrateur peut nommer ou retirer un administrateur.', 403);
    }
    if (await estDernierSuperAdmin(user)) {
      return error(res, 'Impossible : c\'est le dernier super administrateur actif.', 409);
    }

    const ancienRole = user.role;
    await user.update({ role });
    // Les appareils connectés doivent se reconnecter pour prendre le nouveau rôle
    await revoquer({ utilisateur_id: user.id }, 'admin');

    await audit({
      action:         'CHANGE_ROLE',
      utilisateur_id: req.user.id,
      details:        { cible: user.matricule, ancienRole, nouveauRole: role },
      ipAddress:      req.ip,
    });
    return success(res, { id: user.id, role }, 'Rôle mis à jour.');
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

    if (estCompteAdmin(user) && !estSuperAdmin(req.user)) {
      return error(res, 'Seul un super administrateur peut supprimer un compte administrateur.', 403);
    }

    if (await estDernierSuperAdmin(user)) {
      return error(res, 'Impossible : c\'est le dernier super administrateur actif.', 409);
    }

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
  modifierUtilisateur, changerStatut, changerRole, supprimerUtilisateur,
};
