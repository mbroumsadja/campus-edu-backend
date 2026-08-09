const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./ecoles.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken);

router.get('/', controller.listerEcoles);
router.get('/:id', controller.getEcole);

router.post('/',
  authorize('admin'),
  [
    body('ecole').trim().notEmpty().withMessage('Nom de l\'école obligatoire'),
  ],
  validate,
  controller.creerEcole
);

router.put('/:id',
  authorize('admin'),
  [
    body('ecole').trim().notEmpty().withMessage('Nom de l\'école obligatoire'),
  ],
  validate,
  controller.modifierEcole
);

router.delete('/:id', authorize('admin'), controller.supprimerEcole);

module.exports = router;
