// src/modules/cours/cours.routes.js
const router = require('express').Router();
const { body, param } = require('express-validator');
const controller = require('./cours.controller');
const { verifyToken, authorize } = require('../../middlewares/auth');
const { upload, handleUploadError } = require('../../middlewares/upload');
const { validate } = require('../../middlewares/validate');
const optionalAuth = require('../../middlewares/optionalAuth');
const downloadLimiter = require('../../middlewares/downloadLimiter');

// Middleware pour définir le sous-dossier d'upload
const setFolder = (folder) => (req, _res, next) => { req.uploadFolder = folder; next(); };

// Toutes les routes cours nécessitent une authentification
router.use(verifyToken);

// Lister les cours (étudiant voit les siens, enseignant/admin voient tout)
router.get('/', controller.listerCours);

// Détail d'un cours
router.get('/:id',
  param('id').isInt().withMessage('ID invalide'),
  validate,
  controller.getCours
);

// Télécharger un cours (gratuit, accessible publiquement sans compte)
router.get('/:id/telecharger', 
  optionalAuth, 
  downloadLimiter, 
  controller.telechargerCours
);

// Créer un cours (enseignant ou admin)
router.post('/',
  authorize('enseignant', 'admin'),
  setFolder('cours'),
  handleUploadError(upload.single('fichier')),
  [
    body('titre').trim().notEmpty().withMessage('Le titre est obligatoire'),
    body('ue_id').isInt().withMessage('UE invalide'),
    body('type').optional().isIn(['pdf', 'video', 'slide', 'autre']),
  ],
  validate,
  controller.creerCours
);

// Changer le statut d'un cours (admin uniquement)
router.patch('/:id/statut',
  authorize('admin'),
  [body('statut').isIn(['publie', 'archive', 'en_attente'])],
  validate,
  controller.changerStatut
);

// Supprimer un cours (admin uniquement)
router.delete('/:id',
  authorize('admin'),
  controller.supprimerCours
);

module.exports = router;
