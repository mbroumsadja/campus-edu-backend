#!/usr/bin/env node
// CE-13 — Efface les IP / user-agents de plus de IP_RETENTION_DAYS jours (30 par défaut).
// À planifier chaque jour (cron Vercel, GitHub Actions ou tâche Render) : npm run db:purge-ip
require('dotenv').config();
const { sequelize } = require('../src/models');
const { purgeIpAddresses, purgeRecherchesVides, retentionDays } = require('../src/utils/retention');

purgeIpAddresses(sequelize)
  .then(async (r) => {
    console.log(`Rétention ${retentionDays()} j :`, JSON.stringify(r));
    console.log('Recherches sans résultat purgées :', await purgeRecherchesVides(sequelize));
    return sequelize.close();
  })
  .catch((e) => { console.error(e.message); process.exit(1); });
