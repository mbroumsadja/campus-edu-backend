// src/middlewares/cachePublic.js
// CE-17 : cache HTTP public pour la navigation hiérarchique (écoles, filières, UE).
// Remplace le "no-store" global posé dans app.js pour ces routes de lecture seule.
// Express génère l'ETag faible et répond 304 sur If-None-Match.

const num = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const cachePublic = (opts = {}) => (req, res, next) => {
  const maxAge = opts.maxAge ?? num(process.env.NAV_CACHE_MAX_AGE, 60);
  const sMaxAge = opts.sMaxAge ?? num(process.env.NAV_CACHE_S_MAXAGE, 300);
  const swr = opts.staleWhileRevalidate ?? num(process.env.NAV_CACHE_SWR, 600);

  const apply = () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
      );
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
      res.vary('Origin');
    }
  };

  // Les en-têtes doivent être posés juste avant l'envoi (après le statut final)
  const json = res.json.bind(res);
  res.json = (body) => {
    apply();
    return json(body);
  };
  next();
};

module.exports = { cachePublic };
