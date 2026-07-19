// src/middlewares/optionalAuth.js
const jwt             = require('jsonwebtoken');
const { Utilisateur } = require('../models');

// Ne bloque jamais la requête : si un token valide est présent,
// on attache req.user ; sinon req.user reste null (accès public).
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const utilisateur = await Utilisateur.findByPk(decoded.id, {
      attributes: ['id', 'matricule', 'nom', 'prenom', 'role', 'statut', 'filiere_id', 'niveau'],
    });

    req.user = (utilisateur && utilisateur.statut === 'actif') ? utilisateur : null;
  } catch (err) {
    req.user = null; // token invalide/expiré → traité comme anonyme, pas d'erreur
  }

  next();
};

module.exports = optionalAuth;