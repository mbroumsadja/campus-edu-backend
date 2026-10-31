// src/routes/api.js
// Routeur unique de l'API, monté sous /api/v1 (version courante) et /api (ancien chemin, déprécié).

const router = require('express').Router();

router.use('/auth',     require('../modules/auth/auth.routes'));
router.use('/users',    require('../modules/users/users.routes'));
router.use('/cours',    require('../modules/cours/cours.routes'));
router.use('/sujets',   require('../modules/sujets/sujets.routes'));
router.use('/filieres', require('../modules/filieres/filieres.routes'));
router.use('/ecoles',   require('../modules/ecoles/ecoles.routes'));
router.use('/upload',   require('../modules/upload/upload.routes'));
router.use('/search',   require('../modules/search/search.routes'));
router.use('/config',   require('../modules/config/config.routes'));

router.get('/ping', (_req, res) => {
  res.json({ success: true, message: 'Backend Campus edu opérationnel 🚀' });
});

module.exports = router;
