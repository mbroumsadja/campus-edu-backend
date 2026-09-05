// src/modules/cours/cours.routes.js
const router = require('express').Router();
const { body, param } = require('express-validator');
const { Cours } = require('../../models');
const controller = require('./cours.controller');
const { verifyToken, authorize, canManageOwnedResource } = require('../../middlewares/auth');
const { upload, handleUploadError } = require('../../middlewares/upload');
const { validate } = require('../../middlewares/validate');
const optionalAuth = require('../../middlewares/optionalAuth');
const downloadLimiter = require('../../middlewares/downloadLimiter');

// Middleware pour définir le sous-dossier d'upload
const setFolder = (folder) => (req, _res, next) => { req.uploadFolder = folder; next(); };

// La route de téléchargement doit rester publique (voir plus bas) —
// on applique donc verifyToken route par route plutôt qu'en global.

// Lister les cours (étudiant voit les siens, enseignant/admin voient tout)
router.get('/', verifyToken, controller.listerCours);

// Détail d'un cours
router.get('/:id',
  verifyToken,
  param('id').isInt().withMessage('ID invalide'),
  validate,
  controller.getCours
);

// Télécharger un cours (gratuit, accessible publiquement sans compte)
router.get('/:coursId/documents/:documentId/telecharger',
  optionalAuth,
  downloadLimiter,
  controller.telechargerDocument
);

// Créer un cours (enseignant ou admin)
router.post('/',
  verifyToken,
  authorize('enseignant', 'admin'),
  setFolder('cours'),
  handleUploadError(upload.array('documents')),
  [
    body('titre').trim().notEmpty().withMessage('Le titre est obligatoire'),
    body('ue_id').isInt().withMessage('UE invalide'),
    body('type').optional().isIn(['pdf', 'video', 'slide', 'autre']),
  ],
  validate,
  controller.creerCours
);

// Modifier un cours (son créateur ou un admin)
router.put('/:id',
  verifyToken,
  authorize('enseignant', 'admin'),
  canManageOwnedResource(Cours, 'enseignant_id'),
  setFolder('cours'),
  handleUploadError(upload.fields([
    { name: 'main', maxCount: 1 },
    { name: 'documents', maxCount: 10 },
  ])),
  [
    body('titre').optional().trim().notEmpty().withMessage('Le titre est obligatoire'),
    body('type').optional().isIn(['pdf', 'video', 'slide', 'autre']),
    body('ue_id').optional().isInt().withMessage('UE invalide'),
    body('description').optional(),
    body('anneAcademique').optional().matches(/^\d{4}-\d{4}$/).withMessage('Année académique invalide'),
  ],
  validate,
  controller.modifierCours
);

// Changer le statut d'un cours (admin uniquement)
router.patch('/:id/statut',
  verifyToken,
  authorize('admin'),
  [body('statut').isIn(['publie', 'archive', 'en_attente'])],
  validate,
  controller.changerStatut
);

// Supprimer un cours (son créateur ou un admin)
router.delete('/:id',
  verifyToken,
  authorize('enseignant', 'admin'),
  canManageOwnedResource(Cours, 'enseignant_id'),
  controller.supprimerCours
);

module.exports = router;
