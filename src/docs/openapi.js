// src/docs/openapi.js
// Contrat OpenAPI 3.0 de l'API Campus Edu (CE-15).
// Servi sur GET /api/v1/openapi.json. Un test vérifie qu'il est valide ET que chaque route
// Express y figure : impossible d'ajouter une route sans la documenter.

const pkg = require('../../package.json');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const ok = (description, schema) => ({ description, content: { 'application/json': { schema } } });
const err = (description) => ({ description, content: { 'application/json': { schema: ref('Erreur') } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const secured = [{ bearerAuth: [] }];

const envelope = (data) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: { success: { type: 'boolean', example: true }, message: { type: 'string' }, data },
});
const paginatedOf = (item) => ({
  type: 'object',
  required: ['success', 'data', 'pagination'],
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: item },
    pagination: ref('Pagination'),
  },
});

const std = {
  401: err('Non authentifié'),
  403: err('Accès refusé'),
  404: err('Introuvable'),
  409: err('Conflit (doublon ou ressource encore utilisée)'),
  429: err('Trop de requêtes'),
};
const pick = (...codes) => Object.fromEntries(codes.map((c) => [c, std[c]]));
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Campus Edu API',
    version: pkg.version,
    description:
      'API de la plateforme d\'archivage académique (Faculté des Sciences, Université de Garoua).\n\n' +
      '- Version courante : `/api/v1`. L\'ancien préfixe `/api` fonctionne encore mais est déprécié (en-têtes `Deprecation` et `Link`).\n' +
      '- L\'app mobile envoie `X-App-Version`; en dessous de la version minimale (voir `/config`), l\'API répond 426.\n' +
      '- Réponses : `{ success, message?, data }`; erreurs : `{ success: false, message, errors? }`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: ['Auth', 'Utilisateurs', 'Cours', 'Sujets', 'Filières', 'Écoles', 'Recherche', 'Upload', 'Configuration']
    .map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    parameters: {
      AppVersion: {
        name: 'X-App-Version', in: 'header', required: false, schema: { type: 'string', example: '1.4.0' },
        description: 'Version de l\'app mobile (426 si inférieure à la version minimale).',
      },
    },
    schemas: {
      Erreur: {
        type: 'object', required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          code: { type: 'string', example: 'APP_UPDATE_REQUIRED' },
          errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
          totalPages: { type: 'integer' }, hasNext: { type: 'boolean' }, hasPrev: { type: 'boolean' },
        },
      },
      Tokens: {
        type: 'object', required: ['accessToken', 'refreshToken'],
        properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
      },
      Utilisateur: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, matricule: { type: 'string', example: '22FS0001' },
          nom: { type: 'string' }, prenom: { type: 'string' }, email: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['etudiant', 'enseignant', 'admin'] },
          statut: { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] },
          niveau: { type: 'string', enum: ['L1', 'L2', 'L3', 'M1', 'M2'], nullable: true },
          filiere_id: { type: 'integer', nullable: true },
        },
      },
      Ecole: { type: 'object', properties: { id: { type: 'integer' }, ecole: { type: 'string' } } },
      Filiere: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, code: { type: 'string' }, nom: { type: 'string' },
          departement: { type: 'string', nullable: true }, ecole_id: { type: 'integer' }, actif: { type: 'boolean' },
        },
      },
      UE: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, code: { type: 'string' }, intitule: { type: 'string' },
          niveau: { type: 'string', enum: ['L1', 'L2', 'L3', 'M1', 'M2'] },
          semestre: { type: 'string', example: 'S1' }, credits: { type: 'integer' },
          actif: { type: 'boolean' }, filiere_id: { type: 'integer' },
        },
      },
      Cours: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, titre: { type: 'string' }, description: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] },
          statut: { type: 'string', enum: ['en_attente', 'publie', 'archive'] },
          anneAcademique: { type: 'string', example: '2025-2026' },
          vues: { type: 'integer' }, ue_id: { type: 'integer' }, enseignant_id: { type: 'integer' },
        },
      },
      FichierBlob: {
        type: 'object', required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'URL Vercel Blob (https, *.public.blob.vercel-storage.com).' },
          nomFichierOriginal: { type: 'string', example: 'Cours de Maths L1.pdf' },
          tailleFichier: { type: 'integer', format: 'int64' },
        },
      },
      CoursCreation: {
        type: 'object', required: ['titre', 'ue_id', 'fichiers'],
        properties: {
          titre: { type: 'string' }, description: { type: 'string' },
          type: { type: 'string', enum: ['pdf', 'video', 'slide', 'autre'] },
          ue_id: { type: 'integer' }, anneAcademique: { type: 'string', example: '2025-2026' },
          fichiers: { type: 'array', minItems: 1, items: ref('FichierBlob') },
        },
      },
      Sujet: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, titre: { type: 'string' },
          type_epreuve: { type: 'string', enum: ['partiel', 'terminal', 'tp', 'td'] },
          session: { type: 'string', enum: ['normale', 'rattrapage'] },
          annee_academique: { type: 'string', example: '2024-2025' },
          type: { type: 'string', deprecated: true, description: 'Ancien contrat, remplacé par type_epreuve.' },
          annee: { type: 'integer', deprecated: true, description: 'Ancien contrat, remplacé par annee_academique.' },
          avecCorrige: { type: 'boolean' },
          statut: { type: 'string', enum: ['en_attente', 'publie', 'archive'] },
          taille_octets: { type: 'integer', format: 'int64', nullable: true },
          nom_origine: { type: 'string', nullable: true },
          mime: { type: 'string', nullable: true },
          nb_telechargements: { type: 'integer' },
          ue_id: { type: 'integer' }, enseignant_id: { type: 'integer' },
        },
      },
      SujetFichier: {
        type: 'object', required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
          tailleFichier: { type: 'integer', format: 'int64' },
          sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
          mime: { type: 'string' }, nomOrigine: { type: 'string' },
        },
      },
      SujetCreation: {
        type: 'object', required: ['titre', 'session', 'ue_id', 'sujet'],
        description: 'Fournir `type_epreuve` (ou l\'ancien `type`) et `annee_academique` (ou l\'ancien `annee`).',
        properties: {
          titre: { type: 'string' },
          type_epreuve: { type: 'string', enum: ['partiel', 'terminal', 'tp', 'td'] },
          type: { type: 'string', enum: ['partiel', 'rattrapage', 'terminal', 'tp', 'td'], deprecated: true },
          session: { type: 'string', enum: ['normale', 'rattrapage'] },
          annee_academique: { type: 'string', pattern: '^\\d{4}-\\d{4}$' },
          annee: { type: 'integer', minimum: 2000, maximum: 2100, deprecated: true },
          ue_id: { type: 'integer' },
          sujet: ref('SujetFichier'), corrige: ref('SujetFichier'),
        },
      },
      DocumentRecherche: {
        type: 'object',
        description: 'Un fichier trouvé : sujet d\'examen (`type_contenu: sujet_examen`) ou fichier d\'un cours (`cours`).',
        properties: {
          id: { type: 'integer' },
          type_contenu: { type: 'string', enum: ['sujet_examen', 'cours'] },
          nom: { type: 'string' },
          type: { type: 'string' },
          type_epreuve: { type: 'string', enum: ['partiel', 'terminal', 'tp', 'td'], description: 'Sujets uniquement.' },
          session: { type: 'string', enum: ['normale', 'rattrapage'], description: 'Sujets uniquement.' },
          avec_corrige: { type: 'boolean', description: 'Sujets uniquement.' },
          annee_academique: { type: 'string', nullable: true, example: '2024-2025' },
          taille_octets: { type: 'integer', format: 'int64', nullable: true },
          taille_lisible: { type: 'string', example: '2 Mo' },
          telechargements: { type: 'integer' },
          deja_telecharge: { type: 'boolean' },
          lien_telechargement: { type: 'string' },
          lien_corrige: { type: 'string', nullable: true, description: 'Sujets avec corrigé uniquement.' },
          niveau: { type: 'string' }, semestre: { type: 'string' },
          filiere_code: { type: 'string' }, filiere_nom: { type: 'string' }, ecole_nom: { type: 'string', nullable: true },
          code_ue: { type: 'string' }, intitule_ue: { type: 'string' },
        },
        additionalProperties: true,
      },
      Config: {
        type: 'object',
        properties: {
          apiVersion: { type: 'string', example: 'v1' }, serverVersion: { type: 'string' },
          minAppVersion: { type: 'string', example: '1.0.0' }, latestAppVersion: { type: 'string' },
          updateUrl: { type: 'string', nullable: true }, updateMessage: { type: 'string' },
          maxUploadMB: { type: 'integer' }, allowedContentTypes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/config': { get: { tags: ['Configuration'], summary: 'Configuration publique pour l\'app mobile',
      responses: { 200: ok('Configuration', envelope(ref('Config'))) } } },
    '/ping': { get: { tags: ['Configuration'], summary: 'Test de disponibilité',
      responses: { 200: ok('OK', { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } }) } } },

    '/auth/login': { post: { tags: ['Auth'], summary: 'Connexion (10 essais / 15 min par IP + matricule)',
      requestBody: jsonBody({ type: 'object', required: ['matricule', 'password'],
        properties: { matricule: { type: 'string', example: '22FS0001' }, password: { type: 'string' } } }),
      responses: { 200: ok('Jetons et profil', envelope({ allOf: [ref('Tokens')], type: 'object',
        properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, utilisateur: ref('Utilisateur') } })),
        400: err('Données invalides'), 401: err('Identifiants incorrects'), 403: err('Compte suspendu ou en attente'), 429: std[429] } } },
    '/auth/refresh': { post: { tags: ['Auth'], summary: 'Renouveler les jetons',
      requestBody: jsonBody({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }),
      responses: { 200: ok('Nouveaux jetons', envelope(ref('Tokens'))), 401: err('Refresh token invalide') } } },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Déconnexion', security: secured,
      responses: { 200: ok('Déconnecté', envelope({ type: 'object' })), ...pick(401) } } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Profil de l\'utilisateur connecté', security: secured,
      responses: { 200: ok('Profil', envelope(ref('Utilisateur'))), ...pick(401) } } },
    '/auth/change-password': { put: { tags: ['Auth'], summary: 'Changer son mot de passe', security: secured,
      requestBody: jsonBody({ type: 'object', properties: { ancienPassword: { type: 'string' }, nouveauPassword: { type: 'string' } } }),
      responses: { 200: ok('Mis à jour', envelope({ type: 'object' })), 400: err('Données invalides'), ...pick(401) } } },

    '/users': {
      get: { tags: ['Utilisateurs'], summary: 'Lister les utilisateurs (admin)', security: secured, parameters: pageParams,
        responses: { 200: ok('Liste', paginatedOf(ref('Utilisateur'))), ...pick(401, 403) } },
      post: { tags: ['Utilisateurs'], summary: 'Créer un utilisateur (admin)', security: secured,
        requestBody: jsonBody(ref('Utilisateur')),
        responses: { 201: ok('Créé', envelope(ref('Utilisateur'))), 400: err('Données invalides'), ...pick(401, 403, 409) } },
    },
    '/users/{id}': {
      parameters: [idParam],
      get: { tags: ['Utilisateurs'], summary: 'Détail (admin)', security: secured,
        responses: { 200: ok('Utilisateur', envelope(ref('Utilisateur'))), ...pick(401, 403, 404) } },
      put: { tags: ['Utilisateurs'], summary: 'Modifier (admin)', security: secured, requestBody: jsonBody(ref('Utilisateur')),
        responses: { 200: ok('Modifié', envelope(ref('Utilisateur'))), ...pick(401, 403, 404) } },
      delete: { tags: ['Utilisateurs'], summary: 'Supprimer (admin)', security: secured,
        responses: { 200: ok('Supprimé', envelope({ type: 'object' })), ...pick(401, 403, 404) } },
    },
    '/users/{id}/statut': { parameters: [idParam],
      patch: { tags: ['Utilisateurs'], summary: 'Changer le statut (admin)', security: secured,
        requestBody: jsonBody({ type: 'object', properties: { statut: { type: 'string', enum: ['actif', 'en_attente', 'suspendu'] } } }),
        responses: { 200: ok('Mis à jour', envelope(ref('Utilisateur'))), ...pick(401, 403, 404) } } },

    '/cours': {
      get: { tags: ['Cours'], summary: 'Lister les cours', security: secured, parameters: pageParams,
        responses: { 200: ok('Liste', paginatedOf(ref('Cours'))), ...pick(401) } },
      post: { tags: ['Cours'], summary: 'Déposer un cours (enseignant, admin)', security: secured,
        requestBody: jsonBody(ref('CoursCreation')),
        responses: { 201: ok('Créé (en attente de validation sauf admin)', envelope(ref('Cours'))),
          400: err('Données ou URL de fichier invalides'), ...pick(401, 403, 404) } },
    },
    '/cours/{id}': {
      parameters: [idParam],
      get: { tags: ['Cours'], summary: 'Détail d\'un cours',
        responses: { 200: ok('Cours', envelope(ref('Cours'))), ...pick(404) } },
      put: { tags: ['Cours'], summary: 'Modifier un cours (propriétaire ou admin)', security: secured,
        requestBody: jsonBody(ref('CoursCreation'), false),
        responses: { 200: ok('Modifié', envelope(ref('Cours'))), 400: err('Données invalides'), ...pick(401, 403, 404) } },
      delete: { tags: ['Cours'], summary: 'Supprimer un cours (propriétaire ou admin)', security: secured,
        responses: { 200: ok('Supprimé', envelope({ type: 'object' })), ...pick(401, 403, 404) } },
    },
    '/cours/{id}/statut': { parameters: [idParam],
      patch: { tags: ['Cours'], summary: 'Changer le statut (admin)', security: secured,
        requestBody: jsonBody({ type: 'object', properties: { statut: { type: 'string', enum: ['publie', 'archive', 'en_attente'] } } }),
        responses: { 200: ok('Mis à jour', envelope(ref('Cours'))), ...pick(401, 403, 404) } } },
    '/cours/{coursId}/documents/{documentId}/telecharger': {
      parameters: [{ name: 'coursId', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'documentId', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['Cours'], summary: 'Télécharger un document d\'un cours',
        responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          ...pick(404, 429) } } },

    '/sujets': {
      get: { tags: ['Sujets'], summary: 'Lister les sujets publiés', security: secured,
        parameters: [...pageParams,
          { name: 'ue_id', in: 'query', schema: { type: 'integer' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'session', in: 'query', schema: { type: 'string', enum: ['normale', 'rattrapage'] } },
          { name: 'annee', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }],
        responses: { 200: ok('Liste', paginatedOf(ref('Sujet'))), ...pick(401) } },
      post: { tags: ['Sujets'], summary: 'Déposer un sujet (enseignant, admin) — un fichier déjà présent (SHA-256) est refusé', security: secured,
        requestBody: jsonBody(ref('SujetCreation')),
        responses: { 201: ok('Créé', envelope(ref('Sujet'))), 400: err('Données ou URL de fichier invalides'), ...pick(401, 403, 404, 409) } },
    },
    '/sujets/{id}': {
      parameters: [idParam],
      get: { tags: ['Sujets'], summary: 'Détail d\'un sujet', security: secured,
        responses: { 200: ok('Sujet', envelope(ref('Sujet'))), ...pick(401, 404) } },
      put: { tags: ['Sujets'], summary: 'Modifier un sujet (propriétaire ou admin)', security: secured,
        requestBody: jsonBody(ref('SujetCreation'), false),
        responses: { 200: ok('Modifié', envelope(ref('Sujet'))), 400: err('Données invalides'), ...pick(401, 403, 404) } },
      delete: { tags: ['Sujets'], summary: 'Supprimer un sujet (propriétaire ou admin)', security: secured,
        responses: { 200: ok('Supprimé', envelope({ type: 'object' })), ...pick(401, 403, 404) } },
    },
    '/sujets/{id}/statut': { parameters: [idParam],
      patch: { tags: ['Sujets'], summary: 'Changer le statut (admin)', security: secured,
        requestBody: jsonBody({ type: 'object', properties: { statut: { type: 'string', enum: ['publie', 'archive', 'en_attente'] } } }),
        responses: { 200: ok('Mis à jour', envelope(ref('Sujet'))), ...pick(401, 403, 404) } } },
    '/sujets/{id}/telecharger': { parameters: [idParam],
      get: { tags: ['Sujets'], summary: 'Télécharger un sujet ou son corrigé', security: secured,
        parameters: [{ name: 'corrige', in: 'query', schema: { type: 'boolean' } }],
        responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          ...pick(401, 404, 429) } } },

    '/filieres': {
      get: { tags: ['Filières'], summary: 'Lister les filières', responses: { 200: ok('Liste', envelope({ type: 'array', items: ref('Filiere') })) } },
      post: { tags: ['Filières'], summary: 'Créer une filière (admin)', security: secured, requestBody: jsonBody(ref('Filiere')),
        responses: { 201: ok('Créée', envelope(ref('Filiere'))), 400: err('Données invalides'), ...pick(401, 403, 409) } },
    },
    '/filieres/{id}': { parameters: [idParam],
      get: { tags: ['Filières'], summary: 'Détail', responses: { 200: ok('Filière', envelope(ref('Filiere'))), ...pick(404) } },
      put: { tags: ['Filières'], summary: 'Modifier (admin)', security: secured, requestBody: jsonBody(ref('Filiere')),
        responses: { 200: ok('Modifiée', envelope(ref('Filiere'))), ...pick(401, 403, 404) } },
      delete: { tags: ['Filières'], summary: 'Désactiver (admin)', security: secured,
        responses: { 200: ok('Désactivée', envelope({ type: 'object' })), ...pick(401, 403, 404) } } },
    '/filieres/{id}/ues': { parameters: [idParam],
      get: { tags: ['Filières'], summary: 'UE d\'une filière',
        responses: { 200: ok('Liste', envelope({ type: 'array', items: ref('UE') })), ...pick(404) } },
      post: { tags: ['Filières'], summary: 'Créer une UE (admin)', security: secured, requestBody: jsonBody(ref('UE')),
        responses: { 201: ok('Créée', envelope(ref('UE'))), 400: err('Données invalides'), ...pick(401, 403, 404, 409) } } },
    '/filieres/{id}/ues/{ueId}': {
      parameters: [idParam, { name: 'ueId', in: 'path', required: true, schema: { type: 'integer' } }],
      put: { tags: ['Filières'], summary: 'Modifier une UE (admin)', security: secured, requestBody: jsonBody(ref('UE')),
        responses: { 200: ok('Modifiée', envelope(ref('UE'))), ...pick(401, 403, 404) } },
      delete: { tags: ['Filières'], summary: 'Désactiver une UE (admin)', security: secured,
        responses: { 200: ok('Désactivée', envelope({ type: 'object' })), ...pick(401, 403, 404) } } },

    '/ecoles': {
      get: { tags: ['Écoles'], summary: 'Lister les écoles', responses: { 200: ok('Liste', envelope({ type: 'array', items: ref('Ecole') })) } },
      post: { tags: ['Écoles'], summary: 'Créer une école (admin)', security: secured, requestBody: jsonBody(ref('Ecole')),
        responses: { 201: ok('Créée', envelope(ref('Ecole'))), 400: err('Données invalides'), ...pick(401, 403) } },
    },
    '/ecoles/{id}': { parameters: [idParam],
      get: { tags: ['Écoles'], summary: 'Détail', responses: { 200: ok('École', envelope(ref('Ecole'))), ...pick(404) } },
      put: { tags: ['Écoles'], summary: 'Modifier (admin)', security: secured, requestBody: jsonBody(ref('Ecole')),
        responses: { 200: ok('Modifiée', envelope(ref('Ecole'))), ...pick(401, 403, 404) } },
      delete: { tags: ['Écoles'], summary: 'Supprimer (admin) — refusé tant qu\'elle a des filières', security: secured,
        responses: { 200: ok('Supprimée', envelope({ type: 'object' })), ...pick(401, 403, 404, 409) } } },

    '/search/documents': { get: { tags: ['Recherche'],
      summary: 'Rechercher des sujets et des cours (sans accents ni casse) — sujets d\'abord, année académique décroissante',
      description: 'Fournir un terme (`q` ou `nom`) ou au moins un filtre. Résultats paginés : 20 par défaut, 50 au plus.',
      parameters: [
        ...['nom', 'q', 'niveau', 'semestre', 'ue', 'ue_id', 'filiere', 'filiere_id', 'ecole', 'ecole_id', 'type', 'annee']
          .map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      ],
      responses: { 200: ok('Résultats', envelope({ type: 'object', properties: {
        documents: { type: 'array', items: ref('DocumentRecherche') },
        nombre_resultats: { type: 'integer', description: 'Total, toutes pages confondues.' },
        pagination: ref('Pagination') } })),
        400: err('Aucun terme ni filtre') } } },
    '/search/documents/telecharger': { get: { tags: ['Recherche'], summary: 'Télécharger un document trouvé (30/h pour un anonyme)',
      parameters: [
        { name: 'type', in: 'query', required: true, schema: { type: 'string', enum: ['cours', 'sujet'] } },
        { name: 'id', in: 'query', required: true, schema: { type: 'integer' } },
        { name: 'document_id', in: 'query', schema: { type: 'integer' } },
        { name: 'corrige', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: { description: 'Fichier', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
        400: err('Paramètres invalides'), ...pick(404, 429) } } },

    '/upload/client-token': { post: { tags: ['Upload'], summary: 'Jeton d\'upload direct vers Vercel Blob (enseignant, admin)', security: secured,
      requestBody: jsonBody({ type: 'object', description: 'Corps envoyé par le SDK @vercel/blob/client.' }),
      responses: { 200: ok('Jeton', { type: 'object' }), 400: err('Refusé'), ...pick(401, 403) } } },
  },
};

module.exports = spec;
