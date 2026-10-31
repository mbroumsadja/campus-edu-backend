require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const compression  = require('compression');
const path         = require('path');

const { connectDB }      = require('./config/database_production');
const logger             = require('./utils/logger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { corsOptions }    = require('./config/cors');
const { globalLimiter, loginLimiter } = require('./middlewares/rateLimiters');

// ── Routes ───────────────────────────────────────────────────────
const apiRouter = require('./routes/api');
const { checkAppVersion } = require('./middlewares/appVersion');
const openapiRoutes = require('./routes/openapi');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════════
//  MIDDLEWARES GLOBAUX
// ══════════════════════════════════════════════════════════════════

// 1. Sécurité HTTP (headers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.set('trust proxy', 1);

// 2. CORS — liste explicite d'origines (voir src/config/cors.js)
app.use(cors(corsOptions));

// 3. Compression gzip — réduit la taille des réponses JSON (~70%)
app.use(compression());

// 4. Parsing du corps des requêtes
app.use(express.json({ limit: '1mb' }));       // Limite pour éviter les DoS
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Logging des requêtes HTTP
app.use(morgan((tokens, req, res) => {
 return [
   new Date().toISOString(),
   tokens.method(req, res),
   tokens.url(req, res),
   tokens.status(req, res),
   `${tokens['response-time'](req, res)} ms`,
   '-',
   tokens.res(req, res, 'content-length') || 0,
 ].join(' ');
}, { stream: { write: (msg) => logger.info(msg.trim()) } }));

// 6. Rate limiting (fenêtre 15 min, store partagé si Upstash est configuré)
app.use(['/api/v1', '/api'], globalLimiter);
app.use(['/api/v1/auth/login', '/api/auth/login'], loginLimiter);

// 7. Servir les fichiers uploadés (accès contrôlé via les routes /telecharger)
//    Note: en production, déléguer ce rôle à Nginx pour de meilleures performances
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

// ══════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════
app.use((req,res,next)=> {
  res.setHeader('Cache-Control','no-store,no-cache,must-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  next();
})

// Contrat OpenAPI (public)
app.use('/api/v1', openapiRoutes);

// Version courante
app.use('/api/v1', checkAppVersion, apiRouter);

// Ancien chemin /api : conservé pour les clients existants, marqué comme déprécié (RFC 8594)
app.use('/api', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Link', `</api/v1${req.path}>; rel="successor-version"`);
  next();
}, checkAppVersion, apiRouter);

// Route de santé (healthcheck)
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`,
    env:       process.env.NODE_ENV,
  });
});

// ══════════════════════════════════════════════════════════════════
//  GESTION DES ERREURS (doit être APRÈS les routes)
// ══════════════════════════════════════════════════════════════════
app.use(notFound);      // 404 pour toute route inconnue
app.use(errorHandler);  // Gestionnaire d'erreurs global

// ══════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════════════════════════
const start = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`🚀  Serveur campus-edu démarré sur http://localhost:${PORT}`);
    logger.info(`    Environnement : ${process.env.NODE_ENV || 'development'}`);
    logger.info(`    Healthcheck   : http://localhost:${PORT}/health`);
  });

// Gestion propre de l'arrêt (Graceful shutdown)

  const gracefulShutdown = async (signal) => {
    logger.info(`\n${signal} reçu. Arrêt gracieux...`);
    server.close(async () => {
      logger.info('Serveur HTTP fermé.');
      const { sequelize } = require('./config/database_production');
      await sequelize.close();
      logger.info('Pool de connexions fermé. Au revoir 👋');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  // Log des erreurs non gérées sans crasher
  process.on('unhandledRejection', (reason) => {
    logger.error('Promesse rejetée non gérée :', reason);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
