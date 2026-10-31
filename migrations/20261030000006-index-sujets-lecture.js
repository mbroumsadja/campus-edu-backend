'use strict';
// CE-14 — Index composite de lecture sur les sujets : liste par UE, filtrée sur le statut,
// triée par année académique décroissante (même ordre que la recherche et la liste des sujets).

const NAME = 'sujets_ue_statut_annee_idx';

module.exports = {
  async up(q) {
    await q.sequelize.query(
      `CREATE INDEX IF NOT EXISTS ${NAME} ON sujets (ue_id, statut, annee_academique DESC, id DESC)`
    );
  },
  async down(q) {
    await q.sequelize.query(`DROP INDEX IF EXISTS ${NAME}`);
  },
};
