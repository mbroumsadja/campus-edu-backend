const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./ecoles.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const optionalAuth = require('../../middlewares/optionalAuth');
const { validate } = require('../../middlewares/validate');

// Lecture : publique (comme /api/search), ne bloque jamais la requête
router.get('/', optionalAuth, controller.listerEcoles);
router.get('/:id', optionalAuth, controller.getEcole);

// Écriture : réservée aux utilisateurs connectés avec le rôle admin
router.post('/',
  verifyToken,
  authorize('admin'),
  [
    body('ecole').trim().notEmpty().withMessage('Nom de l\'école obligatoire'),
  ],
  validate,
  controller.creerEcole
);

router.put('/:id',
  verifyToken,
  authorize('admin'),
  [
    body('ecole').trim().notEmpty().withMessage('Nom de l\'école obligatoire'),
  ],
  validate,
  controller.modifierEcole
);

router.delete('/:id', verifyToken, authorize('admin'), controller.supprimerEcole);

module.exports = router;
