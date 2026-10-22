// src/docs/swagger.js
// Monte la documentation interactive sur /api/docs (spec brute : /api/docs.json)
const swaggerUi = require('swagger-ui-express');
const spec = require('./openapi');

module.exports = (app) => {
  app.get('/api/docs.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'Campus Edu API — Documentation',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'list', filter: true },
  }));
};
