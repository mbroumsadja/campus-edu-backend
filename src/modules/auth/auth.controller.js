// src/modules/auth/auth.controller.js
// Logique métier : login, refresh, logout

const bcrypt           = require('bcryptjs');
const { Op }           = require('sequelize');
const { Utilisateur, Session } = require('../../models');
const sessions = require('./sessions');
const { audit } = require('../../utils/audit');
const { success, error }        = require('../../utils/apiResponse');
const logger                    = require('../../utils/logger');

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
    const utilisateur = await Utilisateur.scope('avecSecrets').findOne({
      where: { matricule: matriculeUpper },
      include: [{ association: 'filiere', attributes: ['id', 'nom', 'code'] }],
    });

    // Message volontairement vague pour ne pas révéler si le matricule existe
    if (!utilisateur) {
      // Log silencieux
      await audit({
        action: 'LOGIN_FAILED',
        details: { matricule: matriculeUpper, raison: 'utilisateur_introuvable' },
        ipAddress: ip,
        resultat: 'echec',
      });
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
      await audit({
        action: 'LOGIN_FAILED',
        utilisateur_id: utilisateur.id,
        details: { matricule: matriculeUpper, raison: 'mauvais_mdp' },
        ipAddress: ip,
        resultat: 'echec',
      });
      return error(res, 'Matricule ou mot de passe incorrect.', 401);
    }

    // 5. Ouvrir une session pour cet appareil (les autres appareils restent connectés)
    const { accessToken, refreshToken } = await sessions.ouvrirSession(utilisateur, req);
    await sessions.limiterSessions(utilisateur.id);
    await sessions.purgerAnciennes().catch(() => {});

    // 6. Dernière connexion
    await utilisateur.update({ derniereConnexion: new Date() });

    // 7. Journal d'audit (non bloquant)
    await audit({
      action: 'LOGIN_SUCCESS',
      utilisateur_id: utilisateur.id,
      details: { matricule: matriculeUpper, role: utilisateur.role },
      ipAddress: ip,
      userAgent: req.get('User-Agent'),
    });

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

    const r = await sessions.renouveler(refreshToken, req);
    if (r.echec === 'rejeu') {
      await audit({ action: 'REFRESH_REUSE', utilisateur_id: r.utilisateur_id, ipAddress: req.ip, resultat: 'echec',
        details: { raison: 'token_deja_renouvele_famille_revoquee' } });
      return error(res, 'Session invalide. Reconnectez-vous.', 401);
    }
    if (r.echec) return error(res, 'Refresh token invalide ou expiré.', 401);

    return success(res, { accessToken: r.tokens.accessToken, refreshToken: r.tokens.refreshToken }, 'Tokens renouvelés');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /auth/logout
// ──────────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    // { tous: true } : déconnexion de tous les appareils ; sinon uniquement l'appareil courant.
    // Ancien jeton sans identifiant de session : on révoque tout (comportement historique).
    const tous = req.body?.tous === true || !req.sessionId;
    await sessions.revoquer(
      tous ? { utilisateur_id: req.user.id } : { famille_id: req.sessionId, utilisateur_id: req.user.id },
      'logout'
    );
    await audit({
      action: tous ? 'LOGOUT_ALL' : 'LOGOUT',
      utilisateur_id: req.user.id,
      ipAddress: req.ip,
    });
    return success(res, {}, 'Déconnexion réussie');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /auth/sessions — appareils connectés
// ──────────────────────────────────────────────────────────────────
const listerSessions = async (req, res, next) => {
  try {
    const rows = await Session.findAll({
      where: { utilisateur_id: req.user.id, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
      attributes: ['id', 'famille_id', 'appareil', 'created_at', 'last_used_at', 'expires_at'],
      order: [['last_used_at', 'DESC']],
    });
    // Un appareil = une famille de sessions (renouvelée à chaque refresh) : son id est le famille_id
    return success(res, rows.map((r) => ({
      id: r.famille_id, appareil: r.appareil, createdAt: r.createdAt, derniereActivite: r.last_used_at,
      expiresAt: r.expires_at, courante: r.famille_id === req.sessionId,
    })));
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  DELETE /auth/sessions/:id — déconnecter un appareil
// ──────────────────────────────────────────────────────────────────
const revoquerSession = async (req, res, next) => {
  try {
    const [n] = await sessions.revoquer({ famille_id: req.params.id, utilisateur_id: req.user.id }, 'logout');
    if (n === 0) return error(res, 'Session introuvable.', 404);
    await audit({ action: 'SESSION_REVOKED', utilisateur_id: req.user.id, ipAddress: req.ip, details: { session: req.params.id } });
    return success(res, {}, 'Appareil déconnecté.');
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

    const utilisateur = await Utilisateur.scope('avecSecrets').findByPk(req.user.id);
    const valide = await bcrypt.compare(ancienPassword, utilisateur.password);
    if (!valide) {
      return error(res, 'Mot de passe actuel incorrect.', 401);
    }

    const hash = await bcrypt.hash(nouveauPassword, 12);
    await utilisateur.update({ password: hash });
    // Les autres appareils doivent se reconnecter avec le nouveau mot de passe
    await sessions.revoquer({ utilisateur_id: utilisateur.id, ...(req.sessionId ? { famille_id: { [Op.ne]: req.sessionId } } : {}) }, 'mot_de_passe');

    logger.info(`🔑  Mot de passe changé : ${utilisateur.matricule}`);
    return success(res, {}, 'Mot de passe mis à jour avec succès.');
  } catch (err) {
    next(err);
  }
};

module.exports = { login, refresh, logout, me, changePassword, listerSessions, revoquerSession };

