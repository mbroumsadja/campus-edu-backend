'use strict';
// CE-10 — Relations obligatoires : clés étrangères NOT NULL + ON DELETE RESTRICT.
//   sujets.ue_id -> ues, cours.ue_id -> ues, ues.filiere_id -> filieres, filieres.ecole_id -> ecoles
// Refuse de s'exécuter s'il reste des orphelins : lancer d'abord `npm run db:audit`
// (puis `npm run db:audit -- --fix` pour les rattacher à une UE « Non classé »).

const RELATIONS = [
  { table: 'sujets',   column: 'ue_id',      ref: 'ues' },
  { table: 'cours',    column: 'ue_id',      ref: 'ues' },
  { table: 'ues',      column: 'filiere_id', ref: 'filieres' },
  { table: 'filieres', column: 'ecole_id',   ref: 'ecoles' },
];

const swapConstraint = async (q, t, { table, column, ref }, onDelete, notNull) => {
  const name = `${table}_${column}_fkey`;
  await q.sequelize.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`, { transaction: t });
  await q.sequelize.query(
    `ALTER TABLE ${table} ALTER COLUMN ${column} ${notNull ? 'SET' : 'DROP'} NOT NULL`,
    { transaction: t }
  );
  await q.sequelize.query(
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${ref}(id) ON UPDATE CASCADE ON DELETE ${onDelete}`,
    { transaction: t }
  );
};

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (t) => {
      const problems = [];
      for (const { table, column, ref } of RELATIONS) {
        const [[r]] = await q.sequelize.query(
          `SELECT count(*)::int AS n FROM ${table} x
             WHERE x.${column} IS NULL
                OR NOT EXISTS (SELECT 1 FROM ${ref} y WHERE y.id = x.${column})`,
          { transaction: t }
        );
        if (r.n > 0) problems.push(`${table}.${column}: ${r.n} orphelin(s)`);
      }
      if (problems.length) {
        throw new Error(
          `Migration refusée, orphelins détectés (${problems.join('; ')}). ` +
          'Lancez `npm run db:audit` puis `npm run db:audit -- --fix`.'
        );
      }
      for (const rel of RELATIONS) await swapConstraint(q, t, rel, 'RESTRICT', true);
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (t) => {
      for (const rel of RELATIONS) {
        // État d'origine : sujets/cours/ues en SET NULL nullable, filieres.ecole_id en CASCADE NOT NULL
        const original = rel.table === 'filieres'
          ? ['CASCADE', true]
          : ['SET NULL', false];
        await swapConstraint(q, t, rel, ...original);
      }
    });
  },
};
