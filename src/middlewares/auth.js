// src/middlewares/auth.js
// Middlewares d'authentification et d'autorisation par rôle

const jwt              = require('jsonwebtoken');
const { Utilisateur }  = require('../models');
const { error }        = require('../utils/apiResponse');

// ──────────────────────────────────────────────────────────────────
//  verifyToken : vérifie le JWT dans l'en-tête Authorization
// ──────────────────────────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Token d\'accès manquant', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier que l'utilisateur existe encore et est actif
    // Note: on utilise findOne avec cache possible en Phase 2 (Redis)
    const utilisateur = await Utilisateur.findByPk(decoded.id, {
      attributes: ['id', 'matricule', 'nom', 'prenom', 'role', 'statut', 'filiere_id', 'niveau'],
    });

    if (!utilisateur) {
      return error(res, 'Utilisateur introuvable', 401);
    }

    if (utilisateur.statut === 'suspendu') {
      return error(res, 'Compte suspendu. Contactez l\'administration.', 403);
    }

    if (utilisateur.statut === 'en_attente') {
      return error(res, 'Compte en attente de validation.', 403);
    }

    // Attacher l'utilisateur à la requête pour les middlewares suivants
    req.user = utilisateur;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Session expirée. Veuillez vous reconnecter.', 401);
    }
    if (err.name === 'JsonWebTokenError') {
      return error(res, 'Token invalide.', 401);
    }
    return error(res, 'Erreur d\'authentification.', 500);
  }
};


// ──────────────────────────────────────────────────────────────────
//  authorize : vérifie que l'utilisateur a le(s) rôle(s) requis
//  Usage: authorize('admin') ou authorize('admin', 'enseignant')
// ──────────────────────────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Non authentifié.', 401);
    }

    if (!roles.includes(req.user.role)) {
      return error(res, `Accès refusé. Rôle requis : ${roles.join(' ou ')}.`, 403);
    }

    next();
  };
};


// ──────────────────────────────────────────────────────────────────
//  ownerOrAdmin : l'utilisateur peut accéder à sa propre ressource
//  OU à n'importe quelle ressource s'il est admin
// ──────────────────────────────────────────────────────────────────
const ownerOrAdmin = (paramIdField = 'id') => {
  return (req, res, next) => {
    const resourceId = parseInt(req.params[paramIdField]);
    const isOwner    = req.user.id === resourceId;
    const isAdmin    = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return error(res, 'Accès refusé à cette ressource.', 403);
    }

    next();
  };
};

module.exports = { verifyToken, authorize, ownerOrAdmin };
