'use strict';
// CE-21 — Statistiques agrégées par jour, à la place d'une ligne par téléchargement.
//   stats_quotidiennes : (jour, type, cible_id) -> nombre de téléchargements
//   recherches_vides   : (jour, terme)          -> nombre de recherches sans résultat
//   telechargements    : historique par utilisateur ramené à UNE ligne par (utilisateur, cours)
// Reprise : l'historique existant est agrégé par jour dans stats_quotidiennes avant dédoublonnage.

module.exports = {
  async up(q, Sequelize) {
    const { DataTypes } = Sequelize;
    await q.sequelize.transaction(async (t) => {
      await q.createTable('stats_quotidiennes', {
        jour: { type: DataTypes.DATEONLY, allowNull: false, primaryKey: true },
        type: { type: DataTypes.ENUM('cours', 'sujet'), allowNull: false, primaryKey: true },
        cible_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
        telechargements: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      }, { transaction: t });
      await q.addIndex('stats_quotidiennes', ['type', 'cible_id'], { name: 'stats_quotidiennes_cible', transaction: t });

      await q.createTable('recherches_vides', {
        jour: { type: DataTypes.DATEONLY, allowNull: false, primaryKey: true },
        terme: { type: DataTypes.STRING(100), allowNull: false, primaryKey: true },
        nb: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      }, { transaction: t });

      const run = (sql) => q.sequelize.query(sql, { transaction: t });
      await run(`
        INSERT INTO stats_quotidiennes (jour, type, cible_id, telechargements)
        SELECT (created_at AT TIME ZONE 'UTC')::date, 'cours', cours_id, count(*) FROM telechargements GROUP BY 1, 3
        ON CONFLICT DO NOTHING`);
      // Une ligne par (utilisateur, cours) : on garde la première
      await run(`DELETE FROM telechargements a USING telechargements b
                  WHERE a.utilisateur_id = b.utilisateur_id AND a.cours_id = b.cours_id AND a.id > b.id`);
      await q.addIndex('telechargements', ['utilisateur_id', 'cours_id'],
        { name: 'telechargements_utilisateur_cours_unique', unique: true, transaction: t });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.removeIndex('telechargements', 'telechargements_utilisateur_cours_unique', { transaction: t });
      await q.dropTable('recherches_vides', { transaction: t });
      await q.dropTable('stats_quotidiennes', { transaction: t });
      await q.sequelize.query('DROP TYPE IF EXISTS enum_stats_quotidiennes_type', { transaction: t });
    });
  },
};
