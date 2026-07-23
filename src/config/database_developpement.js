const {Sequelize} = require('sequelize');
const logger        = require('../utils/logger');

const sequelize = new Sequelize('campus_edu','mbroumsadja','mbroumsadja',{
    dialect: 'mysql',
    host: 'localhost',
    port: 3306,
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅  Connexion MySQL établie avec succès');
  } catch (err) {
    logger.error('❌  Impossible de se connecter à MySQL :', err.message);
    process.exit(1);
  }
};

module.exports = {sequelize, connectDB};