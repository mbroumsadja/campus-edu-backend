// src/config/resetDb.js
require('dotenv').config();
const { sequelize } = require('./database');
const logger = require('../utils/logger');

const resetDB = async () => {
  try {
    // Récupère toutes les tables du schéma public
    const [tables] = await sequelize.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    `);

    if (tables.length === 0) {
      logger.info('Aucune table à vider.');
      return;
    }

    const nomsTables = tables.map(t => `"${t.tablename}"`).join(', ');

    // TRUNCATE ... RESTART IDENTITY remet aussi les compteurs auto-increment à 0
    // CASCADE gère les contraintes de clé étrangère entre tables
    await sequelize.query(`TRUNCATE ${nomsTables} RESTART IDENTITY CASCADE;`);

    logger.info(`✅  Base de données vidée avec succès (${tables.length} tables).`);
  } catch (err) {
    logger.error('❌  Erreur lors du reset : ' + err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

resetDB();