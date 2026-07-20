require('dotenv').config();
const bcrypt    = require('bcryptjs');

const { sequelize, Filiere, UE, Utilisateur } = require('../models');
const logger    = require('../utils/logger');

const seed = async () => {
  try {
    await sequelize.sync({ alter: true });
    logger.info('Tables synchronisées');

    // ── Filières ──────────────────────────────────────────────────
    const [infoFiliere] = await Filiere.findOrCreate({
      where: { code: 'INF' },
      defaults: { nom: 'Informatique', departement: 'Mathematique et Informatique' },
    });

    const [mathFiliere] = await Filiere.findOrCreate({
      where: { code: 'MAT' },
      defaults: { nom: 'Mathématiques', departement: 'Mathematique et Informatique' },
    });

    const [chimieFiliere] = await Filiere.findOrCreate({
      where: { code: 'CHIM' },
      defaults: { nom: 'Chimie', departement: 'Chimie' },
    });

    const [physiqueFiliere] = await Filiere.findOrCreate({
      where: { code: 'PHY' },
      defaults: { nom: 'Physique', departement: 'Physique' },
    });

    const [energieRenouvelaleFiliere] = await Filiere.findOrCreate({
      where: { code: 'ERN' },
      defaults: { nom: 'Energie_renouvelable', departement: 'Energie_renouvelable' },
    });

    const [ScicenceBiologieFiliere] = await Filiere.findOrCreate({
      where: { code: 'BIO' },
      defaults: { nom: 'Biologie', departement: 'Science_Biologie_et_de_la_terre' },
    });

    const [ScienceTerreFiliere] = await Filiere.findOrCreate({
      where: { code: 'STE' },
      defaults: { nom: 'Science_terre', departement: 'Science Biologie_et_de_la_terre' },
    });

    logger.info('Filières créées ✓');

    // ── UEs Informatique ──────────────────────────────────────────
    const uesInfo = [
      { code: 'INF411', intitule: 'Complexite et Calculabiliter des Algorithmes',niveau: 'M1', semestre: 'S7', credits: 6 },
      { code: 'INFF421', intitule: 'Introduction a l\'inteligence Artificielle',niveau: 'M1', semestre: 'S7', credits: 6 },
      { code: 'INFF431', intitule: 'Reseau et systeme de telecommunication',niveau: 'M1', semestre: 'S7', credits: 6 },
      { code: 'INFF441', intitule: 'Modeles probabilistes',niveau: 'M1', semestre: 'S7', credits: 6 },
      { code: 'INFF451', intitule: 'Gestion de projet en ingenierie informatique',niveau: 'M1', semestre: 'S7', credits: 3 },
      { code: 'INFF461', intitule: 'Systemes interactifs et immersifs',niveau: 'M1', semestre: 'S7', credits: 3 },
      { code: 'INFF471', intitule: 'Genie Logiciel',niveau: 'M1', semestre: 'S1', credits: 3 },
      
      { code: 'INF412', intitule: 'Methodologie de la recherche 1',niveau: 'M1', semestre: 'S8', credits: 6 },
      { code: 'INFF422', intitule: 'Traitement et analyse d\'images',niveau: 'M1', semestre: 'S8', credits: 6 },
      { code: 'INFF432', intitule: 'Codage Algebrique et cryptographie',niveau: 'M1', semestre: 'S8', credits: 6 },
      { code: 'INFF442', intitule: 'Optimisation et controle',niveau: 'M1', semestre: 'S8', credits: 6 },
      { code: 'INFF452', intitule: 'Aqpects juridiques et ethiques de l\'ingenierie informatique',niveau: 'M1', semestre: 'S8', credits: 3 },
      { code: 'INFF462', intitule: 'Base de donnees avancees',niveau: 'M1', semestre: 'S8', credits: 3 },
      { code: 'INFF472', intitule: 'Systeme distribues',niveau: 'M1', semestre: 'S8', credits: 3 }
    ];

    for (const ue of uesInfo) {
      await UE.findOrCreate({ where: { code: ue.code, filiere_id: infoFiliere.id }, defaults: { ...ue, filiere_id: infoFiliere.id } });
    }

    logger.info('UEs créées ✓');

    // ── Comptes utilisateurs de test ──────────────────────────────
    const hash = (pwd) => bcrypt.hash(pwd, 12);

    const upsertUser = async (matricule, defaults) => {
      const [user, created] = await Utilisateur.findOrCreate({ where: { matricule }, defaults });
      if (!created) {
        await user.update({ password: defaults.password, statut: 'actif' });
        logger.info(`  Compte mis à jour : ${matricule}`);
      } else {
        logger.info(`  Compte créé : ${matricule}`);
      }
      return user;
    };

    // Admin
    await upsertUser('ADM-0001', {
      nom: 'Administrateur', prenom: 'Super',
      email:    'admin@uniportal.cm',
      password: await hash('mbroumsadja'),
      role:     'admin',
      statut:   'actif',
    });

    logger.info('Utilisateurs de test créés ✓');
    logger.info('');
    logger.info('═══════════════════════════════════════════');
    logger.info('  Comptes de test :');
    logger.info('  Admin     → ADM-0001 ');
    logger.info('═══════════════════════════════════════════');

    await sequelize.close();
    process.exit(0);

  } catch (err) {
    logger.error('Erreur seed :', err);
    process.exit(1);
  }
};

seed();