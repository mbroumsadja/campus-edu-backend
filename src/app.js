require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const { connectDB }      = require('./config/database_production');
const logger             = require('./utils/logger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

// ── Modules (routes) ─────────────────────────────────────────────
const authRoutes     = require('./modules/auth/auth.routes');
const usersRoutes    = require('./modules/users/users.routes');
const coursRoutes    = require('./modules/cours/cours.routes');
const sujetsRoutes   = require('./modules/sujets/sujets.routes');
const filieresRoutes = require('./modules/filieres/filieres.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════════
//  MIDDLEWARES GLOBAUX
// ══════════════════════════════════════════════════════════════════

// 1. Sécurité HTTP (headers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Permet le téléchargement de fichiers
}));

// 2. CORS — origines autorisées uniquement
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://campus-edu-admin.vercel.app",
  'http://localhost:3001'
];

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, curl) en dev
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqué pour l'origine : ${origin}`));
    }
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['content-Disposition']
}));

// 3. Compression gzip — réduit la taille des réponses JSON (~70%)
//    Essentiel pour la performance sous charge
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

// 6. Rate limiting global — protection contre les abus
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15, // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
});

// Rate limit plus strict sur le login (anti brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message: { success: false, message: 'Trop de tentatives de connexion. Attendez 15 minutes.' },
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

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

app.use('/api/auth',     authRoutes);
app.use('/api/users',    usersRoutes);
app.use('/api/cours',    coursRoutes);
app.use('/api/sujets',   sujetsRoutes);
app.use('/api/filieres', filieresRoutes);
app.use('/api/search', require('./modules/search/search.routes'));

// Route de santé (healthcheck — utile pour Docker / load balancer)
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`,
    env:       process.env.NODE_ENV,
  });
});

// Route de test CORS (pratique pour débugger depuis le navigateur)
app.get('/api/ping', (_req, res) => {
  res.json({ success: true, message: 'Backend UniPortal opérationnel 🚀' });
});

// Route de diagnostic (UNIQUEMENT en développement)
// Test : GET http://localhost:3000/api/debug/user/ADM-0001
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/user/:matricule', async (req, res) => {
    try {
      const { Utilisateur } = require('./models');
      const user = await Utilisateur.findOne({
        where: { matricule: req.params.matricule.toUpperCase() },
        attributes: ['id', 'matricule', 'nom', 'prenom', 'role', 'statut'],
      });
      if (!user) return res.json({ found: false, matricule: req.params.matricule });
      res.json({ found: true, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

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
  // Essentiel pour ne pas couper des requêtes en cours lors d'un redémarrage
  const gracefulShutdown = async (signal) => {
    logger.info(`\n${signal} reçu. Arrêt gracieux...`);
    server.close(async () => {
      logger.info('Serveur HTTP fermé.');
      const { sequelize } = require('./config/database_developpement');
      await sequelize.close();
      logger.info('Pool MySQL fermé. Au revoir 👋');
      process.exit(0);
    });
    // Force l'arrêt après 10s si quelque chose bloque
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  // Log des erreurs non gérées sans crasher
  process.on('unhandledRejection', (reason) => {
    logger.error('Promesse rejetée non gérée :', reason);
  });
};

start();

module.exports = app; // Pour les tests
