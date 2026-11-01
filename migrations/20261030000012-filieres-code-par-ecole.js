'use strict';
// CE-10 (suite, cahier §8.2) — Le code d'une filière n'est plus unique globalement mais par école :
// deux écoles peuvent avoir chacune une filière « INFO ». Réversible tant qu'aucun code n'est dupliqué.

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (t) => {
      // Supprime toute contrainte d'unicité portant uniquement sur `code` (le nom dépend de la façon dont la base a été créée)
      const [rows] = await q.sequelize.query(`
        SELECT c.conname FROM pg_constraint c
         WHERE c.conrelid = 'filieres'::regclass AND c.contype = 'u'
           AND (SELECT array_agg(a.attname::text) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['code']`,
        { transaction: t });
      for (const { conname } of rows) await q.sequelize.query(`ALTER TABLE filieres DROP CONSTRAINT "${conname}"`, { transaction: t });
      // Index unique seul (créé sans contrainte)
      await q.sequelize.query('DROP INDEX IF EXISTS filieres_code', { transaction: t });
      await q.addIndex('filieres', ['ecole_id', 'code'], { name: 'filieres_ecole_code_unique', unique: true, transaction: t });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.removeIndex('filieres', 'filieres_ecole_code_unique', { transaction: t });
      await q.sequelize.query('ALTER TABLE filieres ADD CONSTRAINT filieres_code_key UNIQUE (code)', { transaction: t });
    });
  },
};
