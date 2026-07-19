// src/middlewares/validate.js
// Middleware de validation avec express-validator

const { validationResult } = require('express-validator');
const { error }            = require('../utils/apiResponse');

// Intercepte les erreurs de validation et renvoie une réponse claire
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(
      res,
      'Données invalides',
      400,
      errors.array().map(e => ({ field: e.path, message: e.msg }))
    );
  }
  next();
};

module.exports = { validate };
