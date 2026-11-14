// src/modules/stats/stats.routes.js
const router = require('express').Router();
const { verifyToken, authorize } = require('../../middlewares/auth');
const { tableauDeBord, aTraiter, appareils } = require('./stats.controller');

router.get('/', verifyToken, authorize('admin'), tableauDeBord);
router.get('/a-traiter', verifyToken, authorize('admin'), aTraiter);
router.get('/appareils', verifyToken, authorize('admin'), appareils);

module.exports = router;
