// src/modules/filieres/filieres.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./filieres.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const optionalAuth = require('../../middlewares/optionalAuth');
const { validate } = require('../../middlewares/validate');

// Lecture : publique (comme /api/search), ne bloque jamais la requête
router.get('/',     optionalAuth, controller.listerFilieres);
router.get('/:id',  optionalAuth, controller.getFiliere);
router.get('/:id/ues', optionalAuth, controller.listerUEs);

// Écriture : réservée aux utilisateurs connectés avec le rôle admin
router.post('/',
  verifyToken,
  authorize('admin'),
  [
    body('code').trim().notEmpty().withMessage('Code obligatoire'),
    body('nom').trim().notEmpty().withMessage('Nom obligatoire'),
    body('ecole_id').notEmpty().withMessage('Ecole obligatoire').bail().isInt().withMessage('Ecole invalide'),
  ],
  validate,
  controller.creerFiliere
);

router.put('/:id',
  verifyToken,
  authorize('admin'),
  [
    body('code').optional().trim().notEmpty().withMessage('Code obligatoire'),
    body('nom').optional().trim().notEmpty().withMessage('Nom obligatoire'),
    body('ecole_id').optional().isInt().withMessage('Ecole invalide'),
  ],
  validate,
  controller.modifierFiliere
);

router.delete('/:id',
  verifyToken,
  authorize('admin'),
  controller.supprimerFiliere
);

// Créer une UE dans une filière
router.post('/:id/ues',
  verifyToken,
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

router.put('/:id/ues/:ueId',
  verifyToken,
  authorize('admin'),
  [
    body('code').optional().trim().notEmpty().withMessage('Code obligatoire'),
    body('intitule').optional().trim().notEmpty().withMessage('Intitulé obligatoire'),
    body('niveau').optional().isIn(['L1','L2','L3','M1','M2']),
    body('semestre').optional().isIn(['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']),
  ],
  validate,
  controller.modifierUE
);

router.delete('/:id/ues/:ueId',
  verifyToken,
  authorize('admin'),
  controller.supprimerUE
);

module.exports = router;
