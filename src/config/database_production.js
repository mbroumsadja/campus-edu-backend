// src/config/database.js
// Connexion Sequelize avec pool de connexions pour la montée en charge

const { Sequelize } = require('sequelize');
const logger        = require('../utils/logger');

require('pg');
require('pg-hstore');

const sequelize = new Sequelize(process.env.DB_URL,
  {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      // SSL requis par défaut (Supabase/Neon) ; DB_SSL=false pour un PostgreSQL local
      ...(process.env.DB_SSL === 'false'
        ? {}
        : { ssl: { require: true, rejectUnauthorized: false } }),
      connectTimeout: 20000,
    },

    pool: {
      max:     parseInt(process.env.DB_POOL_MAX)  || 10,
      min:     parseInt(process.env.DB_POOL_MIN)  || 2,   
      acquire: 30000,
      idle:    parseInt(process.env.DB_POOL_IDLE) || 10000,
    },

    // ── Performance ────────────────────────────────────────────────────
    logging: process.env.NODE_ENV === 'development'
      ? (sql) => logger.debug(sql)
      : false,

    define: {
      timestamps:  true,       
      underscored: true,       
      freezeTableName: false, 
    },
  }
);

// Garde-fou (CE-09) : le schéma de production ne change que par migrations.
const originalSync = sequelize.sync.bind(sequelize);
sequelize.sync = (options = {}) => {
  if (process.env.NODE_ENV === 'production' && (options.alter || options.force)) {
    throw new Error('sync({ alter | force }) est interdit en production : utilisez les migrations (npm run db:migrate).');
  }
  return originalSync(options);
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅  Connexion PostgreSQL établie avec succès');
  } catch (err) {
    logger.error('❌  Impossible de se connecter à PostgreSQL :', err
    );
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB};