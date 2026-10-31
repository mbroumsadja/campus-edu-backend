// src/utils/retention.js
// CE-13 : les adresses IP et user-agents ne sont conservés que IP_RETENTION_DAYS jours (30 par défaut).
// Après ce délai les colonnes sont mises à NULL ; le reste de la ligne (action, date) est conservé.
const { QueryTypes } = require('sequelize');

const TABLES = ['audit_logs', 'telechargements'];

const retentionDays = () => {
  const n = parseInt(process.env.IP_RETENTION_DAYS, 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
};

const purgeIpAddresses = async (sequelize, days = retentionDays()) => {
  const result = {};
  for (const table of TABLES) {
    const [, meta] = await sequelize.query(
      `UPDATE ${table} SET ip_address = NULL, user_agent = NULL
        WHERE created_at < NOW() - make_interval(days => :days)
          AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)`,
      { replacements: { days }, type: QueryTypes.RAW }
    );
    result[table] = meta?.rowCount ?? 0;
  }
  return result;
};

module.exports = { purgeIpAddresses, retentionDays };
