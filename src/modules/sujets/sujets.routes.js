// src/modules/sujets/sujets.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./sujets.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { upload, handleUploadError } = require('../../middlewares/upload');
const { validate } = require('../../middlewares/validate');
const optionalAuth    = require('../../middlewares/optionalAuth');
const downloadLimiter = require('../../middlewares/downloadLimiter');

const setFolder = (folder) => (req, _res, next) => { req.uploadFolder = folder; next(); };

router.use(verifyToken);

router.get('/',           controller.listerSujets);
router.get('/:id',        controller.getSujet);
router.get('/:id/telecharger', optionalAuth, downloadLimiter, controller.telechargerSujet);

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

router.patch('/:id/statut',
  authorize('admin'),
  [body('statut').isIn(['publie','archive','en_attente'])],
  validate,
  controller.changerStatut
);

module.exports = router;
