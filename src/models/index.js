// src/models/index.js
// Centralise tous les modèles et leurs associations

const { sequelize }  = require('../config/database');
const { DataTypes }  = require('sequelize');

// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Filière
// ══════════════════════════════════════════════════════════════════
const Filiere = sequelize.define('Filiere', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  code: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    unique:    true,
    comment:   'Ex: INFO, MATH, GC',
  },
  nom: {
    type:      DataTypes.STRING(100),
    allowNull: false,
    comment:   'Ex: Informatique, Génie Civil',
  },
  departement: {
    type:    DataTypes.STRING(100),
    comment: 'Ex: Sciences & Technologies',
  },
  actif: {
    type:         DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, { tableName: 'filieres' });


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Utilisateur (Étudiant + Enseignant + Admin)
// ══════════════════════════════════════════════════════════════════
const Utilisateur = sequelize.define('Utilisateur', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  matricule: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    unique:    true,
    comment:   'Format: 22FS1234 (étudiant) ou ENS-0042 (enseignant)',
  },
  nom: {
    type:      DataTypes.STRING(80),
    allowNull: false,
  },
  prenom: {
    type:      DataTypes.STRING(80),
    allowNull: false,
  },
  email: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    unique:    true,
    validate:  { isEmail: true },
  },
  password: {
    type:      DataTypes.STRING(255),
    allowNull: false,
    comment:   'Hash bcrypt — jamais en clair',
  },
  role: {
    type:         DataTypes.ENUM('etudiant', 'enseignant', 'admin'),
    allowNull:    false,
    defaultValue: 'etudiant',
  },
  statut: {
    type:         DataTypes.ENUM('actif', 'en_attente', 'suspendu'),
    defaultValue: 'en_attente',
  },
  niveau: {
    type:    DataTypes.ENUM('L1', 'L2', 'L3', 'M1', 'M2'),
    comment: 'Uniquement pour les étudiants',
  },
  // Stockage du refresh token pour l'invalidation
  refreshToken: {
    type:    DataTypes.TEXT,
    comment: 'JWT refresh token actuel',
  },
  derniereConnexion: {
    type: DataTypes.DATE,
  },
}, {
  tableName: 'utilisateurs',
  indexes: [
    { fields: ['matricule'] },
    { fields: ['role'] },
    { fields: ['statut'] },
    { fields: ['filiere_id'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Unité d'Enseignement (UE / Matière)
// ══════════════════════════════════════════════════════════════════
const UE = sequelize.define('UE', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  code: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    comment:   'Ex: INFO301, MATH201',
  },
  intitule: {
    type:      DataTypes.STRING(150),
    allowNull: false,
    comment:   'Ex: Algorithmique avancée',
  },
  niveau: {
    type:      DataTypes.ENUM('L1', 'L2', 'L3', 'M1', 'M2'),
    allowNull: false,
  },
  semestre: {
    type:      DataTypes.ENUM('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'),
    allowNull: false,
  },
  credits: {
    type:         DataTypes.INTEGER,
    defaultValue: 3,
  },
  actif: {
    type:         DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'ues',
  indexes: [
    { fields: ['filiere_id'] },
    { fields: ['niveau'] },
    { unique: true, fields: ['code', 'filiere_id'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Cours
// ══════════════════════════════════════════════════════════════════
const Cours = sequelize.define('Cours', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  titre: {
    type:      DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  type: {
    type:         DataTypes.ENUM('pdf', 'video', 'slide', 'autre'),
    defaultValue: 'pdf',
  },
  cheminFichier: {
    type:      DataTypes.STRING(500),
    allowNull: false,
    comment:   'Chemin relatif dans /uploads',
  },
  nomFichierOriginal: {
    type: DataTypes.STRING(255),
  },
  tailleFichier: {
    type:    DataTypes.BIGINT,
    comment: 'Taille en octets',
  },
  statut: {
    type:         DataTypes.ENUM('en_attente', 'publie', 'archive'),
    defaultValue: 'en_attente',
  },
  anneAcademique: {
    type:    DataTypes.STRING(9),
    comment: 'Ex: 2023-2024',
  },
  vues: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },
  telechargemements: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'cours',
  indexes: [
    { fields: ['ue_id'] },
    { fields: ['enseignant_id'] },
    { fields: ['statut'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Sujet d'examen
// ══════════════════════════════════════════════════════════════════
const Sujet = sequelize.define('Sujet', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  titre: {
    type:      DataTypes.STRING(200),
    allowNull: false,
  },
  type: {
    type:      DataTypes.ENUM('partiel', 'rattrapage', 'terminal', 'tp', 'td'),
    allowNull: false,
  },
  session: {
    type:      DataTypes.ENUM('normale', 'rattrapage'),
    allowNull: false,
  },
  annee: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    comment:   'Année de l\'examen, ex: 2023',
  },
  cheminFichier: {
    type:      DataTypes.STRING(500),
    allowNull: false,
  },
  avecCorrige: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
  },
  cheminCorrige: {
    type: DataTypes.STRING(500),
  },
  statut: {
    type:         DataTypes.ENUM('en_attente', 'publie', 'archive'),
    defaultValue: 'en_attente',
  },
  telechargemements: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'sujets',
  indexes: [
    { fields: ['ue_id'] },
    { fields: ['annee'] },
    { fields: ['statut'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Journal d'audit (sécurité)
// ══════════════════════════════════════════════════════════════════
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  action: {
    type:      DataTypes.STRING(50),
    allowNull: false,
    comment:   'Ex: LOGIN, CREATE_USER, DELETE_COURS',
  },
  details: {
    type:    DataTypes.JSON,
    comment: 'Infos supplémentaires (ancienne valeur, nouvelle valeur…)',
  },
  ipAddress: {
    type: DataTypes.STRING(45),
  },
  userAgent: {
    type: DataTypes.STRING(300),
  },
  resultat: {
    type:         DataTypes.ENUM('succes', 'echec'),
    defaultValue: 'succes',
  },
}, {
  tableName: 'audit_logs',
  updatedAt:  false, // Un log n'est jamais modifié
  indexes: [
    { fields: ['utilisateur_id'] },
    { fields: ['action'] },
    { fields: ['created_at'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  ASSOCIATIONS
// ══════════════════════════════════════════════════════════════════

// Filière → Utilisateurs (étudiants)
Filiere.hasMany(Utilisateur, { foreignKey: 'filiere_id', as: 'etudiants' });
Utilisateur.belongsTo(Filiere, { foreignKey: 'filiere_id', as: 'filiere' });

// Filière → UE
Filiere.hasMany(UE, { foreignKey: 'filiere_id', as: 'ues' });
UE.belongsTo(Filiere, { foreignKey: 'filiere_id', as: 'filiere' });

// UE → Cours
UE.hasMany(Cours, { foreignKey: 'ue_id', as: 'cours' });
Cours.belongsTo(UE, { foreignKey: 'ue_id', as: 'ue' });

// UE → Sujets
UE.hasMany(Sujet, { foreignKey: 'ue_id', as: 'sujets' });
Sujet.belongsTo(UE, { foreignKey: 'ue_id', as: 'ue' });

// Enseignant → Cours
Utilisateur.hasMany(Cours, { foreignKey: 'enseignant_id', as: 'coursEnseignes' });
Cours.belongsTo(Utilisateur, { foreignKey: 'enseignant_id', as: 'enseignant' });

// Enseignant → Sujets
Utilisateur.hasMany(Sujet, { foreignKey: 'enseignant_id', as: 'sujetsDeposes' });
Sujet.belongsTo(Utilisateur, { foreignKey: 'enseignant_id', as: 'enseignant' });

// Utilisateur → AuditLogs
Utilisateur.hasMany(AuditLog, { foreignKey: 'utilisateur_id', as: 'logs' });
AuditLog.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id', as: 'utilisateur' });


module.exports = { sequelize, Filiere, Utilisateur, UE, Cours, Sujet, AuditLog };
