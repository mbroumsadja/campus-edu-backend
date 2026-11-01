// src/middlewares/deprecated.js
// CE-19 : marque une route comme dépréciée (RFC 8594) tout en continuant à la servir.
//   Deprecation: true | Sunset: <date HTTP> (DEPRECATION_SUNSET, optionnel) | Link: <successeur>; rel="successor-version"
const deprecated = (successor) => (req, res, next) => {
  res.set('Deprecation', 'true');
  if (process.env.DEPRECATION_SUNSET) res.set('Sunset', new Date(process.env.DEPRECATION_SUNSET).toUTCString());
  const cible = typeof successor === 'function' ? successor(req) : successor;
  if (cible) res.append('Link', `<${cible}>; rel="successor-version"`);
  next();
};

module.exports = { deprecated };
