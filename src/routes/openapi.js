// src/routes/openapi.js — GET /api/v1/openapi.json (public)
const router = require('express').Router();
const spec = require('../docs/openapi');

router.get('/openapi.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(spec);
});

module.exports = router;
