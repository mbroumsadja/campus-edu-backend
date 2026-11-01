// src/modules/config/config.routes.js
// GET /api/v1/config — public : l'app mobile le lit au démarrage.
const router = require('express').Router();
const { getAppConfig } = require('../../middlewares/appVersion');
const { success } = require('../../utils/apiResponse');
const pkg = require('../../../package.json');

router.get('/', (req, res) => {
  const cfg = getAppConfig();
  res.set('Cache-Control', 'public, max-age=300'); // 5 min : pas de requête inutile à chaque écran
  return success(res, {
    apiVersion: 'v1',
    serverVersion: pkg.version,
    minAppVersion: cfg.minVersion,
    latestAppVersion: cfg.latestVersion,
    updateUrl: cfg.updateUrl,
    updateMessage: cfg.message,
    maxUploadMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50,
    allowedContentTypes: ['application/pdf', 'video/mp4', 'video/webm',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  });
});

module.exports = router;
