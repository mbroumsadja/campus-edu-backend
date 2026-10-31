'use strict';
// Détection de doublons : empreinte SHA-256 des documents de cours (comme pour les sujets).
// Colonne nullable (les documents existants n'ont pas d'empreinte) + index de recherche.

module.exports = {
  async up(q, Sequelize) {
    await q.addColumn('cours_documents', 'sha256', { type: Sequelize.CHAR(64), allowNull: true });
    await q.addIndex('cours_documents', ['sha256'], { name: 'cours_documents_sha256' });
  },
  async down(q) {
    await q.removeIndex('cours_documents', 'cours_documents_sha256');
    await q.removeColumn('cours_documents', 'sha256');
  },
};
