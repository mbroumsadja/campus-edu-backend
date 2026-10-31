'use strict';
// Correction des noms de fichiers enregistrés avec des séquences « %20 » (et autres %XX).
// Concerne UNIQUEMENT les noms affichés/téléchargés :
//   cours.nom_fichier_original, cours_documents.nom_fichier_original, sujets.nom_origine.
// Les colonnes chemin_* (URL Blob) ne sont jamais modifiées : un %20 y fait partie de l'URL.
// Irréversible par nature (on ne sait plus quelles lignes étaient encodées) : down ne fait rien.

const { cleanFileName } = require('../src/utils/fileName');

const TARGETS = [
  { table: 'cours',           column: 'nom_fichier_original' },
  { table: 'cours_documents', column: 'nom_fichier_original' },
  { table: 'sujets',          column: 'nom_origine' },
];

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (t) => {
      for (const { table, column } of TARGETS) {
        const [rows] = await q.sequelize.query(
          `SELECT id, ${column} AS nom FROM ${table} WHERE ${column} ~ '%[0-9A-Fa-f]{2}'`,
          { transaction: t }
        );
        for (const { id, nom } of rows) {
          const propre = cleanFileName(nom);
          if (propre && propre !== nom) {
            await q.sequelize.query(
              `UPDATE ${table} SET ${column} = :nom WHERE id = :id`,
              { transaction: t, replacements: { nom: propre, id } }
            );
          }
        }
        console.log(`   ${table}.${column} : ${rows.length} nom(s) corrigé(s)`);
      }
    });
  },

  async down() {},
};
