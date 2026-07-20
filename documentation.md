# Documentation de l'API Campus Edu

## Présentation

Cette API REST est une application Node.js utilisant Express et Sequelize. Elle expose les ressources d'une plateforme universitaire pour gérer :
- l'authentification des utilisateurs (étudiants, enseignants, admin)
- la gestion des utilisateurs
- la gestion des filières et des unités d'enseignement (UE)
- la gestion des cours
- la gestion des sujets d'examen
- la recherche publique parmi les cours et sujets

L'application se connecte à une base de données PostgreSQL via Sequelize et utilise JSON Web Tokens (JWT) pour l'authentification.

## Principe de fonctionnement

1. `src/app.js` initialise Express, charge les middlewares globaux et monte les routes des modules.
2. La base de données est connectée via `src/config/database.js` en utilisant l'URL PostgreSQL fournie.
3. Les modèles définissent les entités principales : `Filiere`, `Utilisateur`, `UE`, `Cours`, `Sujet` et `AuditLog`.
4. Les routes API sont structurées par module dans `src/modules/`.
5. Les routes protégées vérifient le token JWT avec `verifyToken` et appliquent, si nécessaire, des contrôles de rôle via `authorize`.
6. Les fichiers uploadés sont gérés par `multer` et enregistrés dans le répertoire local `uploads/`.
7. Les erreurs sont normalisées avec un gestionnaire global (`errorHandler`) et des réponses API cohérentes (`utils/apiResponse.js`).

## Architecture générale

- `src/app.js` : point d'entrée de l'application
- `src/config/database.js` : configuration Sequelize et connexion à PostgreSQL
- `src/models/index.js` : définition des modèles et associations
- `src/modules/auth/` : authentification, refresh, logout, profil et changement de mot de passe
- `src/modules/users/` : administration des comptes utilisateurs
- `src/modules/filieres/` : gestion des filières et des UEs
- `src/modules/cours/` : gestion des cours et téléchargements
- `src/modules/sujets/` : gestion des sujets d'examen et téléchargements
- `src/modules/search/` : recherche publique par UE, filière, niveau, etc.
- `src/middlewares/` : authentification, validation, upload, erreurs
- `src/utils/` : helpers pour le logger et les réponses API

## Modèles de données principaux

### Filiere
- `id`, `code`, `nom`, `departement`, `actif`

### Utilisateur
- `id`, `matricule`, `nom`, `prenom`, `email`, `password`, `role`, `statut`, `niveau`, `filiere_id`, `refreshToken`, `derniereConnexion`
- rôles possibles : `etudiant`, `enseignant`, `admin`
- statuts possibles : `actif`, `en_attente`, `suspendu`

### UE
- `id`, `code`, `intitule`, `niveau`, `semestre`, `credits`, `actif`, `filiere_id`

### Cours
- `id`, `titre`, `description`, `type`, `cheminFichier`, `nomFichierOriginal`, `tailleFichier`, `statut`, `anneAcademique`, `vues`, `telechargemements`, `ue_id`, `enseignant_id`
- types : `pdf`, `video`, `slide`, `autre`
- statuts : `en_attente`, `publie`, `archive`

### Sujet
- `id`, `titre`, `type`, `session`, `annee`, `cheminFichier`, `avecCorrige`, `cheminCorrige`, `statut`, `telechargemements`, `ue_id`, `enseignant_id`
- types : `partiel`, `rattrapage`, `terminal`, `tp`, `td`
- session : `normale`, `rattrapage`
- statuts : `en_attente`, `publie`, `archive`

### AuditLog
- `id`, `action`, `details`, `ipAddress`, `userAgent`, `resultat`, `utilisateur_id`

## Authentification et autorisation

- Les routes protégées attendent un header `Authorization: Bearer <accessToken>`.
- `accessToken` est signé avec `JWT_SECRET` et expire typiquement après `JWT_EXPIRES_IN`.
- `refreshToken` est signé avec `JWT_REFRESH_SECRET`, stocké côté utilisateur dans la base, et permet de renouveler la session.
- `verifyToken` charge l'utilisateur actif dans `req.user`.
- `authorize('admin')` ou `authorize('enseignant', 'admin')` contrôle les rôles.
- `optionalAuth` est utilisé sur certains téléchargements pour autoriser des accès publics tout en attachant l'utilisateur si un token valide est fourni.
- Les cours peuvent être téléchargés gratuitement sans compte actif.
- Les sujets d'examen nécessitent un compte utilisateur authentifié pour le téléchargement.

## Format des réponses

### Réponse de succès simple

```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

### Réponse paginée

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Erreur

```json
{
  "success": false,
  "message": "...",
  "errors": [ { "field": "...", "message": "..." } ]
}
```

## Endpoints

### Authentification `/api/auth`

- `POST /api/auth/login`
  - corps JSON : `{ "matricule": "...", "password": "..." }`
  - réponse : `{ accessToken, refreshToken, utilisateur }`
- `POST /api/auth/refresh`
  - corps JSON : `{ "refreshToken": "..." }`
  - réponse : nouveaux tokens
- `POST /api/auth/logout`
  - protégé
  - invalide le refresh token stocké en base
- `GET /api/auth/me`
  - protégé
  - renvoie le profil de l'utilisateur connecté
- `PUT /api/auth/change-password`
  - protégé
  - corps JSON : `{ "ancienPassword": "...", "nouveauPassword": "..." }`

### Utilisateurs `/api/users`

- `GET /api/users`
  - accès : `admin`
  - query params : `role`, `statut`, `filiere_id`, `search`, `page`, `limit`
  - liste paginée des utilisateurs
- `GET /api/users/:id`
  - accès : `admin`
  - renvoie un utilisateur
- `POST /api/users`
  - accès : `admin`
  - corps JSON : `{ matricule, nom, prenom, email?, role, niveau?, filiere_id?, password? }`
  - crée un utilisateur; si `password` absent, le mot de passe par défaut est le `matricule`
- `PUT /api/users/:id`
  - accès : `admin`
  - met à jour le profil de l'utilisateur
- `PATCH /api/users/:id/statut`
  - accès : `admin`
  - corps JSON : `{ statut: "actif" | "en_attente" | "suspendu" }`
- `DELETE /api/users/:id`
  - accès : `admin`
  - supprime un utilisateur (auto-suppression interdite)

### Filières `/api/filieres`

- `GET /api/filieres`
  - accès : authentifié
  - renvoie les filières actives
- `GET /api/filieres/:id`
  - accès : authentifié
  - renvoie la filière et ses UEs actives
- `GET /api/filieres/:id/ues`
  - accès : authentifié
  - query params : `niveau`
  - renvoie les UEs d'une filière
- `POST /api/filieres`
  - accès : `admin`
  - corps JSON : `{ code, nom, departement? }`
- `PUT /api/filieres/:id`
  - accès : `admin`
  - met à jour la filière
- `POST /api/filieres/:id/ues`
  - accès : `admin`
  - corps JSON : `{ code, intitule, niveau, semestre, credits? }`

### Cours `/api/cours`
 
- `GET /api/cours`
  - accès : authentifié
  - query params : `ue_id`, `type`, `annee`, `search`, `page`, `limit`
  - les étudiants voient uniquement les cours de leur filière et niveau
- `GET /api/cours/:id`
  - accès : authentifié
  - renvoie le cours si publié ou si l'utilisateur a le droit de le voir
- `GET /api/cours/:id/telecharger`
  - accès : public via `optionalAuth`
  - renvoie le fichier du cours
  - téléchargement gratuit, accès libre
- `POST /api/cours`
  - accès : `enseignant`, `admin`
  - upload multipart form-data avec champ `fichier`
  - champs : `titre`, `ue_id`, `type?`, `description?`, `anneAcademique?`
  - le statut est `publie` si admin, sinon `en_attente`
- `PATCH /api/cours/:id/statut`
  - accès : `admin`
  - corps JSON : `{ statut: "publie" | "archive" | "en_attente" }`
- `DELETE /api/cours/:id`
  - accès : `admin`

### Sujets `/api/sujets`
 
- `GET /api/sujets`
  - accès : authentifié
  - query params : `ue_id`, `type`, `session`, `annee`, `search`, `page`, `limit`
  - les étudiants voient uniquement les sujets de leur filière et niveau
- `GET /api/sujets/:id`
  - accès : authentifié
- `GET /api/sujets/:id/telecharger?corrige=true`
  - accès : authentifié
  - renvoie soit le sujet, soit le corrigé si disponible
  - téléchargement réservé aux comptes utilisateurs actifs
- `POST /api/sujets`
  - accès : `enseignant`, `admin`
  - upload multipart form-data avec champs `sujet` et facultatif `corrige`
  - champs : `titre`, `type`, `session`, `annee`, `ue_id`
  - le statut est `publie` si admin, sinon `en_attente`
- `PATCH /api/sujets/:id/statut`
  - accès : `admin`
  - corps JSON : `{ statut: "publie" | "archive" | "en_attente" }`

### Recherche publique `/api/search`

- `GET /api/search`
  - public
  - query params : `q`, `filiere_id`, `niveau`, `annee`, `type`
  - recherche groupée par UE avec les cours et sujets associés

### Routes utilitaires

- `GET /health`
  - route de healthcheck
- `GET /api/ping`
  - route de test de fonctionnement

## Sécurité et protections

- `helmet` pour les headers de sécurité
- `cors` restreint à l'origine de l'interface front-end (`FRONTEND_URL`)
- `compression` pour réduire la taille des réponses
- `express-rate-limit` pour limiter les requêtes globales et les tentatives de login
- validation des entrées avec `express-validator`
- gestion centralisée des erreurs avec `src/middlewares/errorHandler.js`
- logs HTTP lisibles en développement avec méthode, URL, statut, durée et taille

## Variables d'environnement

- `NODE_ENV`
- `PORT`
- `DB_URL`
- `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`
- `UPLOAD_DIR`
- `MAX_FILE_SIZE_MB`
- `FRONTEND_URL`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- `B2_BUCKET_NAME`, `B2_ENDPOINT`, `B2_REGION`, `B2_KEY_ID`, `B2_APP_KEY`

## Démarrage

```bash
npm install
npm start
```

En développement :

```bash
npm run dev
```

## Remarques

- Les fichiers sont enregistrés localement dans `uploads/` et servis via `/uploads`.
- Les routes de téléchargement utilisent `res.download` pour proposer un nom de fichier propre.
- Les tokens de rafraîchissement sont stockés en base pour pouvoir les invalider lors du logout.
- La recherche publique est disponible sans JWT.
