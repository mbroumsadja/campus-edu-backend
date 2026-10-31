// src/modules/auth/sessions.js
// CE-12 : sessions multi-appareils. Un refresh token = une ligne `sessions` (hash SHA-256 uniquement),
// renouvelé à chaque /auth/refresh (rotation). Rejeu d'un token déjà renouvelé => toute la famille est révoquée.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Session, sequelize } = require('../../models');

const MAX_SESSIONS = () => parseInt(process.env.MAX_SESSIONS_PER_USER, 10) || 10;
const GRACE_MS = 10 * 1000; // double envoi légitime d'un client (réseau instable)

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const nomAppareil = (req) => {
  const brut = (req.body?.appareil || req.get('X-Device-Name') || req.get('User-Agent') || 'Appareil inconnu').toString();
  return brut.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
};

// sid = identifiant de l'appareil (famille) : l'access token reste valable après une rotation du refresh token
const signAccess = (user, sid) => jwt.sign(
  { id: user.id, matricule: user.matricule, role: user.role, filiere_id: user.filiere_id, niveau: user.niveau, sid },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '4h' }
);

const signRefresh = (userId, sid) => jwt.sign(
  { id: userId, sid, jti: crypto.randomUUID() },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
);

// Crée une session (nouvelle famille, ou celle donnée lors d'une rotation) et renvoie les deux tokens
const ouvrirSession = async (user, req, { familleId, transaction } = {}) => {
  const id = crypto.randomUUID();
  const famille = familleId || crypto.randomUUID(); // identifiant stable de l'appareil, conservé à chaque rotation
  const refreshToken = signRefresh(user.id, id);
  const { exp } = jwt.decode(refreshToken);
  await Session.create({
    id,
    utilisateur_id: user.id,
    famille_id: famille,
    token_hash: hashToken(refreshToken),
    appareil: nomAppareil(req),
    expires_at: new Date(exp * 1000),
    last_used_at: new Date(),
  }, { transaction });
  return { accessToken: signAccess(user, famille), refreshToken, sessionId: id, appareilId: famille };
};

// Limite le nombre d'appareils : les plus anciennes sessions actives sont révoquées
const limiterSessions = async (utilisateurId) => {
  const actives = await Session.findAll({
    where: { utilisateur_id: utilisateurId, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
    order: [['last_used_at', 'DESC']],
    attributes: ['id'],
  });
  const aRevoquer = actives.slice(MAX_SESSIONS()).map((s) => s.id);
  if (aRevoquer.length) await Session.update({ revoked_at: new Date(), motif_revocation: 'limite' }, { where: { id: aRevoquer } });
};

// Nettoyage paresseux : sessions expirées ou révoquées depuis plus de 30 jours
const purgerAnciennes = () => Session.destroy({
  where: {
    [Op.or]: [
      { expires_at: { [Op.lt]: new Date(Date.now() - 30 * 86400000) } },
      { revoked_at: { [Op.lt]: new Date(Date.now() - 30 * 86400000) } },
    ],
  },
});

// Renouvelle : retourne { user, tokens } ou { echec: 'invalide' | 'rejeu' }
const renouveler = async (refreshToken, req) => {
  let decoded;
  try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); } catch { return { echec: 'invalide' }; }

  const hash = hashToken(refreshToken);
  const session = await Session.findOne({ where: { token_hash: hash, utilisateur_id: decoded.id } });
  if (!session || session.expires_at < new Date()) return { echec: 'invalide' };

  if (session.revoked_at) {
    const recent = session.motif_revocation === 'rotation' && Date.now() - session.revoked_at.getTime() < GRACE_MS;
    if (session.motif_revocation === 'rotation' && !recent) {
      await Session.update({ revoked_at: new Date(), motif_revocation: 'rejeu' },
        { where: { famille_id: session.famille_id, revoked_at: null } });
      return { echec: 'rejeu', utilisateur_id: session.utilisateur_id };
    }
    return { echec: 'invalide' };
  }

  const { Utilisateur } = require('../../models');
  const user = await Utilisateur.findByPk(decoded.id);
  if (!user || user.statut !== 'actif') return { echec: 'invalide' };

  const tokens = await sequelize.transaction(async (t) => {
    // Révocation atomique : un seul des deux appels concurrents gagne
    const [n] = await Session.update({ revoked_at: new Date(), motif_revocation: 'rotation' },
      { where: { id: session.id, revoked_at: null }, transaction: t });
    if (n === 0) return null;
    return ouvrirSession(user, req, { familleId: session.famille_id, transaction: t });
  });
  if (!tokens) return { echec: 'invalide' };
  return { user, tokens };
};

const revoquer = (where, motif) => Session.update(
  { revoked_at: new Date(), motif_revocation: motif },
  { where: { ...where, revoked_at: null } }
);

module.exports = { hashToken, ouvrirSession, limiterSessions, purgerAnciennes, renouveler, revoquer };
