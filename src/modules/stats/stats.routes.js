// src/modules/stats/stats.routes.js
const router = require('express').Router();
const { verifyToken, authorize } = require('../../middlewares/auth');
const { tableauDeBord } = require('./stats.controller');

router.get('/', verifyToken, authorize('admin'), tableauDeBord);

module.exports = router;
