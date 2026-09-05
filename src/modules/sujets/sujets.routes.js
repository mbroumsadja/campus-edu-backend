// src/modules/sujets/sujets.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const { Sujet } = require('../../models');
const controller = require('./sujets.controller');
const { verifyToken, authorize, canManageOwnedResource } = require('../../middlewares/auth');
const { upload, handleUploadError } = require('../../middlewares/upload');
const { validate } = require('../../middlewares/validate');
const downloadLimiter = require('../../middlewares/downloadLimiter');

const setFolder = (folder) => (req, _res, next) => { req.uploadFolder = folder; next(); };

router.use(verifyToken);

router.get('/',           controller.listerSujets);
router.get('/:id',        controller.getSujet);
// Télécharger un sujet d'examen (réservé aux utilisateurs authentifiés)
router.get('/:id/telecharger', downloadLimiter, controller.telechargerSujet);

router.post('/',
  authorize('enseignant', 'admin'),
  setFolder('sujets'),
  handleUploadError(upload.fields([
    { name: 'sujet',   maxCount: 1 },
    { name: 'corrige', maxCount: 1 },
  ])),
  [
    body('titre').trim().notEmpty().withMessage('Titre obligatoire'),
    body('type').isIn(['partiel','rattrapage','terminal','tp','td']),
    body('session').isIn(['normale','rattrapage']),
    body('annee').isInt({ min: 2000, max: 2100 }).withMessage('Année invalide'),
    body('ue_id').isInt().withMessage('UE invalide'),
  ],
  validate,
  controller.creerSujet
);

router.put('/:id',
  authorize('enseignant', 'admin'),
  canManageOwnedResource(Sujet, 'enseignant_id'),
  setFolder('sujets'),
  handleUploadError(upload.fields([
    { name: 'sujet', maxCount: 1 },
    { name: 'corrige', maxCount: 1 },
  ])),
  [
    body('titre').optional().trim().notEmpty().withMessage('Titre obligatoire'),
    body('type').optional().isIn(['partiel','rattrapage','terminal','tp','td']),
    body('session').optional().isIn(['normale','rattrapage']),
    body('annee').optional().isInt({ min: 2000, max: 2100 }).withMessage('Année invalide'),
    body('ue_id').optional().isInt().withMessage('UE invalide'),
  ],
  validate,
  controller.modifierSujet
);

router.patch('/:id/statut',
  authorize('admin'),
  [body('statut').isIn(['publie','archive','en_attente'])],
  validate,
  controller.changerStatut
);

router.delete('/:id',
  authorize('enseignant', 'admin'),
  canManageOwnedResource(Sujet, 'enseignant_id'),
  controller.supprimerSujet
);

module.exports = router;
