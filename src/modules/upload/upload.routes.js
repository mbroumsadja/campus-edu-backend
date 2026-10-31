// src/modules/upload/upload.routes.js
const router = require('express').Router();
const { verifyToken, authorize } = require('../../middlewares/auth');
const { body } = require('express-validator');
const { validate } = require('../../middlewares/validate');
const { genererJetonClient, verifierDoublon } = require('./upload.controller');

// Réservé enseignant/admin — seuls rôles autorisés à déposer des documents
router.post('/client-token',
  verifyToken,
  authorize('enseignant', 'admin'),
  genererJetonClient
);

// Vérifier si un fichier (empreinte SHA-256 calculée côté client) existe déjà
router.post('/verifier-doublon',
  verifyToken,
  authorize('enseignant', 'admin'),
  [
    body().custom((b) => {
      if (!b || (b.sha256 === undefined && b.sha256s === undefined)) throw new Error('sha256 ou sha256s obligatoire');
      return true;
    }),
    body('sha256').optional().matches(/^[0-9a-fA-F]{64}$/).withMessage('Empreinte SHA-256 invalide'),
    body('sha256s').optional().isArray({ min: 1, max: 20 }).withMessage('sha256s : 1 à 20 empreintes'),
    body('sha256s.*').optional().matches(/^[0-9a-fA-F]{64}$/).withMessage('Empreinte SHA-256 invalide'),
  ],
  validate,
  verifierDoublon
);

module.exports = router;
