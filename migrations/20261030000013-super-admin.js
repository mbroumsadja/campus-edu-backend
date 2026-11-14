'use strict';
// Rôle super_admin : valide les comptes administrateurs.
// - ajoute la valeur 'super_admin' au rôle ;
// - remplace la règle provisoire ADM-0010 (migration 12) : les comptes qu'elle avait remis en attente
//   sont réactivés (sauf les comptes admin), puis la colonne cree_par est supprimée ;
// - promeut ADM-0010 en super_admin s'il existe.
// Le retour arrière ne retire pas la valeur d'enum (non supporté par PostgreSQL) : les super_admin repassent admin.

module.exports = {
  async up(q, Sequelize) {
    // Hors transaction : ALTER TYPE ... ADD VALUE
    await q.sequelize.query(`ALTER TYPE "enum_utilisateurs_role" ADD VALUE IF NOT EXISTS 'super_admin'`);

    await q.sequelize.transaction(async (t) => {
      await q.sequelize.query(`
        UPDATE utilisateurs
           SET statut = 'actif'
         WHERE statut = 'en_attente' AND role <> 'admin'
           AND cree_par IN (SELECT id FROM utilisateurs WHERE UPPER(matricule) = 'ADM-0010')
      `, { transaction: t });
      await q.removeIndex('utilisateurs', 'utilisateurs_cree_par', { transaction: t });
      await q.removeColumn('utilisateurs', 'cree_par', { transaction: t });
    });

    await q.sequelize.query(`UPDATE utilisateurs SET role = 'super_admin' WHERE UPPER(matricule) = 'ADM-0010'`);
  },
  async down(q, Sequelize) {
    await q.sequelize.query(`UPDATE utilisateurs SET role = 'admin' WHERE role = 'super_admin'`);
    await q.addColumn('utilisateurs', 'cree_par', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'utilisateurs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
    });
    await q.addIndex('utilisateurs', ['cree_par'], { name: 'utilisateurs_cree_par' });
  },
};
