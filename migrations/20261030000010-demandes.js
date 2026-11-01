'use strict';
// CE-20 — Demandes publiques (sujet manquant, signalement). L'IP n'est pas stockée (empreinte salée seulement).

module.exports = {
  async up(q, Sequelize) {
    const { DataTypes } = Sequelize;
    const ref = (model, onDelete = 'SET NULL') => ({ type: DataTypes.INTEGER, allowNull: true, references: { model, key: 'id' }, onDelete, onUpdate: 'CASCADE' });
    await q.createTable('demandes', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      type: { type: DataTypes.ENUM('sujet_manquant', 'signalement'), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      contact: { type: DataTypes.STRING(150) },
      statut: { type: DataTypes.ENUM('nouvelle', 'en_cours', 'traitee', 'rejetee'), allowNull: false, defaultValue: 'nouvelle' },
      empreinte_auteur: { type: DataTypes.CHAR(64) },
      ue_id: ref('ues'),
      sujet_id: ref('sujets'),
      auteur_id: ref('utilisateurs'),
      traite_par: ref('utilisateurs'),
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('demandes', ['statut', 'created_at'], { name: 'demandes_statut_created_at' });
    await q.addIndex('demandes', ['ue_id'], { name: 'demandes_ue_id' });
    await q.addIndex('demandes', ['sujet_id'], { name: 'demandes_sujet_id' });
    await q.addIndex('demandes', ['empreinte_auteur', 'created_at'], { name: 'demandes_empreinte_auteur_created_at' });
  },
  async down(q) {
    await q.dropTable('demandes');
    await q.sequelize.query('DROP TYPE IF EXISTS enum_demandes_type');
    await q.sequelize.query('DROP TYPE IF EXISTS enum_demandes_statut');
  },
};
