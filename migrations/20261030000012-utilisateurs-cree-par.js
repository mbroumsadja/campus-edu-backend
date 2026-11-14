'use strict';
// Règle ADM-0010 : colonne cree_par (admin créateur du compte).
// Rattrapage : l'auteur est retrouvé dans le journal d'audit (CREATE_USER) et les comptes
// déjà créés par ADM-0010 repassent « en attente » (sauf les comptes admin/validateur lui-même).
// Réversible.

module.exports = {
  async up(q, Sequelize) {
    await q.sequelize.transaction(async (t) => {
      await q.addColumn('utilisateurs', 'cree_par', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'utilisateurs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }, { transaction: t });

      await q.sequelize.query(`
        UPDATE utilisateurs u
           SET cree_par = l.utilisateur_id
          FROM (
            SELECT DISTINCT ON (details->>'cible') details->>'cible' AS cible, utilisateur_id
              FROM audit_logs
             WHERE action = 'CREATE_USER' AND utilisateur_id IS NOT NULL
             ORDER BY details->>'cible', id DESC
          ) l
         WHERE u.matricule = l.cible AND u.id <> l.utilisateur_id
      `, { transaction: t });

      await q.sequelize.query(`
        UPDATE utilisateurs
           SET statut = 'en_attente'
         WHERE statut = 'actif'
           AND cree_par IN (SELECT id FROM utilisateurs WHERE UPPER(matricule) = 'ADM-0010')
      `, { transaction: t });

      await q.addIndex('utilisateurs', ['cree_par'], { name: 'utilisateurs_cree_par', transaction: t });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.removeIndex('utilisateurs', 'utilisateurs_cree_par', { transaction: t });
      await q.removeColumn('utilisateurs', 'cree_par', { transaction: t });
    });
  },
};
