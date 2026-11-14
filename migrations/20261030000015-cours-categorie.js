'use strict';
// Sépare les supports de révision des cours : colonne categorie ('cours' | 'support').
// Reprise : les cours dont le titre commence par « 100 » deviennent des supports (préfixe retiré).
// Réversible : le préfixe « 100 » est remis sur les titres des supports.

module.exports = {
  async up(q, Sequelize) {
    await q.sequelize.transaction(async (t) => {
      await q.addColumn('cours', 'categorie', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'cours',
      }, { transaction: t });
      await q.sequelize.query(
        "ALTER TABLE cours ADD CONSTRAINT cours_categorie_check CHECK (categorie IN ('cours','support'))",
        { transaction: t });
      await q.addIndex('cours', ['categorie'], { name: 'cours_categorie', transaction: t });
      await q.sequelize.query(`
        UPDATE cours
           SET categorie = 'support', titre = regexp_replace(titre, '^\\s*100\\s+', '')
         WHERE titre ~* '^\\s*100\\s+'
      `, { transaction: t });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.sequelize.query("UPDATE cours SET titre = '100 ' || titre WHERE categorie = 'support'", { transaction: t });
      await q.removeIndex('cours', 'cours_categorie', { transaction: t });
      await q.sequelize.query('ALTER TABLE cours DROP CONSTRAINT IF EXISTS cours_categorie_check', { transaction: t });
      await q.removeColumn('cours', 'categorie', { transaction: t });
    });
  },
};
