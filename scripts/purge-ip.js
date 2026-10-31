#!/usr/bin/env node
// CE-13 — Efface les IP / user-agents de plus de IP_RETENTION_DAYS jours (30 par défaut).
// À planifier chaque jour (cron Vercel, GitHub Actions ou tâche Render) : npm run db:purge-ip
require('dotenv').config();
const { sequelize } = require('../src/models');
const { purgeIpAddresses, retentionDays } = require('../src/utils/retention');

purgeIpAddresses(sequelize)
  .then((r) => { console.log(`Rétention ${retentionDays()} j :`, JSON.stringify(r)); return sequelize.close(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
