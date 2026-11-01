// src/utils/unaccentSetup.js
// Installe la fonction SQL f_unaccent(text) utilisée par la recherche (CE-16).
//   - mode « extension » : enveloppe l'extension PostgreSQL unaccent (rapide, couvre tout Unicode)
//   - mode « repli »     : fonction SQL pure (translate/replace), sans extension ni droits particuliers
// Dans les deux cas le nom et le résultat sont les mêmes pour l'application : elle appelle toujours f_unaccent.
// La fonction est IMMUTABLE, donc utilisable dans un index.

const ACCENTS_FROM = 'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝŸýÿŠšŽžĆćČčĐđ';
const ACCENTS_TO   = 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYYyySsZzCcCcDd';

const sqlFallback = () => `
  CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text AS $$
    SELECT replace(replace(replace(replace(
             translate($1, '${ACCENTS_FROM}', '${ACCENTS_TO}'),
           'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE')
  $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT`;

const sqlExtension = (schema) => `
  CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text AS $$
    SELECT ${schema}.unaccent('${schema}.unaccent'::regdictionary, $1)
  $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT`;

// mode : 'auto' (défaut) | 'extension' | 'fallback'.  Renvoie le mode réellement installé.
const installUnaccent = async (sequelize, mode = process.env.UNACCENT_MODE || 'auto') => {
  const run = (sql) => sequelize.query(sql);
  let useExtension = false;

  if (mode !== 'fallback') {
    const [[avail]] = await run("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'unaccent') AS ok");
    if (avail.ok) {
      try {
        await run('CREATE EXTENSION IF NOT EXISTS unaccent');
        useExtension = true;
      } catch (_e) {
        useExtension = false; // droits insuffisants : on bascule sur le repli
      }
    }
    if (!useExtension && mode === 'extension') {
      throw new Error('Extension unaccent indisponible sur cette base (UNACCENT_MODE=extension).');
    }
  }

  if (useExtension) {
    // Supabase place les extensions dans un schéma dédié : on utilise le schéma réel
    const [[row]] = await run(
      "SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'"
    );
    await run(sqlExtension(row.schema));
    return 'extension';
  }

  await run(sqlFallback());
  return 'fallback';
};

const hasUnaccent = async (sequelize) => {
  const [[r]] = await sequelize.query("SELECT to_regproc('f_unaccent') IS NOT NULL AS ok");
  return r.ok;
};

module.exports = { installUnaccent, hasUnaccent };
