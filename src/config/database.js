require('dotenv').config();
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const nodeEnv = process.env.NODE_ENV || 'development';
const dialectFromEnv = (process.env.DATABASE_DIALECT || process.env.DB_DIALECT || '').toLowerCase();
const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
const dialect = connectionString ? dialectFromEnv || null : dialectFromEnv || 'mysql';

const pool = {
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
  idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
};

const define = {
  timestamps: true,
  underscored: true,
  freezeTableName: false,
};

const logging = nodeEnv === 'development'
  ? (sql) => logger.debug(sql)
  : false;

const buildSequelize = () => {
  const sharedOptions = {
    pool,
    define,
    logging,
  };

  if (nodeEnv === 'test') {
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      ...sharedOptions,
    });
  }

  if (connectionString) {
    const options = { ...sharedOptions };
    if (dialect) options.dialect = dialect;
    if (!dialect && /^postgres(?:ql)?:\/\//i.test(connectionString)) {
      options.dialect = 'postgres';
      options.dialectOptions = {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      };
    }
    if (!dialect && /^mysql:\/\//i.test(connectionString)) {
      options.dialect = 'mysql';
    }
    return new Sequelize(connectionString, options);
  }

  const database = nodeEnv === 'test'
    ? process.env.TEST_DB_NAME || process.env.DB_NAME || process.env.DATABASE_NAME
    : process.env.DB_NAME || process.env.DATABASE_NAME;
  const username = process.env.DB_USER || process.env.DATABASE_USER;
  const password = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;

  const useSqliteTest = nodeEnv === 'test' && !database && !process.env.DB_USER && !process.env.DATABASE_USER;
  if (useSqliteTest) {
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      ...sharedOptions,
    });
  }

  if (!database || !username) {
    throw new Error('Missing database configuration: DB_NAME and DB_USER are required.');
  }

  const options = {
    ...sharedOptions,
    dialect,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  };

  if (dialect === 'postgres' && process.env.DB_SSL === 'true') {
    options.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    };
  }

  return new Sequelize(database, username, password, options);
};

const sequelize = buildSequelize();

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`✅  Connexion ${sequelize.getDialect()} établie avec succès`);
  } catch (err) {
    logger.error(`❌  Impossible de se connecter à la base de données : ${err.message}`);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
