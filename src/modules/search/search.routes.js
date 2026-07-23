// src/modules/search/search.routes.js
const router = require('express').Router();
const { rechercher, rechercherDocuments } = require('./search.controller');

router.get('/', rechercher); // pas de verifyToken — 100% public

// Endpoint dédié pour rechercher des documents
router.get('/documents', rechercherDocuments); // pas de verifyToken — 100% public

module.exports = router;