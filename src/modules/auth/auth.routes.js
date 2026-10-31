const router     = require('express').Router();
const { body, param } = require('express-validator');
const controller = require('./auth.controller');
const { validate }     = require('../../middlewares/validate');
const { verifyToken }  = require('../../middlewares/auth');

// Validation login
const loginRules = [
  body('matricule')
    .trim().notEmpty().withMessage('Le matricule est obligatoire')
    .isLength({ min: 4, max: 20 }).withMessage('Matricule invalide'),
  body('password')
    .notEmpty().withMessage('Le mot de passe est obligatoire')
    .isLength({ min: 4 }).withMessage('Mot de passe trop court'),
];

// ── Routes publiques ──────────────────────────────────────────────
router.post('/login',   loginRules, validate, controller.login);
router.post('/refresh', controller.refresh);

// ── Routes protégées ──────────────────────────────────────────────
router.post('/logout',           verifyToken, controller.logout);
router.get('/sessions',           verifyToken, controller.listerSessions);
router.delete('/sessions/:id',    verifyToken, param('id').isUUID().withMessage('Identifiant de session invalide'), validate, controller.revoquerSession);
router.get('/me',                verifyToken, controller.me);
router.put('/change-password',   verifyToken, controller.changePassword);

module.exports = router;
