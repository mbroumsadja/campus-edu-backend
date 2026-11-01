const { sequelize } = require('../../src/models');

describe('CE-14 — index composite de lecture des sujets', () => {
  it('l\'index (ue_id, statut, annee_academique) existe', async () => {
    const [rows] = await sequelize.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'sujets_ue_statut_annee_idx'");
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/ue_id, statut, annee_academique DESC/);
  });

  it('EXPLAIN de la liste par UE utilise l\'index, sans tri séparé', async () => {
    const plan = await sequelize.transaction(async (t) => {
      await sequelize.query('SET LOCAL enable_seqscan = off', { transaction: t });
      await sequelize.query('SET LOCAL enable_bitmapscan = off', { transaction: t });
      const [r] = await sequelize.query(
        `EXPLAIN SELECT id FROM sujets WHERE ue_id = 1 AND statut = 'publie'
          ORDER BY annee_academique DESC, id DESC LIMIT 20`, { transaction: t });
      return r.map((x) => x['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/sujets_ue_statut_annee_idx/);
    expect(plan).not.toMatch(/\bSort\b/);
  });
});
