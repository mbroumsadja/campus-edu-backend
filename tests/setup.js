require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

jest.setTimeout(30000);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refreshsecret';

const originalError = console.error;

beforeAll(async () => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning: An update to')) {
      return;
    }
    originalError.call(console, ...args);
  };

  const { sequelize, Ecole, Filiere, UE, Utilisateur, Cours, Sujet } = require('../src/models');

  await sequelize.sync({ force: true });

  const ecole = await Ecole.create({
    ecole: 'Ecole Centrale',
  });

  const filiere = await Filiere.create({
    code: 'INF',
    nom: 'Informatique',
    departement: 'Mathématiques et Informatique',
    actif: true,
    ecole_id: ecole.id,
  });

  const ue = await UE.create({
    code: 'INF101',
    intitule: 'Algorithmique et Programmation',
    niveau: 'L1',
    semestre: 'S1',
    credits: 6,
    actif: true,
    filiere_id: filiere.id,
  });

  const adminPassword = await bcrypt.hash('Admin@1234', 12);
  await Utilisateur.create({
    matricule: 'ADM-0001',
    nom: 'Administrateur',
    prenom: 'Super',
    email: 'admin@uniportal.cm',
    password: adminPassword,
    role: 'admin',
    statut: 'actif',
  });

  const enseignantPassword = await bcrypt.hash('Ens@1234', 12);
  const enseignant = await Utilisateur.create({
    matricule: 'ENS-0001',
    nom: 'Professeur',
    prenom: 'Jean',
    email: 'ens@uniportal.cm',
    password: enseignantPassword,
    role: 'enseignant',
    statut: 'actif',
  });

  const etudiantPassword = await bcrypt.hash('Student@1234', 12);
  await Utilisateur.create({
    matricule: '22FS0001',
    nom: 'Etudiant',
    prenom: 'Test',
    email: 'student@uniportal.cm',
    password: etudiantPassword,
    role: 'etudiant',
    statut: 'actif',
    niveau: 'L1',
    filiere_id: filiere.id,
  });

  const etudiant2Password = await bcrypt.hash('Student2@1234', 12);
  await Utilisateur.create({
    matricule: '22FS0002',
    nom: 'Etudiante',
    prenom: 'Deux',
    email: 'student2@uniportal.cm',
    password: etudiant2Password,
    role: 'etudiant',
    statut: 'actif',
    niveau: 'L1',
    filiere_id: filiere.id,
  });

  const uploadsDir = path.resolve(__dirname, '../uploads/test');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const coursFilePath = path.join(uploadsDir, 'cours_test.pdf');
  const sujetFilePath = path.join(uploadsDir, 'sujet_test.pdf');
  const corrigeFilePath = path.join(uploadsDir, 'corrige_test.pdf');

  fs.writeFileSync(coursFilePath, 'dummy file content');
  fs.writeFileSync(sujetFilePath, 'dummy file content');
  fs.writeFileSync(corrigeFilePath, 'dummy file content');

  await Cours.create({
    titre: 'Cours de test',
    description: 'Description du cours test',
    type: 'pdf',
    cheminFichier: coursFilePath,
    nomFichierOriginal: 'cours_test.pdf',
    tailleFichier: 1024,
    statut: 'publie',
    anneAcademique: '2025-2026',
    ue_id: ue.id,
    enseignant_id: enseignant.id,
  });

  await Sujet.create({
    titre: 'Sujet de test',
    type: 'partiel',
    session: 'normale',
    annee: 2025,
    cheminFichier: sujetFilePath,
    avecCorrige: true,
    cheminCorrige: corrigeFilePath,
    statut: 'publie',
    ue_id: ue.id,
    enseignant_id: enseignant.id,
  });
});

afterAll(async () => {
  console.error = originalError;
  const { sequelize } = require('../src/models');
  await sequelize.close();
});
