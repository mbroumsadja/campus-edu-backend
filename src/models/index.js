// src/models/index.js
// Centralise tous les modèles et leurs associations

const { sequelize }  = require('../config/database_production');
const { DataTypes }  = require('sequelize');
const { cleanFileName } = require('../utils/fileName');
// ══════════════════════════════════════════════════════════════════
// MODELE ECOLE
// ══════════════════════════════════════════════════════════════════
const Ecole = sequelize.define('Ecole',{
  id:{
    type:   DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  ecole:{
    type: DataTypes.STRING,
    allowNull: false
  }
},{tableName: 'ecoles'});

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
    type:      DataTypes.STRING(10),
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
  ecole_id: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    comment: 'Référence vers l\'école responsable de la filière',
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
    type:         DataTypes.ENUM('etudiant', 'enseignant', 'admin', 'super_admin'),
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
  // CE-13 : le hash et le refresh token ne sortent jamais par défaut.
  // Utiliser Utilisateur.scope('avecSecrets') pour login / refresh / changement de mot de passe.
  defaultScope: { attributes: { exclude: ['password', 'refreshToken'] } },
  scopes: { avecSecrets: { attributes: { include: ['password', 'refreshToken'] } } },
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
  categorie: {
    type:         DataTypes.STRING(20),
    allowNull:    false,
    defaultValue: 'cours',
    validate:     { isIn: [['cours', 'support']] },
    comment:      "'cours' ou 'support' (support de révision)",
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
  hooks: {
    beforeValidate: (c) => { if (c.nomFichierOriginal) c.nomFichierOriginal = cleanFileName(c.nomFichierOriginal); },
  },
  indexes: [
    { fields: ['ue_id'] },
    { fields: ['enseignant_id'] },
    { fields: ['statut'] },
  ],
});

const CoursDocument = sequelize.define('CoursDocument', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  cours_id: {
    type:      DataTypes.INTEGER,
    allowNull: false,
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
  sha256: {
    type:     DataTypes.CHAR(64),
    validate: { is: { args: /^[0-9a-f]{64}$/, msg: 'Empreinte SHA-256 invalide' } },
  },
}, {
  tableName: 'cours_documents',
  hooks: {
    beforeValidate: (d) => { if (d.nomFichierOriginal) d.nomFichierOriginal = cleanFileName(d.nomFichierOriginal); },
  },
  indexes: [
    { fields: ['cours_id'] },
    { name: 'cours_documents_sha256', fields: ['sha256'] },
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
  // Ancien compteur (faute de frappe) : conservé pendant la transition, voir migration CE-11
  telechargemements: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },

  // ── Sujet v2 (CE-11) ──────────────────────────────────────────
  annee_academique: {
    type:     DataTypes.STRING(9),
    comment:  'Ex: 2024-2025',
    validate: { is: { args: /^\d{4}-\d{4}$/, msg: 'Année académique invalide (ex: 2024-2025)' } },
  },
  type_epreuve: {
    type: DataTypes.ENUM('partiel', 'terminal', 'tp', 'td'),
  },
  taille_octets: { type: DataTypes.BIGINT },
  nom_origine:   { type: DataTypes.STRING(255) },
  mime:          { type: DataTypes.STRING(100) },
  sha256: {
    type:     DataTypes.CHAR(64),
    validate: { is: { args: /^[0-9a-f]{64}$/, msg: 'Empreinte SHA-256 invalide' } },
  },
  corrige_sha256: {
    type:     DataTypes.CHAR(64),
    validate: { is: { args: /^[0-9a-f]{64}$/, msg: 'Empreinte SHA-256 du corrigé invalide' } },
  },
  nb_telechargements: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'sujets',
  indexes: [
    { fields: ['ue_id'] },
    { fields: ['annee'] },
    { fields: ['statut'] },
    { name: 'sujets_sha256_unique', unique: true, fields: ['sha256'] },
    { name: 'sujets_depose_par', fields: ['depose_par'] },
    // CE-14 : liste par UE (ue_id, statut) triée par année académique décroissante
    { name: 'sujets_ue_statut_annee_idx', fields: ['ue_id', 'statut', { name: 'annee_academique', order: 'DESC' }, { name: 'id', order: 'DESC' }] },
  ],
  hooks: {
    // Garde l'ancien contrat (type, annee) et le nouveau (type_epreuve, annee_academique) cohérents
    beforeValidate: (sujet) => {
      if (sujet.nom_origine) sujet.nom_origine = cleanFileName(sujet.nom_origine);
      if (!sujet.type_epreuve && sujet.type) {
        sujet.type_epreuve = sujet.type === 'rattrapage' ? 'terminal' : sujet.type;
        if (sujet.type === 'rattrapage' && !sujet.session) sujet.session = 'rattrapage';
      }
      if (!sujet.type && sujet.type_epreuve) sujet.type = sujet.type_epreuve;
      if (!sujet.annee_academique && sujet.annee) sujet.annee_academique = `${sujet.annee - 1}-${sujet.annee}`;
      if (!sujet.annee && sujet.annee_academique) sujet.annee = parseInt(sujet.annee_academique.slice(5), 10);
    },
  },
});

// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Historique des téléchargements de cours
// ══════════════════════════════════════════════════════════════════
const Telechargement = sequelize.define('Telechargement', {
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  utilisateur_id: {
    type:      DataTypes.INTEGER,
    allowNull: false,
  },
  cours_id: {
    type:      DataTypes.INTEGER,
    allowNull: false,
  },
  ipAddress: {
    type: DataTypes.STRING(45),
  },
  userAgent: {
    type: DataTypes.STRING(300),
  },
}, {
  tableName: 'telechargements',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['utilisateur_id'] },
    { fields: ['cours_id'] },
    // CE-21 : une seule ligne par (utilisateur, cours) ; le volume par jour est dans stats_quotidiennes
    { name: 'telechargements_utilisateur_cours_unique', unique: true, fields: ['utilisateur_id', 'cours_id'] },
  ],
});

// ══════════════════════════════════════════════════════════════════
//  MODÈLES : statistiques agrégées par jour (CE-21)
// ══════════════════════════════════════════════════════════════════
const StatQuotidienne = sequelize.define('StatQuotidienne', {
  jour:     { type: DataTypes.DATEONLY, primaryKey: true },
  type:     { type: DataTypes.ENUM('cours', 'sujet'), primaryKey: true },
  cible_id: { type: DataTypes.INTEGER, primaryKey: true },
  telechargements: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'stats_quotidiennes', timestamps: false,
  indexes: [{ name: 'stats_quotidiennes_cible', fields: ['type', 'cible_id'] }],
});

const RechercheVide = sequelize.define('RechercheVide', {
  jour:  { type: DataTypes.DATEONLY, primaryKey: true },
  terme: { type: DataTypes.STRING(100), primaryKey: true },
  nb:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, { tableName: 'recherches_vides', timestamps: false });


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Session (appareil connecté) — CE-12
//  Le refresh token n'est JAMAIS stocké en clair : seulement son empreinte SHA-256.
// ══════════════════════════════════════════════════════════════════
const Session = sequelize.define('Session', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  famille_id: { type: DataTypes.UUID, allowNull: false, comment: 'Une famille = un login ; sert à détecter le rejeu d\'un token déjà renouvelé' },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  appareil:   { type: DataTypes.STRING(120), comment: 'Nom fourni par le client ou user-agent tronqué' },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  last_used_at: { type: DataTypes.DATE },
  revoked_at: { type: DataTypes.DATE },
  motif_revocation: { type: DataTypes.ENUM('logout', 'rotation', 'rejeu', 'mot_de_passe', 'suspension', 'limite', 'admin') },
}, {
  tableName: 'sessions',
  indexes: [
    { fields: ['utilisateur_id', 'revoked_at'] },
    { fields: ['famille_id'] },
    { fields: ['expires_at'] },
  ],
});


// ══════════════════════════════════════════════════════════════════
//  MODÈLE : Demande publique (sujet manquant / signalement) — CE-20
//  L'IP n'est jamais stockée : seulement une empreinte salée (anti-doublon).
// ══════════════════════════════════════════════════════════════════
const Demande = sequelize.define('Demande', {
  id:      { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type:    { type: DataTypes.ENUM('sujet_manquant', 'signalement', 'cours_demande'), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false, validate: { len: [10, 1000] } },
  contact: { type: DataTypes.STRING(150), comment: 'E-mail ou téléphone, facultatif' },
  nom_etudiant: { type: DataTypes.STRING(150), comment: 'Nom de l\'étudiant qui demande un cours' },
  nom_cours:    { type: DataTypes.STRING(200), comment: 'Nom du cours demandé (type cours_demande)' },
  statut:  { type: DataTypes.ENUM('nouvelle', 'en_cours', 'traitee', 'rejetee'), allowNull: false, defaultValue: 'nouvelle' },
  empreinte_auteur: { type: DataTypes.CHAR(64), comment: 'HMAC(IP) : détecte les doublons sans conserver l\'IP' },
}, {
  tableName: 'demandes',
  indexes: [
    { fields: ['statut', 'created_at'] },
    { fields: ['ue_id'] },
    { fields: ['sujet_id'] },
    { fields: ['empreinte_auteur', 'created_at'] },
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
// Ecole - Filière
Ecole.hasMany(Filiere,{foreignKey:{ name:'ecole_id', allowNull:false }, onDelete:'RESTRICT', as: 'filiere'});
Filiere.belongsTo(Ecole, {foreignKey:{ name:'ecole_id', allowNull:false }, onDelete:'RESTRICT', as: 'ecole'});

// Filière → Utilisateurs (étudiants)
Filiere.hasMany(Utilisateur, { foreignKey: 'filiere_id', as: 'etudiants' });
Utilisateur.belongsTo(Filiere, { foreignKey: 'filiere_id', as: 'filiere' });

// Filière → UE
Filiere.hasMany(UE, { foreignKey: { name: 'filiere_id', allowNull: false }, onDelete: 'RESTRICT', as: 'ues' });
UE.belongsTo(Filiere, { foreignKey: { name: 'filiere_id', allowNull: false }, onDelete: 'RESTRICT', as: 'filiere' });

// UE → Cours
UE.hasMany(Cours, { foreignKey: { name: 'ue_id', allowNull: false }, onDelete: 'RESTRICT', as: 'cours' });
Cours.belongsTo(UE, { foreignKey: { name: 'ue_id', allowNull: false }, onDelete: 'RESTRICT', as: 'ue' });

// UE → Sujets
UE.hasMany(Sujet, { foreignKey: { name: 'ue_id', allowNull: false }, onDelete: 'RESTRICT', as: 'sujets' });
Sujet.belongsTo(UE, { foreignKey: { name: 'ue_id', allowNull: false }, onDelete: 'RESTRICT', as: 'ue' });

// Enseignant → Cours
Utilisateur.hasMany(Cours, { foreignKey: 'enseignant_id', as: 'coursEnseignes' });
Cours.belongsTo(Utilisateur, { foreignKey: 'enseignant_id', as: 'enseignant' });

Cours.hasMany(CoursDocument, { foreignKey: 'cours_id', as: 'fichiers' });
CoursDocument.belongsTo(Cours, { foreignKey: 'cours_id', as: 'cours' });

// Enseignant → Sujets
Utilisateur.hasMany(Sujet, { foreignKey: 'enseignant_id', as: 'sujetsDeposes' });
Sujet.belongsTo(Utilisateur, { foreignKey: 'enseignant_id', as: 'enseignant' });
// CE-11 : traçabilité du dépôt
Sujet.belongsTo(Utilisateur, { foreignKey: 'depose_par', as: 'deposant', constraints: true, onDelete: 'SET NULL' });

// Téléchargements utilisateur → Cours
Utilisateur.hasMany(Telechargement, { foreignKey: 'utilisateur_id', as: 'telechargements' });
Telechargement.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id', as: 'utilisateur' });

Cours.hasMany(Telechargement, { foreignKey: 'cours_id', as: 'telechargementsHistorique' });
Telechargement.belongsTo(Cours, { foreignKey: 'cours_id', as: 'cours' });

Utilisateur.hasMany(Session, { foreignKey: { name: 'utilisateur_id', allowNull: false }, as: 'sessions', onDelete: 'CASCADE' });
Session.belongsTo(Utilisateur, { foreignKey: { name: 'utilisateur_id', allowNull: false }, as: 'utilisateur', onDelete: 'CASCADE' });

UE.hasMany(Demande, { foreignKey: 'ue_id', as: 'demandes', onDelete: 'SET NULL' });
Demande.belongsTo(UE, { foreignKey: 'ue_id', as: 'ue', onDelete: 'SET NULL' });
Sujet.hasMany(Demande, { foreignKey: 'sujet_id', as: 'signalements', onDelete: 'SET NULL' });
Demande.belongsTo(Sujet, { foreignKey: 'sujet_id', as: 'sujet', onDelete: 'SET NULL' });
Demande.belongsTo(Utilisateur, { foreignKey: 'auteur_id', as: 'auteur', onDelete: 'SET NULL' });
Demande.belongsTo(Utilisateur, { foreignKey: 'traite_par', as: 'traitePar', onDelete: 'SET NULL' });

// Utilisateur → AuditLogs
Utilisateur.hasMany(AuditLog, { foreignKey: 'utilisateur_id', as: 'logs' });
AuditLog.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id', as: 'utilisateur' });


module.exports = { sequelize, Ecole, Filiere, Utilisateur, UE, Cours, CoursDocument, Sujet, Telechargement, AuditLog, Session, Demande, StatQuotidienne, RechercheVide };
