// src/config/resetDb.js
require('dotenv').config();
const { sequelize } = require('./database');
const logger = require('../utils/logger');

const resetDB = async () => {
  try {
    const dialect = sequelize.getDialect();
    let tables = [];

    if (dialect === 'postgres') {
      const [rows] = await sequelize.query(`
        SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public';
      `);
      tables = rows;
    } else if (dialect === 'mysql' || dialect === 'mariadb') {
      const [rows] = await sequelize.query(`
        SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';
      `);
      tables = rows;
    } else {
      throw new Error(`Dialect non supporté pour reset DB : ${dialect}`);
    }

    if (tables.length === 0) {
      logger.info('Aucune table à vider.');
      return;
    }

    const nomsTables = tables.map((t) => `\`${t.name}\``).join(', ');

    if (dialect === 'postgres') {
      await sequelize.query(`TRUNCATE ${nomsTables} RESTART IDENTITY CASCADE;`);
    } else {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
      for (const t of tables) {
        await sequelize.query(`TRUNCATE \`${t.name}\`;`);
      }
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
    }

    logger.info(`✅  Base de données vidée avec succès (${tables.length} tables).`);
  } catch (err) {
    logger.error('❌  Erreur lors du reset : ' + err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

resetDB();