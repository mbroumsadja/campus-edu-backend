// src/modules/search/search.routes.js
const router = require('express').Router();
const optionalAuth = require('../../middlewares/optionalAuth');
const { rechercherDocuments, telechargerDocument } = require('./search.controller');

// Endpoint dédié pour rechercher des documents
router.get('/documents', optionalAuth, rechercherDocuments); // pas de verifyToken — 100% public

// Endpoint public de téléchargement de documents
router.get('/documents/telecharger', optionalAuth, telechargerDocument); // pas de verifyToken — 100% public

module.exports = router;