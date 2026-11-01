// src/config/sequelize-cli.js
// Configuration lue par sequelize-cli (npm run db:migrate). Utilise DB_URL.
// DB_SSL=false pour un PostgreSQL local.
require('dotenv').config();

const base = {
  use_env_variable: 'DB_URL',
  dialect: 'postgres',
  dialectOptions: process.env.DB_SSL === 'false'
    ? {}
    : { ssl: { require: true, rejectUnauthorized: false } },
  define: { underscored: true, timestamps: true },
  migrationStorageTableName: 'sequelize_meta',
};

module.exports = { development: base, test: base, production: base };
