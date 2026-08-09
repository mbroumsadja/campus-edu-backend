require('dotenv').config();
const { sequelize } = require('./database');
const logger = require('../utils/logger');

const syncDB = async () => {
  try {
    await sequelize.sync({ alter: true });
    logger.info('✅  Tables synchronisées avec succès');
  } catch (err) {
    logger.error('❌  Erreur lors de la synchronisation :', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

syncDB();
