#!/usr/bin/env node
// CE-10 — Audit (et correction) des lignes orphelines avant la migration « relations obligatoires ».
//   node scripts/audit-orphelins.js          -> rapport seul (code de sortie 1 s'il y a des orphelins)
//   node scripts/audit-orphelins.js --fix    -> rattache les orphelins à l'UE « NC-000 » (école « Non classé »)
//                                               et archive les sujets/cours concernés
// Sauvegardez la base avant --fix.

require('dotenv').config();
const { Sequelize } = require('sequelize');

const ssl = process.env.DB_SSL === 'false' ? {} : { ssl: { require: true, rejectUnauthorized: false } };
const db = new Sequelize(process.env.DB_URL, { dialect: 'postgres', logging: false, dialectOptions: ssl });

const CHECKS = [
  { label: 'sujets sans UE valide',      table: 'sujets',   column: 'ue_id',      ref: 'ues' },
  { label: 'cours sans UE valide',       table: 'cours',    column: 'ue_id',      ref: 'ues' },
  { label: 'UE sans filière valide',     table: 'ues',      column: 'filiere_id', ref: 'filieres' },
  { label: 'filières sans école valide', table: 'filieres', column: 'ecole_id',   ref: 'ecoles' },
];

const find = async ({ table, column, ref }, transaction) => {
  const [rows] = await db.query(
    `SELECT x.id FROM ${table} x
       WHERE x.${column} IS NULL OR NOT EXISTS (SELECT 1 FROM ${ref} y WHERE y.id = x.${column})
       ORDER BY x.id`,
    { transaction }
  );
  return rows.map((r) => r.id);
};

const fix = async (transaction) => {
  const one = async (sql, repl) => (await db.query(sql, { transaction, replacements: repl }))[0][0];

  const ecole = (await one('SELECT id FROM ecoles WHERE ecole = :n', { n: 'Non classé' }))
    || await one("INSERT INTO ecoles (ecole, created_at, updated_at) VALUES ('Non classé', now(), now()) RETURNING id");
  const filiere = (await one('SELECT id FROM filieres WHERE code = :c', { c: 'NC' }))
    || await one(
      `INSERT INTO filieres (code, nom, departement, ecole_id, actif, created_at, updated_at)
       VALUES ('NC', 'Non classé', 'À reclasser', :e, false, now(), now()) RETURNING id`, { e: ecole.id });
  const ue = (await one('SELECT id FROM ues WHERE code = :c AND filiere_id = :f', { c: 'NC-000', f: filiere.id }))
    || await one(
      `INSERT INTO ues (code, intitule, niveau, semestre, credits, actif, filiere_id, created_at, updated_at)
       VALUES ('NC-000', 'Non classé (à reclasser)', 'L1', 'S1', 0, false, :f, now(), now()) RETURNING id`, { f: filiere.id });

  // Ordre : écoles -> filières -> UE -> sujets/cours
  await db.query(`UPDATE filieres SET ecole_id = :e WHERE ecole_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM ecoles y WHERE y.id = filieres.ecole_id)`,
                 { transaction, replacements: { e: ecole.id } });
  await db.query(`UPDATE ues SET filiere_id = :f WHERE filiere_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM filieres y WHERE y.id = ues.filiere_id)`,
                 { transaction, replacements: { f: filiere.id } });
  for (const table of ['sujets', 'cours']) {
    await db.query(`UPDATE ${table} SET ue_id = :u, statut = 'archive' WHERE ue_id IS NULL
                      OR NOT EXISTS (SELECT 1 FROM ues y WHERE y.id = ${table}.ue_id)`,
                   { transaction, replacements: { u: ue.id } });
  }
};

(async () => {
  const doFix = process.argv.includes('--fix');
  let total = 0;
  try {
    for (const c of CHECKS) {
      const ids = await find(c);
      total += ids.length;
      console.log(`${ids.length === 0 ? 'OK ' : 'KO '} ${c.label} : ${ids.length}${ids.length ? ` (ids : ${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ', …' : ''})` : ''}`);
    }
    if (total && doFix) {
      await db.transaction(fix);
      console.log('\nCorrection appliquée : orphelins rattachés à « Non classé / NC-000 » (sujets et cours archivés).');
      total = 0;
      for (const c of CHECKS) total += (await find(c)).length;
      console.log(total === 0 ? 'Vérification : plus aucun orphelin.' : `Attention : ${total} orphelin(s) restant(s).`);
    } else if (total) {
      console.log('\nOrphelins détectés. Relancez avec --fix après avoir sauvegardé la base.');
    }
  } finally {
    await db.close();
  }
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
