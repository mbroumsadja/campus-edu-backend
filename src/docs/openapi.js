// src/docs/openapi.js
// Spécification OpenAPI 3.0 de l'API Campus Edu.
// Servie en JSON sur /api/docs.json et en interface interactive sur /api/docs.

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const idParam = (name = 'id', description = 'Identifiant') => ({
  name, in: 'path', required: true, description, schema: { type: 'integer' },
});
const query = (name, schema, description) => ({ name, in: 'query', required: false, description, schema });
const pageParams = [
  query('page',  { type: 'integer', default: 1 },  'Numéro de page'),
  query('limit', { type: 'integer', default: 20 }, 'Éléments par page'),
];
const auth = [{ bearerAuth: [] }];
const errs = (...codes) => Object.fromEntries(
  codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }])
);
const ok = (schema, description = 'Succès') => ({
  description,
  content: { 'application/json': { schema: {
    type: 'object',
    properties: { success: { type: 'boolean', example: true }, message: { type: 'string' }, data: schema },
  } } },
});
const okPaginated = (itemSchema) => ({
  description: 'Liste paginée',
  content: { 'application/json': { schema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'array', items: itemSchema },
      pagination: ref('Pagination'),
    },
  } } },
});
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const NIVEAU = ['L1', 'L2', 'L3', 'M1', 'M2'];
const SEMESTRE = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
const STATUT_DOC = ['en_attente', 'publie', 'archive'];

const fichiersClientUpload = {
  type: 'array',
  description: 'Fichiers déjà envoyés sur Vercel Blob (flux "client upload")',
  items: {
    type: 'object',
    required: ['url'],
    properties: {
      url: { type: 'string', format: 'uri' },
      nomFichierOriginal: { type: 'string' },
      tailleFichier: { type: 'integer', description: 'Octets' },
    },
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Campus Edu API',
    version: require('../../package.json').version,
    description:
      "API de la plateforme d'archivage de documents académiques (cours et sujets d'examen).\n\n" +
      '**Authentification** : `POST /api/auth/login` renvoie un `accessToken`. ' +
      'Cliquez sur *Authorize* et collez-le pour tester les routes protégées.\n\n' +
      '**Format des réponses** : `{ success, message, data }` ; les listes ajoutent `pagination`. ' +
      "Les erreurs renvoient `{ success: false, message, errors? }`.\n\n" +
      '**Rôles** : `etudiant`, `enseignant`, `admin`.',
  },
  servers: [{ url: '/', description: 'Serveur courant' }],
  tags: [
    { name: 'Auth', description: 'Connexion et session' },
    { name: 'Utilisateurs', description: 'Gestion des comptes (admin)' },
    { name: 'Cours', description: 'Cours et leurs documents' },
    { name: 'Sujets', description: "Sujets d'examen et corrigés" },
    { name: 'Filières', description: 'Filières et unités d\'enseignement (UE)' },
    { name: 'Écoles', description: 'Écoles / facultés' },
    { name: 'Recherche', description: 'Recherche et téléchargement publics' },
    { name: 'Upload', description: 'Jeton pour upload direct vers Vercel Blob' },
    { name: 'Système', description: 'Santé du serveur' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: {
      E400: { description: 'Requête invalide', content: { 'application/json': { schema: ref('Error') } } },
      E401: { description: 'Non authentifié', content: { 'application/json': { schema: ref('Error') } } },
      E403: { description: 'Accès refusé (rôle insuffisant)', content: { 'application/json': { schema: ref('Error') } } },
      E404: { description: 'Ressource introuvable', content: { 'application/json': { schema: ref('Error') } } },
      E429: { description: 'Trop de requêtes', content: { 'application/json': { schema: ref('Error') } } },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'object' } },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
          totalPages: { type: 'integer' }, hasNext: { type: 'boolean' }, hasPrev: { type: 'boolean' },
        },
      },
      Ecole: {
        type: 'object',
        properties: { id: { type: 'integer' }, ecole: { type: 'string', example: 'Faculté des Sciences' } },
      },
      Filiere: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, code: { type: 'string', example: 'INFO' },
          nom: { type: 'string', example: 'Informatique' }, departement: { type: 'string' },
          ecole_id: { type: 'integer' }, actif: { type: 'boolean' },
        },
      },
      UE: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, code: { type: 'string', example: 'INFO301' },
          intitule: { type: 'string' }, niveau: { type: 'string', enum: NIVEAU },
          semestre: { type: 'string', enum: SEMESTRE }, credits: { type: 'integer', default: 3 },
          filiere_id: { type: 'integer' }, actif: { type: 'boolean' },
        },
      },
      Utilisateur: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          matricule: { type: 'string', example: '22FS1234' },
          nom: { type: 'string' }, prenom: { type: 'string' },
          email: { type: 'string', format: 'email', nullable: true },
          role: { type: 'string', enum: ['etudiant', 'enseignant', 'admin'] },
          statut: { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] },
          niveau: { type: 'string', enum: NIVEAU, nullable: true },
          filiere_id: { type: 'integer', nullable: true },
          derniereConnexion: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      CoursDocument: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, cours_id: { type: 'integer' },
          cheminFichier: { type: 'string', description: 'URL du fichier' },
          nomFichierOriginal: { type: 'string' }, tailleFichier: { type: 'integer' },
        },
      },
      Cours: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, titre: { type: 'string' }, description: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] },
          statut: { type: 'string', enum: STATUT_DOC },
          anneAcademique: { type: 'string', example: '2025-2026' },
          ue_id: { type: 'integer' }, enseignant_id: { type: 'integer' },
          vues: { type: 'integer' }, telechargemements: { type: 'integer' },
          documents: { type: 'array', items: ref('CoursDocument') },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Sujet: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, titre: { type: 'string' },
          type: { type: 'string', enum: ['partiel', 'rattrapage', 'terminal', 'tp', 'td'] },
          session: { type: 'string', enum: ['normale', 'rattrapage'] },
          annee: { type: 'integer', example: 2025 },
          statut: { type: 'string', enum: STATUT_DOC },
          ue_id: { type: 'integer' }, enseignant_id: { type: 'integer' },
          aCorrige: { type: 'boolean' },
        },
      },
      Tokens: {
        type: 'object',
        properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
      },
    },
  },
  paths: {
    // ── Système ───────────────────────────────────────────────
    '/health': { get: { tags: ['Système'], summary: 'Healthcheck', responses: { 200: { description: 'Serveur opérationnel' } } } },
    '/api/ping': { get: { tags: ['Système'], summary: 'Test de connectivité / CORS', responses: { 200: { description: 'OK' } } } },

    // ── Auth ──────────────────────────────────────────────────
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Se connecter (limité à 100 essais / 15 min)',
        requestBody: json({
          type: 'object', required: ['matricule', 'password'],
          properties: { matricule: { type: 'string', minLength: 4, maxLength: 20, example: '22FS1234' }, password: { type: 'string', minLength: 4 } },
        }),
        responses: {
          200: ok({
            type: 'object',
            properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, utilisateur: ref('Utilisateur') },
          }, 'Connexion réussie'),
          ...errs(400, 401, 403, 429),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'], summary: 'Renouveler les tokens',
        requestBody: json({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }),
        responses: { 200: ok(ref('Tokens'), 'Tokens renouvelés'), ...errs(401) },
      },
    },
    '/api/auth/logout': {
      post: { tags: ['Auth'], summary: 'Se déconnecter', security: auth, responses: { 200: ok({ type: 'object' }), ...errs(401) } },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: "Profil de l'utilisateur connecté", security: auth, responses: { 200: ok(ref('Utilisateur')), ...errs(401) } },
    },
    '/api/auth/change-password': {
      put: {
        tags: ['Auth'], summary: 'Changer son mot de passe', security: auth,
        requestBody: json({
          type: 'object', required: ['ancienPassword', 'nouveauPassword'],
          properties: { ancienPassword: { type: 'string' }, nouveauPassword: { type: 'string', minLength: 8 } },
        }),
        responses: { 200: ok({ type: 'object' }), ...errs(400, 401) },
      },
    },

    // ── Utilisateurs (admin) ──────────────────────────────────
    '/api/users': {
      get: {
        tags: ['Utilisateurs'], summary: 'Lister les utilisateurs (admin)', security: auth,
        parameters: [
          query('role', { type: 'string', enum: ['etudiant', 'enseignant', 'admin'] }, 'Filtrer par rôle'),
          query('statut', { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] }, 'Filtrer par statut'),
          query('filiere_id', { type: 'integer' }, 'Filtrer par filière'),
          query('search', { type: 'string' }, 'Recherche texte'),
          ...pageParams,
        ],
        responses: { 200: okPaginated(ref('Utilisateur')), ...errs(401, 403) },
      },
      post: {
        tags: ['Utilisateurs'], summary: 'Créer un utilisateur (admin)', security: auth,
        requestBody: json({
          type: 'object', required: ['matricule', 'nom', 'prenom', 'role'],
          properties: {
            matricule: { type: 'string' }, nom: { type: 'string' }, prenom: { type: 'string' },
            email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['etudiant', 'enseignant', 'admin'] },
            niveau: { type: 'string', enum: NIVEAU }, filiere_id: { type: 'integer' },
            password: { type: 'string', description: 'Optionnel' },
          },
        }),
        responses: { 201: ok(ref('Utilisateur'), 'Utilisateur créé'), ...errs(400, 401, 403) },
      },
    },
    '/api/users/{id}': {
      get: { tags: ['Utilisateurs'], summary: 'Détail utilisateur (admin)', security: auth, parameters: [idParam()], responses: { 200: ok(ref('Utilisateur')), ...errs(401, 403, 404) } },
      put: {
        tags: ['Utilisateurs'], summary: 'Modifier un utilisateur (admin)', security: auth, parameters: [idParam()],
        requestBody: json({
          type: 'object',
          properties: {
            nom: { type: 'string' }, prenom: { type: 'string' }, email: { type: 'string', format: 'email' },
            statut: { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] },
            filiere_id: { type: 'integer' }, niveau: { type: 'string', enum: NIVEAU },
          },
        }),
        responses: { 200: ok(ref('Utilisateur')), ...errs(401, 403, 404) },
      },
      delete: { tags: ['Utilisateurs'], summary: 'Supprimer un utilisateur (admin, pas soi-même)', security: auth, parameters: [idParam()], responses: { 200: ok({ type: 'object' }), ...errs(400, 401, 403, 404) } },
    },
    '/api/users/{id}/statut': {
      patch: {
        tags: ['Utilisateurs'], summary: "Changer le statut d'un compte (admin)", security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', required: ['statut'], properties: { statut: { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] } } }),
        responses: { 200: ok({ type: 'object', properties: { id: { type: 'integer' }, statut: { type: 'string' } } }), ...errs(400, 401, 403, 404) },
      },
    },

    // ── Cours ─────────────────────────────────────────────────
    '/api/cours': {
      get: {
        tags: ['Cours'], summary: 'Lister les cours (étudiant : les siens ; enseignant/admin : tous)', security: auth,
        parameters: [
          query('ue_id', { type: 'integer' }, 'Filtrer par UE'),
          query('type', { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] }, 'Type de cours'),
          query('annee', { type: 'string', example: '2025-2026' }, 'Année académique'),
          query('search', { type: 'string' }, 'Recherche texte'),
          ...pageParams,
        ],
        responses: { 200: okPaginated(ref('Cours')), ...errs(401) },
      },
      post: {
        tags: ['Cours'], summary: 'Déposer un cours (enseignant/admin)',
        description: 'Deux modes : **multipart** (champ `documents`) ou **JSON** avec `fichiers` déjà uploadés via `/api/upload/client-token`.',
        security: auth,
        requestBody: { required: true, content: {
          'multipart/form-data': { schema: { type: 'object', required: ['titre', 'ue_id', 'documents'], properties: {
            titre: { type: 'string' }, description: { type: 'string' }, ue_id: { type: 'integer' },
            type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] }, anneAcademique: { type: 'string', example: '2025-2026' },
            documents: { type: 'array', items: { type: 'string', format: 'binary' } },
          } } },
          'application/json': { schema: { type: 'object', required: ['titre', 'ue_id', 'fichiers'], properties: {
            titre: { type: 'string' }, description: { type: 'string' }, ue_id: { type: 'integer' },
            type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] }, anneAcademique: { type: 'string' },
            fichiers: fichiersClientUpload,
          } } },
        } },
        responses: { 201: ok(ref('Cours'), 'Cours déposé, en attente de validation'), ...errs(400, 401, 403, 404) },
      },
    },
    '/api/cours/{id}': {
      get: { tags: ['Cours'], summary: "Détail d'un cours", security: auth, parameters: [idParam()], responses: { 200: ok(ref('Cours')), ...errs(401, 403, 404) } },
      put: {
        tags: ['Cours'], summary: 'Modifier un cours (créateur ou admin)', security: auth, parameters: [idParam()],
        requestBody: { required: true, content: {
          'multipart/form-data': { schema: { type: 'object', properties: {
            titre: { type: 'string' }, description: { type: 'string' }, type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] },
            ue_id: { type: 'integer' }, anneAcademique: { type: 'string' },
            main: { type: 'string', format: 'binary' }, documents: { type: 'array', items: { type: 'string', format: 'binary' } },
          } } },
          'application/json': { schema: { type: 'object', properties: {
            titre: { type: 'string' }, description: { type: 'string' }, type: { type: 'string' }, ue_id: { type: 'integer' },
            anneAcademique: { type: 'string' }, fichiers: fichiersClientUpload,
          } } },
        } },
        responses: { 200: ok(ref('Cours'), 'Cours modifié'), ...errs(400, 401, 403, 404) },
      },
      delete: { tags: ['Cours'], summary: 'Supprimer un cours (créateur ou admin)', security: auth, parameters: [idParam()], responses: { 200: ok({ type: 'object' }), ...errs(401, 403, 404) } },
    },
    '/api/cours/{coursId}/documents/{documentId}/telecharger': {
      get: {
        tags: ['Cours'], summary: 'Télécharger un document (public, 30/h par IP si anonyme)',
        parameters: [idParam('coursId', 'ID du cours'), idParam('documentId', 'ID du document')],
        responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, ...errs(403, 404, 429) },
      },
    },
    '/api/cours/{id}/statut': {
      patch: {
        tags: ['Cours'], summary: "Changer le statut d'un cours (admin)", security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', required: ['statut'], properties: { statut: { type: 'string', enum: STATUT_DOC } } }),
        responses: { 200: ok(ref('Cours')), ...errs(400, 401, 403, 404) },
      },
    },

    // ── Sujets ────────────────────────────────────────────────
    '/api/sujets': {
      get: {
        tags: ['Sujets'], summary: "Lister les sujets d'examen", security: auth,
        parameters: [
          query('ue_id', { type: 'integer' }, 'Filtrer par UE'),
          query('type', { type: 'string', enum: ['partiel', 'rattrapage', 'terminal', 'tp', 'td'] }, "Type d'épreuve"),
          query('session', { type: 'string', enum: ['normale', 'rattrapage'] }, 'Session'),
          query('annee', { type: 'integer' }, 'Année'),
          query('search', { type: 'string' }, 'Recherche texte'),
          ...pageParams,
        ],
        responses: { 200: okPaginated(ref('Sujet')), ...errs(401) },
      },
      post: {
        tags: ['Sujets'], summary: 'Déposer un sujet (enseignant/admin)',
        description: 'Multipart (champs `sujet` et `corrige`) ou JSON avec `sujet: {url, tailleFichier}` et `corrige: {url, tailleFichier}` déjà uploadés.',
        security: auth,
        requestBody: { required: true, content: {
          'multipart/form-data': { schema: { type: 'object', required: ['titre', 'type', 'session', 'annee', 'ue_id', 'sujet'], properties: {
            titre: { type: 'string' }, type: { type: 'string', enum: ['partiel', 'rattrapage', 'terminal', 'tp', 'td'] },
            session: { type: 'string', enum: ['normale', 'rattrapage'] }, annee: { type: 'integer', minimum: 2000, maximum: 2100 },
            ue_id: { type: 'integer' }, sujet: { type: 'string', format: 'binary' }, corrige: { type: 'string', format: 'binary' },
          } } },
          'application/json': { schema: { type: 'object', required: ['titre', 'type', 'session', 'annee', 'ue_id', 'sujet'], properties: {
            titre: { type: 'string' }, type: { type: 'string' }, session: { type: 'string' }, annee: { type: 'integer' }, ue_id: { type: 'integer' },
            sujet: { type: 'object', properties: { url: { type: 'string' }, tailleFichier: { type: 'integer' } } },
            corrige: { type: 'object', properties: { url: { type: 'string' }, tailleFichier: { type: 'integer' } } },
          } } },
        } },
        responses: { 201: ok(ref('Sujet'), 'Sujet déposé'), ...errs(400, 401, 403, 404) },
      },
    },
    '/api/sujets/{id}': {
      get: { tags: ['Sujets'], summary: "Détail d'un sujet", security: auth, parameters: [idParam()], responses: { 200: ok(ref('Sujet')), ...errs(401, 404) } },
      put: {
        tags: ['Sujets'], summary: 'Modifier un sujet (créateur ou admin)', security: auth, parameters: [idParam()],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: {
          titre: { type: 'string' }, type: { type: 'string' }, session: { type: 'string' }, annee: { type: 'integer' }, ue_id: { type: 'integer' },
          sujet: { type: 'string', format: 'binary' }, corrige: { type: 'string', format: 'binary' },
        } } } } },
        responses: { 200: ok(ref('Sujet'), 'Sujet modifié'), ...errs(400, 401, 403, 404) },
      },
      delete: { tags: ['Sujets'], summary: 'Supprimer un sujet (créateur ou admin)', security: auth, parameters: [idParam()], responses: { 200: ok({ type: 'object' }), ...errs(401, 403, 404) } },
    },
    '/api/sujets/{id}/telecharger': {
      get: {
        tags: ['Sujets'], summary: 'Télécharger un sujet (ou son corrigé)', security: auth,
        parameters: [idParam(), query('corrige', { type: 'string', enum: ['true', 'false'] }, 'true = télécharger le corrigé')],
        responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, ...errs(401, 404, 429) },
      },
    },
    '/api/sujets/{id}/statut': {
      patch: {
        tags: ['Sujets'], summary: "Changer le statut d'un sujet (admin)", security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', required: ['statut'], properties: { statut: { type: 'string', enum: STATUT_DOC } } }),
        responses: { 200: ok(ref('Sujet')), ...errs(400, 401, 403, 404) },
      },
    },

    // ── Filières & UE ─────────────────────────────────────────
    '/api/filieres': {
      get: { tags: ['Filières'], summary: 'Lister les filières (public)', responses: { 200: ok({ type: 'array', items: ref('Filiere') }) } },
      post: {
        tags: ['Filières'], summary: 'Créer une filière (admin)', security: auth,
        requestBody: json({ type: 'object', required: ['code', 'nom', 'ecole_id'], properties: {
          code: { type: 'string', maxLength: 10 }, nom: { type: 'string' }, departement: { type: 'string' }, ecole_id: { type: 'integer' },
        } }),
        responses: { 201: ok(ref('Filiere'), 'Filière créée'), ...errs(400, 401, 403) },
      },
    },
    '/api/filieres/{id}': {
      get: { tags: ['Filières'], summary: "Détail d'une filière (public)", parameters: [idParam()], responses: { 200: ok(ref('Filiere')), ...errs(404) } },
      put: {
        tags: ['Filières'], summary: 'Modifier une filière (admin)', security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', properties: { code: { type: 'string' }, nom: { type: 'string' }, departement: { type: 'string' }, ecole_id: { type: 'integer' } } }),
        responses: { 200: ok(ref('Filiere')), ...errs(400, 401, 403, 404) },
      },
      delete: { tags: ['Filières'], summary: 'Supprimer une filière (admin)', security: auth, parameters: [idParam()], responses: { 200: ok({ type: 'object' }), ...errs(401, 403, 404) } },
    },
    '/api/filieres/{id}/ues': {
      get: { tags: ['Filières'], summary: "UE d'une filière (public)", parameters: [idParam()], responses: { 200: ok({ type: 'array', items: ref('UE') }), ...errs(404) } },
      post: {
        tags: ['Filières'], summary: 'Créer une UE dans une filière (admin)', security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', required: ['code', 'intitule', 'niveau', 'semestre'], properties: {
          code: { type: 'string' }, intitule: { type: 'string' }, niveau: { type: 'string', enum: NIVEAU },
          semestre: { type: 'string', enum: SEMESTRE }, credits: { type: 'integer' },
        } }),
        responses: { 201: ok(ref('UE'), 'UE créée'), ...errs(400, 401, 403, 404) },
      },
    },
    '/api/filieres/{id}/ues/{ueId}': {
      put: {
        tags: ['Filières'], summary: 'Modifier une UE (admin)', security: auth, parameters: [idParam(), idParam('ueId', "ID de l'UE")],
        requestBody: json({ type: 'object', properties: {
          code: { type: 'string' }, intitule: { type: 'string' }, niveau: { type: 'string', enum: NIVEAU }, semestre: { type: 'string', enum: SEMESTRE },
        } }),
        responses: { 200: ok(ref('UE')), ...errs(400, 401, 403, 404) },
      },
      delete: { tags: ['Filières'], summary: 'Supprimer une UE (admin)', security: auth, parameters: [idParam(), idParam('ueId', "ID de l'UE")], responses: { 200: ok({ type: 'object' }), ...errs(401, 403, 404) } },
    },

    // ── Écoles ────────────────────────────────────────────────
    '/api/ecoles': {
      get: { tags: ['Écoles'], summary: 'Lister les écoles (public)', responses: { 200: ok({ type: 'array', items: ref('Ecole') }) } },
      post: {
        tags: ['Écoles'], summary: 'Créer une école (admin)', security: auth,
        requestBody: json({ type: 'object', required: ['ecole'], properties: { ecole: { type: 'string' } } }),
        responses: { 201: ok(ref('Ecole'), 'École créée'), ...errs(400, 401, 403) },
      },
    },
    '/api/ecoles/{id}': {
      get: { tags: ['Écoles'], summary: "Détail d'une école (public)", parameters: [idParam()], responses: { 200: ok(ref('Ecole')), ...errs(404) } },
      put: {
        tags: ['Écoles'], summary: 'Modifier une école (admin)', security: auth, parameters: [idParam()],
        requestBody: json({ type: 'object', required: ['ecole'], properties: { ecole: { type: 'string' } } }),
        responses: { 200: ok(ref('Ecole')), ...errs(400, 401, 403, 404) },
      },
      delete: { tags: ['Écoles'], summary: 'Supprimer une école (admin)', security: auth, parameters: [idParam()], responses: { 200: ok({ type: 'object' }), ...errs(401, 403, 404) } },
    },

    // ── Recherche ─────────────────────────────────────────────
    '/api/search/documents': {
      get: {
        tags: ['Recherche'], summary: 'Rechercher cours et sujets (public)',
        description: 'Fournir `nom`/`q` **ou** au moins un filtre.',
        parameters: [
          query('nom', { type: 'string' }, 'Terme de recherche'),
          query('q', { type: 'string' }, 'Alias de `nom`'),
          query('niveau', { type: 'string', enum: NIVEAU }, 'Niveau'),
          query('semestre', { type: 'string', enum: SEMESTRE }, 'Semestre'),
          query('ue', { type: 'string' }, 'Nom/code UE'), query('ue_id', { type: 'integer' }, 'ID UE'),
          query('filiere', { type: 'string' }, 'Nom/code filière'), query('filiere_id', { type: 'integer' }, 'ID filière'),
          query('ecole', { type: 'string' }, 'Nom école'), query('ecole_id', { type: 'integer' }, 'ID école'),
          query('type', { type: 'string' }, 'Type de document'), query('annee', { type: 'string' }, 'Année'),
        ],
        responses: { 200: ok({ type: 'object', properties: {
          nombre_resultats: { type: 'integer' },
          documents: { type: 'array', items: { type: 'object', description: 'Cours ou sujet, discriminé par `type_contenu`', properties: { type_contenu: { type: 'string', enum: ['cours', 'sujet'] } } } },
        } }), ...errs(400) },
      },
    },
    '/api/search/documents/telecharger': {
      get: {
        tags: ['Recherche'], summary: 'Télécharger un document (public)',
        parameters: [
          { ...query('type', { type: 'string', enum: ['cours', 'sujet'] }, 'Type de contenu'), required: true },
          { ...query('id', { type: 'integer' }, 'ID du cours ou du sujet'), required: true },
          query('document_id', { type: 'integer' }, 'Document précis (cours)'),
          query('corrige', { type: 'string', enum: ['true', 'false'] }, 'Corrigé (sujet)'),
        ],
        responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, ...errs(400, 404) },
      },
    },

    // ── Upload ────────────────────────────────────────────────
    '/api/upload/client-token': {
      post: {
        tags: ['Upload'], summary: 'Jeton d\'upload direct Vercel Blob (enseignant/admin)',
        description: 'Appelé automatiquement par le SDK `@vercel/blob/client` (`upload()`), pas à la main. Types acceptés : PDF, MP4, WebM, PPT(X), DOC(X).',
        security: auth,
        requestBody: json({ type: 'object', description: 'Corps généré par le SDK Vercel Blob' }),
        responses: { 200: { description: 'Réponse du SDK Vercel Blob' }, ...errs(400, 401, 403) },
      },
    },
  },
};
