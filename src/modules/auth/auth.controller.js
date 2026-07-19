// src/modules/auth/auth.controller.js
// Logique métier : login, refresh, logout

const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');
const { Utilisateur, AuditLog } = require('../../models');
const { success, error }        = require('../../utils/apiResponse');
const logger                    = require('../../utils/logger');

// ── Génération des tokens ────────────────────────────────────────
const generateTokens = (user) => {
  const payload = {
    id:         user.id,
    matricule:  user.matricule,
    role:       user.role,
    filiere_id: user.filiere_id,
    niveau:     user.niveau,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '4h',
  });

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// ── Validation souple du matricule ───────────────────────────────
// On accepte les formats courants sans bloquer les cas limites.
// La vraie vérification se fait en base (l'utilisateur existe ou pas).
const isMatriculeValide = (matricule) => {
  // Étudiant  : 22FS0001, 23U12345
  if (/^\d{2}FS\d{4,6}$/.test(matricule)) return true;
  // Enseignant: ENS-0001, ENS-0042
  if (/^ENS-\d{4,6}$/.test(matricule))   return true;
  // Admin     : ADM-0001
  if (/^ADM-\d{4,6}$/.test(matricule))   return true;
  // Tolérance : au moins 4 caractères alphanumériques
  if (/^[A-Z0-9\-]{4,20}$/.test(matricule)) return true;
  return false;
};

// ──────────────────────────────────────────────────────────────────
//  POST /auth/login
// ──────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { matricule, password } = req.body;
    const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    const matriculeUpper = matricule.trim().toUpperCase();

    // 1. Validation basique du format
    if (!isMatriculeValide(matriculeUpper)) {
      return error(res, 'Format de matricule invalide.', 400);
    }

    // 2. Chercher l'utilisateur en base (source de vérité)
    const utilisateur = await Utilisateur.findOne({
      where: { matricule: matriculeUpper },
      include: [{ association: 'filiere', attributes: ['id', 'nom', 'code'] }],
    });

    // Message volontairement vague pour ne pas révéler si le matricule existe
    if (!utilisateur) {
      // Log silencieux
      AuditLog.create({
        action: 'LOGIN_FAILED',
        details: { matricule: matriculeUpper, raison: 'utilisateur_introuvable' },
        ipAddress: ip,
        resultat: 'echec',
      }).catch(() => {});
      return error(res, 'Matricule ou mot de passe incorrect.', 401);
    }

    // 3. Vérifier le statut du compte
    if (utilisateur.statut === 'suspendu') {
      return error(res, 'Compte suspendu. Contactez l\'administration.', 403);
    }
    if (utilisateur.statut === 'en_attente') {
      return error(res, 'Compte en attente de validation par l\'administration.', 403);
    }

    // 4. Vérifier le mot de passe
    const passwordValide = await bcrypt.compare(password, utilisateur.password);
    if (!passwordValide) {
      AuditLog.create({
        action: 'LOGIN_FAILED',
        utilisateur_id: utilisateur.id,
        details: { matricule: matriculeUpper, raison: 'mauvais_mdp' },
        ipAddress: ip,
        resultat: 'echec',
      }).catch(() => {});
      return error(res, 'Matricule ou mot de passe incorrect.', 401);
    }

    // 5. Générer les tokens
    const { accessToken, refreshToken } = generateTokens(utilisateur);

    // 6. Sauvegarder refresh token + dernière connexion
    await utilisateur.update({
      refreshToken,
      derniereConnexion: new Date(),
    });

    // 7. Journal d'audit (non bloquant)
    AuditLog.create({
      action: 'LOGIN_SUCCESS',
      utilisateur_id: utilisateur.id,
      details: { matricule: matriculeUpper, role: utilisateur.role },
      ipAddress: ip,
      userAgent: req.get('User-Agent'),
    }).catch(() => {});

    logger.info(`✅  Login: ${matriculeUpper} (${utilisateur.role})`);

    return success(res, {
      accessToken,
      refreshToken,
      utilisateur: {
        id:        utilisateur.id,
        matricule: utilisateur.matricule,
        nom:       utilisateur.nom,
        prenom:    utilisateur.prenom,
        role:      utilisateur.role,
        niveau:    utilisateur.niveau,
        filiere:   utilisateur.filiere,
      },
    }, 'Connexion réussie');

  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /auth/refresh  — renouvelle l'access token
// ──────────────────────────────────────────────────────────────────
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return error(res, 'Refresh token manquant.', 401);

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return error(res, 'Refresh token invalide ou expiré.', 401);
    }

    const utilisateur = await Utilisateur.findOne({
      where: { id: decoded.id, refreshToken },
    });

    if (!utilisateur) return error(res, 'Session invalide.', 401);

    // Rotation du refresh token
    const tokens = generateTokens(utilisateur);
    await utilisateur.update({ refreshToken: tokens.refreshToken });

    return success(res, tokens, 'Tokens renouvelés');

  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /auth/logout
// ──────────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    await req.user.update({ refreshToken: null });
    AuditLog.create({
      action: 'LOGOUT',
      utilisateur_id: req.user.id,
      ipAddress: req.ip,
    }).catch(() => {});
    return success(res, {}, 'Déconnexion réussie');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /auth/me
// ──────────────────────────────────────────────────────────────────
const me = async (req, res, next) => {
  try {
    const utilisateur = await Utilisateur.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [{ association: 'filiere', attributes: ['id', 'nom', 'code'] }],
    });
    return success(res, utilisateur);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PUT /auth/change-password
// ──────────────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { ancienPassword, nouveauPassword } = req.body;

    if (!ancienPassword || !nouveauPassword) {
      return error(res, 'Les deux mots de passe sont requis.', 400);
    }
    if (nouveauPassword.length < 8) {
      return error(res, 'Le nouveau mot de passe doit contenir au moins 8 caractères.', 400);
    }

    const utilisateur = await Utilisateur.findByPk(req.user.id);
    const valide = await bcrypt.compare(ancienPassword, utilisateur.password);
    if (!valide) {
      return error(res, 'Mot de passe actuel incorrect.', 401);
    }

    const hash = await bcrypt.hash(nouveauPassword, 12);
    await utilisateur.update({ password: hash });

    logger.info(`🔑  Mot de passe changé : ${utilisateur.matricule}`);
    return success(res, {}, 'Mot de passe mis à jour avec succès.');
  } catch (err) {
    next(err);
  }
};

module.exports = { login, refresh, logout, me, changePassword };

