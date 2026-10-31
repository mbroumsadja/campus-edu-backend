'use strict';
// CE-09 — Migration de référence : état du schéma tel que créé par sync() avant les migrations.
// Idempotente : sur une base existante (copie de production), elle ne fait rien et se
// contente d'être enregistrée comme appliquée.

const fs = require('fs');
const path = require('path');

module.exports = {
  async up(queryInterface) {
    const [[row]] = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.sujets') AS t"
    );
    if (row.t) return; // schéma déjà présent

    const sql = fs.readFileSync(path.join(__dirname, 'sql', '000_baseline.sql'), 'utf8');
    await queryInterface.sequelize.query(sql);
  },

  async down() {
    // Volontairement non réversible : supprimer la référence détruirait toutes les données.
    throw new Error('La migration de référence ne peut pas être annulée.');
  },
};
