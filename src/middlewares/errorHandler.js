// src/middlewares/errorHandler.js
// Gestionnaire d'erreurs global — attrape toutes les erreurs non gérées

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log complet pour le debugging
  logger.error({
    message:  err.message,
    stack:    err.stack,
    url:      req.originalUrl,
    method:   req.method,
    userId:   req.user?.id,
  });

  // Erreurs Sequelize de validation
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map(e => ({ field: e.path, message: e.message }));
    return res.status(400).json({ success: false, message: 'Données invalides', errors: messages });
  }

  // Erreur de contrainte unique (matricule, email déjà pris)
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'champ';
    return res.status(409).json({ success: false, message: `Ce ${field} est déjà utilisé.` });
  }

  // Erreur de clé étrangère
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ success: false, message: 'Référence invalide.' });
  }

  // Erreur générique
  const statusCode = err.statusCode || 500;
  const message    = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Erreur interne du serveur.'
    : err.message;

  return res.status(statusCode).json({ success: false, message });
};

// ──────────────────────────────────────────────────────────────────
//  Route introuvable
// ──────────────────────────────────────────────────────────────────
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route introuvable : ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFound };
