'use strict';
// CE-11 — Modèle Sujet v2, phase « étendre » (les anciennes colonnes sont conservées).
//   + annee_academique (ex. 2024-2025)       + type_epreuve (partiel, terminal, tp, td)
//   + taille_octets, nom_origine, mime        + sha256 (unique)  + corrige_sha256
//   + nb_telechargements (remplace telechargemements, faute de frappe)
// Données existantes :
//   - type_epreuve = type (« rattrapage » devient « terminal » et la session passe à « rattrapage »)
//   - annee_academique = (annee-1)-annee  (HYPOTHÈSE : l'année d'examen est l'année de fin ; à corriger si besoin)
//   - nb_telechargements = telechargemements
// Phase « contracter » (suppression de type/annee/telechargemements) : migration ultérieure,
// quand plus aucune version d'APK n'utilise l'ancien contrat.

module.exports = {
  async up(q, Sequelize) {
    const { DataTypes } = Sequelize;
    await q.sequelize.transaction(async (t) => {
      await q.addColumn('sujets', 'annee_academique', { type: DataTypes.STRING(9) }, { transaction: t });
      await q.addColumn('sujets', 'type_epreuve',
        { type: DataTypes.ENUM('partiel', 'terminal', 'tp', 'td') }, { transaction: t });
      await q.addColumn('sujets', 'taille_octets', { type: DataTypes.BIGINT }, { transaction: t });
      await q.addColumn('sujets', 'nom_origine', { type: DataTypes.STRING(255) }, { transaction: t });
      await q.addColumn('sujets', 'mime', { type: DataTypes.STRING(100) }, { transaction: t });
      await q.addColumn('sujets', 'sha256', { type: DataTypes.CHAR(64) }, { transaction: t });
      await q.addColumn('sujets', 'corrige_sha256', { type: DataTypes.CHAR(64) }, { transaction: t });
      await q.addColumn('sujets', 'nb_telechargements',
        { type: DataTypes.INTEGER, defaultValue: 0 }, { transaction: t });

      const run = (sql) => q.sequelize.query(sql, { transaction: t });
      await run(`UPDATE sujets SET session = 'rattrapage' WHERE type = 'rattrapage' AND session <> 'rattrapage'`);
      await run(`UPDATE sujets SET type_epreuve = (CASE type::text WHEN 'rattrapage' THEN 'terminal' ELSE type::text END)::enum_sujets_type_epreuve`);
      await run(`UPDATE sujets SET annee_academique = (annee - 1)::text || '-' || annee::text`);
      await run(`UPDATE sujets SET nb_telechargements = COALESCE(telechargemements, 0)`);

      await q.addIndex('sujets', ['sha256'],
        { name: 'sujets_sha256_unique', unique: true, transaction: t });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (t) => {
      await q.removeIndex('sujets', 'sujets_sha256_unique', { transaction: t });
      for (const col of ['nb_telechargements', 'corrige_sha256', 'sha256', 'mime', 'nom_origine',
        'taille_octets', 'type_epreuve', 'annee_academique']) {
        await q.removeColumn('sujets', col, { transaction: t });
      }
      await q.sequelize.query('DROP TYPE IF EXISTS enum_sujets_type_epreuve', { transaction: t });
    });
  },
};
