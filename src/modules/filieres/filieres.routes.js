// src/modules/filieres/filieres.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./filieres.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken);

// Routes accessibles à tous les utilisateurs connectés
router.get('/',     controller.listerFilieres);
router.get('/:id',  controller.getFiliere);
router.get('/:id/ues', controller.listerUEs);

// Routes admin uniquement
router.post('/',
  authorize('admin'),
  [
    body('code').trim().notEmpty().withMessage('Code obligatoire'),
    body('nom').trim().notEmpty().withMessage('Nom obligatoire'),
  ],
  validate,
  controller.creerFiliere
);

router.put('/:id', authorize('admin'), controller.modifierFiliere);

// Créer une UE dans une filière
router.post('/:id/ues',
  authorize('admin'),
  [
    body('code').trim().notEmpty(),
    body('intitule').trim().notEmpty(),
    body('niveau').isIn(['L1','L2','L3','M1','M2']),
    body('semestre').isIn(['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']),
  ],
  validate,
  controller.creerUE
);

module.exports = router;
