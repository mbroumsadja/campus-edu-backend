// src/modules/search/search.routes.js
const router = require('express').Router();
const { rechercher } = require('./search.controller');

router.get('/', rechercher); // pas de verifyToken — 100% public

module.exports = router;