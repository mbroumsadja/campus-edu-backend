// src/middlewares/appVersion.js
// Contrôle de la version de l'application mobile (CE-15).
// L'app envoie  X-App-Version: 1.4.0.  Si la version est inférieure à APP_MIN_VERSION,
// l'API répond 426 (Upgrade Required) pour que l'app affiche « mise à jour requise ».
// Sans en-tête (site web, curl, anciennes versions) la requête n'est jamais bloquée.

const { error } = require('../utils/apiResponse');

// Compare "1.10.2" et "1.9.0" numériquement ; renvoie null si le format est invalide
const parseVersion = (v) => {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
};

const compareVersions = (a, b) => {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
};

const getAppConfig = () => ({
  minVersion: process.env.APP_MIN_VERSION || '1.0.0',
  latestVersion: process.env.APP_LATEST_VERSION || process.env.APP_MIN_VERSION || '1.0.0',
  updateUrl: process.env.APP_UPDATE_URL || null,
  message: process.env.APP_UPDATE_MESSAGE || 'Une mise à jour de Campus Edu est nécessaire pour continuer.',
});

const checkAppVersion = (req, res, next) => {
  // /config doit toujours répondre, sinon l'app ne peut pas savoir qu'elle doit se mettre à jour
  if (req.path.startsWith('/config')) return next();

  const sent = req.get('X-App-Version');
  if (!sent) return next();

  const cfg = getAppConfig();
  if (compareVersions(sent, cfg.minVersion) === -1) {
    return res.status(426).json({
      success: false,
      code: 'APP_UPDATE_REQUIRED',
      message: cfg.message,
      minVersion: cfg.minVersion,
      updateUrl: cfg.updateUrl,
    });
  }
  return next();
};

module.exports = { checkAppVersion, compareVersions, getAppConfig };
