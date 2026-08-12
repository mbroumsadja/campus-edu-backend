// src/modules/upload/upload.routes.js
const router = require('express').Router();
const { verifyToken, authorize } = require('../../middlewares/auth');
const { genererJetonClient } = require('./upload.controller');

// Réservé enseignant/admin — seuls rôles autorisés à déposer des documents
router.post('/client-token',
  verifyToken,
  authorize('enseignant', 'admin'),
  genererJetonClient
);

module.exports = router;
