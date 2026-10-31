'use strict';
// CE-16 — Recherche insensible aux accents.
//   1. installe f_unaccent(text) : extension unaccent si disponible, sinon fonction SQL pure
//   2. index trigramme (si pg_trgm est disponible) pour accélérer les recherches « contient »
// À exécuter en dehors d'une transaction : un CREATE EXTENSION refusé ne doit pas annuler le reste.
// Variable optionnelle : UNACCENT_MODE=fallback pour forcer le repli SQL.

const { installUnaccent } = require('../src/utils/unaccentSetup');

const INDEXES = [
  { name: 'cours_titre_unaccent_trgm',  table: 'cours',  column: 'titre' },
  { name: 'sujets_titre_unaccent_trgm', table: 'sujets', column: 'titre' },
];

module.exports = {
  async up(q) {
    const mode = await installUnaccent(q.sequelize);
    console.log(`   f_unaccent : ${mode === 'extension' ? 'extension unaccent' : 'repli SQL (extension indisponible)'}`);

    let trgm = false;
    try {
      const [[a]] = await q.sequelize.query("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') AS ok");
      if (a.ok) { await q.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm'); trgm = true; }
    } catch (_e) { trgm = false; }

    if (!trgm) { console.log('   pg_trgm indisponible : pas d\'index de recherche (les requêtes restent correctes)'); return; }

    // gin_trgm_ops peut vivre dans un autre schéma (Supabase : extensions)
    const [[ns]] = await q.sequelize.query(
      "SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'"
    );
    for (const { name, table, column } of INDEXES) {
      await q.sequelize.query(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING gin (f_unaccent(lower(${column})) ${ns.schema}.gin_trgm_ops)`
      );
    }
  },

  async down(q) {
    for (const { name } of INDEXES) await q.sequelize.query(`DROP INDEX IF EXISTS ${name}`);
    await q.sequelize.query('DROP FUNCTION IF EXISTS f_unaccent(text)');
    // Les extensions unaccent et pg_trgm sont laissées en place (d'autres objets peuvent en dépendre).
  },
};
