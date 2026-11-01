// src/modules/demandes/demandes.routes.js
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('./demandes.controller');
const optionalAuth = require('../../middlewares/optionalAuth');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { demandeLimiter } = require('../../middlewares/rateLimiters');

// Public : 5 demandes / heure / IP, champ piège `site_web`, message 10–1000 caractères
router.post('/',
  demandeLimiter,
  optionalAuth,
  [
    body('type').isIn(['sujet_manquant', 'signalement']).withMessage('Type invalide'),
    body('message').isString().trim().isLength({ min: 10, max: 1000 }).withMessage('Message : 10 à 1000 caractères'),
    body('contact').optional({ nullable: true }).isString().trim().isLength({ max: 150 }).withMessage('Contact : 150 caractères maximum'),
    body('ue_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('sujet_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('site_web').optional(),
  ],
  validate,
  controller.creerDemande
);

// Admin : consultation et traitement
router.get('/', verifyToken, authorize('admin'), [
  query('statut').optional().isIn(['nouvelle', 'en_cours', 'traitee', 'rejetee']),
  query('type').optional().isIn(['sujet_manquant', 'signalement']),
], validate, controller.listerDemandes);

router.patch('/:id/statut', verifyToken, authorize('admin'), [
  param('id').isInt({ min: 1 }),
  body('statut').isIn(['nouvelle', 'en_cours', 'traitee', 'rejetee']),
], validate, controller.changerStatut);

module.exports = router;
