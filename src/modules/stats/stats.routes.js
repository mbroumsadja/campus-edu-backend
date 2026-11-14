// src/modules/stats/stats.routes.js
const router = require('express').Router();
const { verifyToken, authorize } = require('../../middlewares/auth');
const { tableauDeBord, aTraiter } = require('./stats.controller');

router.get('/', verifyToken, authorize('admin'), tableauDeBord);
router.get('/a-traiter', verifyToken, authorize('admin'), aTraiter);

module.exports = router;
