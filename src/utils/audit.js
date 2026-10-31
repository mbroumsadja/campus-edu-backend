// src/utils/audit.js
// CE-13 : écritures de journal / compteurs fiables en serverless.
// Sur Vercel, une promesse non attendue est coupée dès que la réponse part : on attend donc
// l'écriture, mais une panne du journal ne doit jamais casser la requête.
const logger = require('./logger');

const safely = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`${label} : ${err.message}`);
    return null;
  }
};

const audit = (entry) => {
  const { AuditLog } = require('../models');
  return safely('audit', () => AuditLog.create(entry));
};

const bump = (instance, fields) => safely('compteur', () => instance.increment(fields));

const record = (Model, values) => safely('historique', () => Model.create(values));

module.exports = { audit, bump, record, safely };
