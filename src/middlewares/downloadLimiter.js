// src/middlewares/downloadLimiter.js
const rateLimit = require('express-rate-limit');
const { error }  = require('../utils/apiResponse');

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 30,                  // 30 téléchargements/heure/IP pour un anonyme
  standardHeaders: true,
  legacyHeaders: false,
  // Un utilisateur authentifié (JWT valide) n'est pas limité
  skip: (req) => !!req.user,
  handler: (req, res) => error(res, 'Trop de téléchargements. Réessayez dans quelques minutes.', 429),
});

module.exports = downloadLimiter;