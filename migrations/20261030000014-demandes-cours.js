'use strict';
// Demandes de cours par les étudiants : nouveau type 'cours_demande' + nom de l'étudiant et du cours demandé.

module.exports = {
  async up(q, Sequelize) {
    // Hors transaction : ALTER TYPE ... ADD VALUE
    await q.sequelize.query(`ALTER TYPE "enum_demandes_type" ADD VALUE IF NOT EXISTS 'cours_demande'`);
    await q.addColumn('demandes', 'nom_etudiant', { type: Sequelize.STRING(150), allowNull: true });
    await q.addColumn('demandes', 'nom_cours', { type: Sequelize.STRING(200), allowNull: true });
  },
  async down(q) {
    await q.sequelize.query(`DELETE FROM demandes WHERE type = 'cours_demande'`);
    await q.removeColumn('demandes', 'nom_cours');
    await q.removeColumn('demandes', 'nom_etudiant');
  },
};
