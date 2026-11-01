'use strict';
// CE-11 (suite) — Colonne depose_par : qui a déposé le sujet (traçabilité, indépendante de l'enseignant
// rattaché). Rempli à partir de enseignant_id pour les sujets existants. Réversible.

module.exports = {
  async up(q, Sequelize) {
    await q.sequelize.transaction(async (t) => {
      await q.addColumn('sujets', 'depose_par', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'utilisateurs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }, { transaction: t });
      await q.sequelize.query('UPDATE sujets SET depose_par = enseignant_id WHERE enseignant_id IS NOT NULL', { transaction: t });
      await q.addIndex('sujets', ['depose_par'], { name: 'sujets_depose_par', transaction: t });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.removeIndex('sujets', 'sujets_depose_par', { transaction: t });
      await q.removeColumn('sujets', 'depose_par', { transaction: t });
    });
  },
};
