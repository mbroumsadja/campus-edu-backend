// src/docs/swagger.js
// Documentation interactive (Swagger UI) sur /api/docs — spec brute : /api/docs.json
//
// Swagger UI est chargé depuis un CDN : aucun fichier statique à servir, ce qui
// fonctionne aussi sur Vercel (serverless). Le CSP de helmet est assoupli
// uniquement pour cette page (et sans `upgrade-insecure-requests`, qui cassait
// le chargement en http://localhost).
const spec = require('./openapi');

const CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

const docsCsp = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' https://cdn.jsdelivr.net`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "connect-src 'self'",
  ].join('; '));
  next();
};

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Campus Edu API — Documentation</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
  <style>body{margin:0;background:#fff}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/swagger-ui-bundle.js"></script>
  <script src="/api/docs/init.js"></script>
</body>
</html>`;

const init = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '/api/docs.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    persistAuthorization: true,
    filter: true,
    docExpansion: 'list',
  });
});`;

module.exports = (app) => {
  app.get('/api/docs.json', (_req, res) => res.json(spec));
  app.get('/api/docs/init.js', docsCsp, (_req, res) => res.type('application/javascript').send(init));
  app.get(['/api/docs', '/api/docs/'], docsCsp, (_req, res) => res.type('html').send(html));
};
