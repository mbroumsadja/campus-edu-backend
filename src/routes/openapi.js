// src/routes/openapi.js
//   GET /api/v1/openapi.json  — contrat OpenAPI (public)
//   GET /api/v1/docs          — page de documentation (générée depuis le contrat, sans ressource externe)
//   GET /api/v1/docs/swagger  — Swagger UI pour tester les appels (script chargé depuis jsDelivr)
// Désactiver les pages avec DOCS_ENABLED=false (le contrat JSON reste servi).

const router = require('express').Router();
const spec = require('../docs/openapi');
const { renderPage, CSS, CLIENT_JS } = require('../docs/renderDocs');

// Swagger UI est chargé depuis jsDelivr, version figée + empreintes SRI (le navigateur refuse un fichier modifié).
// Pas de dépendance serveur : fonctionne aussi sur Vercel (fonctions serverless).
const SWAGGER_UI_VERSION = '5.17.14';
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
const SRI = {
  css: 'sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn',
  js:  'sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep',
};

// CSP propre à cette page : le CSP strict de helmet bloquerait les scripts externes
const DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const docsEnabled = () => process.env.DOCS_ENABLED !== 'false';

router.get('/openapi.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(spec);
});

router.get('/docs/swagger/init.js', (req, res, next) => {
  if (!docsEnabled()) return next();
  res.type('application/javascript').send(
    `window.ui = SwaggerUIBundle({
  url: ${JSON.stringify(`${req.baseUrl}/openapi.json`)},
  dom_id: '#swagger-ui',
  deepLinking: true,
  persistAuthorization: true,
  tryItOutEnabled: true,
  docExpansion: 'none',
});`
  );
});

router.get('/docs/swagger', (req, res, next) => {
  if (!docsEnabled()) return next();
  res.set('Content-Security-Policy', DOCS_CSP);
  res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Campus Edu API — Tester (Swagger)</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${SRI.css}" crossorigin="anonymous">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/swagger-ui-bundle.js" integrity="${SRI.js}" crossorigin="anonymous"></script>
  <script src="${req.baseUrl}/docs/swagger/init.js"></script>
</body>
</html>`);
});

// ── Page de documentation autonome ─────────────────────────────────
// CSP strict : tout vient de l'API elle-même (aucun script ni style en ligne, aucun domaine externe)
const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

router.get('/docs/style.css', (req, res, next) => {
  if (!docsEnabled()) return next();
  res.set('Cache-Control', 'public, max-age=300').type('text/css').send(CSS);
});

router.get('/docs/app.js', (req, res, next) => {
  if (!docsEnabled()) return next();
  res.set('Cache-Control', 'public, max-age=300').type('application/javascript').send(CLIENT_JS);
});

router.get('/docs', (req, res, next) => {
  if (!docsEnabled()) return next();
  res.set({ 'Content-Security-Policy': PAGE_CSP, 'Cache-Control': 'public, max-age=300' });
  res.type('html').send(renderPage(spec, { baseUrl: req.baseUrl, origin: `${req.protocol}://${req.get('host')}` }));
});

module.exports = router;
