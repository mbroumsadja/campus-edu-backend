// src/config/resetDb.js
require('dotenv').config();
const { sequelize } = require('./database');
const logger = require('../utils/logger');
const { deleteStoredFile } = require('../middlewares/upload');
const { Cours, CoursDocument, Sujet } = require('../models');

// ─────────────────────────────────────────────────────────────────
// Supprime tous les fichiers physiques (Vercel Blob / disque local)
// référencés en base, AVANT de vider les tables.
// ─────────────────────────────────────────────────────────────────
const supprimerFichiersStockes = async () => {
  const chemins = [];

  const cours = await Cours.findAll({ attributes: ['cheminFichier'] });
  chemins.push(...cours.map((c) => c.cheminFichier));

  const documents = await CoursDocument.findAll({ attributes: ['cheminFichier'] });
  chemins.push(...documents.map((d) => d.cheminFichier));

  const sujets = await Sujet.findAll({ attributes: ['cheminFichier', 'cheminCorrige'] });
  sujets.forEach((s) => {
    chemins.push(s.cheminFichier);
    if (s.cheminCorrige) chemins.push(s.cheminCorrige);
  });

  const uniques = [...new Set(chemins.filter(Boolean))];

  logger.info(`🗑️  Suppression de ${uniques.length} fichier(s) stocké(s)...`);

  const resultats = await Promise.allSettled(
    uniques.map((chemin) => deleteStoredFile(chemin))
  );

  const echecs = resultats.filter((r) => r.status === 'rejected').length;
  if (echecs > 0) {
    logger.warn(`⚠️  ${echecs} fichier(s) n'ont pas pu être supprimés (déjà absents ou erreur réseau).`);
  }
};

const resetDB = async () => {
  try {
    await supprimerFichiersStockes();

    const dialect = sequelize.getDialect();
    let tables = [];

    if (dialect === 'postgres') {
      const [rows] = await sequelize.query(`
        SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public';
      `);
      tables = rows;
    } else if (dialect === 'mysql' || dialect === 'mariadb') {
      const [rows] = await sequelize.query(`
        SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';
      `);
      tables = rows;
    } else {
      throw new Error(`Dialect non supporté pour reset DB : ${dialect}`);
    }

    if (tables.length === 0) {
      logger.info('Aucune table à vider.');
      return;
    }

    if (dialect === 'postgres') {
      const nomsTables = tables.map((t) => `"${t.name}"`).join(', ');
      await sequelize.query(`TRUNCATE ${nomsTables} RESTART IDENTITY CASCADE;`);
    } else {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
      for (const t of tables) {
        await sequelize.query(`TRUNCATE \`${t.name}\`;`);
      }
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
    }

    logger.info(`✅  Base de données vidée avec succès (${tables.length} tables).`);
  } catch (err) {
    logger.error('❌  Erreur lors du reset : ' + err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

resetDB();