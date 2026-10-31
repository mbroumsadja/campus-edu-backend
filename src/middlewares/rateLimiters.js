// src/middlewares/rateLimiters.js
// Limiteurs de requêtes (CE-02).
// En serverless (Vercel), la mémoire n'est pas partagée entre instances :
// si UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont définis, les
// compteurs sont stockés dans Upstash (API REST, aucune dépendance en plus).
// Sans ces variables, le store mémoire par défaut est utilisé (dev, tests).

const rateLimit = require('express-rate-limit');
const { error } = require('../utils/apiResponse');

const FIFTEEN_MIN = 15 * 60 * 1000;

// ── Store Upstash (interface Store d'express-rate-limit v7) ──────
class UpstashStore {
  constructor({ url, token, prefix = 'rl:' }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async pipeline(commands) {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    return res.json();
  }

  async increment(key) {
    const k = this.prefix + key;
    const out = await this.pipeline([
      ['INCR', k],
      ['PEXPIRE', k, String(this.windowMs), 'NX'],
      ['PTTL', k],
    ]);
    const totalHits = Number(out[0].result);
    const ttl = Number(out[2].result);
    return { totalHits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
  }

  async decrement(key) {
    await this.pipeline([['DECR', this.prefix + key]]);
  }

  async resetKey(key) {
    await this.pipeline([['DEL', this.prefix + key]]);
  }
}

const buildStore = (prefix) => {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (url && token) return new UpstashStore({ url, token, prefix });
  return undefined; // store mémoire par défaut
};

const tooMany = (message) => (_req, res) => error(res, message, 429);

// ── Limiteur global : 1000 requêtes / 15 min / IP ────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || FIFTEEN_MIN,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:global:'),
  passOnStoreError: true, // si Upstash est indisponible, on ne bloque pas les étudiants
  handler: tooMany('Trop de requêtes. Réessayez dans 15 minutes.'),
});

// ── Login : 10 tentatives / 15 min par IP + matricule ────────────
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:login:'),
  keyGenerator: (req) => {
    const matricule = String(req.body?.matricule || '').trim().toUpperCase().slice(0, 30);
    return `${req.ip}|${matricule}`;
  },
  handler: tooMany('Trop de tentatives de connexion. Attendez 15 minutes.'),
});

// ── Téléchargements anonymes : 30 / heure / IP ───────────────────
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.DOWNLOAD_RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:dl:'),
  skip: (req) => !!req.user, // les utilisateurs authentifiés ne sont pas concernés
  handler: tooMany('Trop de téléchargements. Réessayez dans quelques minutes.'),
});

module.exports = { globalLimiter, loginLimiter, downloadLimiter, UpstashStore };
