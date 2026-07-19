// src/modules/users/users.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./users.controller');
const { verifyToken, authorize, ownerOrAdmin } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken);

// Admin : gestion complète des utilisateurs
router.get('/',    authorize('admin'), controller.listerUtilisateurs);
router.get('/:id', authorize('admin'), controller.getUtilisateur);

router.post('/',
  authorize('admin'),
  [
    body('matricule').trim().notEmpty(),
    body('nom').trim().notEmpty(),
    body('prenom').trim().notEmpty(),
    body('role').isIn(['etudiant','enseignant','admin']),
    body('filiere_id').optional().isInt(),
    body('niveau').optional().isIn(['L1','L2','L3','M1','M2']),
    body('email').optional().isEmail(),
  ],
  validate,
  controller.creerUtilisateur
);

router.put('/:id',         authorize('admin'), controller.modifierUtilisateur);
router.patch('/:id/statut', authorize('admin'),
  [body('statut').isIn(['actif','en_attente','suspendu'])],
  validate,
  controller.changerStatut
);
router.delete('/:id',      authorize('admin'), controller.supprimerUtilisateur);

module.exports = router;
