// src/config/cors.js
// Politique CORS explicite (CE-06) : liste d'origines, plus de regex permissive.

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const isLocalOrigin = (origin) => LOCAL_ORIGIN.test(origin);

// Origines autorisées : FRONTEND_URL (valeur unique) et CORS_ORIGINS (liste séparée par des virgules)
const getAllowedOrigins = () => {
  const list = [
    process.env.FRONTEND_URL || 'https://campus-edu-admin.vercel.app',
    ...(process.env.CORS_ORIGINS || '').split(','),
  ];
  return list.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // app Android, curl, healthchecks : pas d'en-tête Origin
  const normalized = origin.trim().replace(/\/$/, '');
  if (getAllowedOrigins().includes(normalized)) return true;
  return process.env.NODE_ENV !== 'production' && isLocalOrigin(normalized);
};

const corsOptions = {
  // Origine inconnue : pas d'en-têtes CORS (le navigateur bloque), jamais d'exception
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Version'],
  exposedHeaders: ['Content-Disposition'],
};

module.exports = { corsOptions, isAllowedOrigin, isLocalOrigin, getAllowedOrigins };
