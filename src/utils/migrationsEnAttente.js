// src/utils/migrationsEnAttente.js
// Compare les fichiers de migrations avec la table sequelize_meta : liste celles qui n'ont pas été appliquées.
const fs = require('fs');
const path = require('path');

const DOSSIER = path.resolve(__dirname, '..', '..', 'migrations');

const migrationsEnAttente = async (sequelize, dossier = DOSSIER) => {
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.js')).sort();
  const [[{ existe }]] = await sequelize.query("SELECT to_regclass('sequelize_meta') IS NOT NULL AS existe");
  if (!existe) return fichiers;
  const [rows] = await sequelize.query('SELECT name FROM sequelize_meta');
  const faites = new Set(rows.map((r) => r.name));
  return fichiers.filter((f) => !faites.has(f));
};

module.exports = { migrationsEnAttente };
