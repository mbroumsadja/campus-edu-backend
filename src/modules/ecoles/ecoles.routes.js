const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./ecoles.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

// Lecture publique — pas de vérification de token
router.get('/', controller.listerEcoles);
router.get('/:id', controller.getEcole);

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