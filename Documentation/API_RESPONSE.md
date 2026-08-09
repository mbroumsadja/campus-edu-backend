# API Response & Fonctionnement

## Objectif
Ce document décrit comment l'API répond aux requêtes et comment elle fonctionne globalement dans le projet `campus-edu-backend`.

## Flux de traitement d'une requête

1. Le point d'entrée est `src/app.js`.
2. Express initialise les middlewares globaux : sécurité, CORS, compression, parsing JSON/urlencoded, logging, rate limiter.
3. Les routes sont montées par module : auth, users, cours, sujets, filieres, ecoles, search.
4. Les middlewares d'authentification (`verifyToken`) et d'autorisation (`authorize`) protègent les routes.
5. Les contrôleurs exécutent la logique métier et renvoient des réponses via `utils/apiResponse.js`.
6. Les erreurs sont captées par le middleware global `errorHandler`.

## Règles générales

- Toutes les routes protégées requièrent un header `Authorization: Bearer <token>`.
- Les routes publiques utilisent `optionalAuth` quand elles veulent accepter un accès anonyme tout en reconnaissant l'utilisateur si un token valide est fourni.
- Les routes admin utilisent `authorize('admin')`.
- Les données uploadées passent par `multer` et sont stockées dans `uploads/`.
- Le CORS autorise le frontend configuré via `process.env.FRONTEND_URL` ou `http://localhost:3001` en développement.

## Format des réponses

### Succès simple

```json
{
  "success": true,
  "message": "Succès",
  "data": { ... }
}
```

### Création de ressource

```json
{
  "success": true,
  "message": "Ressource créée",
  "data": { ... }
}
```

### Réponse paginée

```json
{
  "success": true,
  "data": [ ... ],
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
  "message": "Erreur d'authentification.",
  "errors": [ ... ]
}
```

## Structures des ressources principales

### Utilisateur
- `id`, `matricule`, `nom`, `prenom`, `email`, `role`, `statut`, `niveau`, `filiere_id`
- roles : `etudiant`, `enseignant`, `admin`
- statuts : `actif`, `en_attente`, `suspendu`

### Filière
- `id`, `code`, `nom`, `departement`, `actif`, `ecole_id`

### École
- `id`, `ecole`

### UE
- `id`, `code`, `intitule`, `niveau`, `semestre`, `credits`, `actif`, `filiere_id`

### Cours
- `id`, `titre`, `description`, `type`, `cheminFichier`, `nomFichierOriginal`, `tailleFichier`, `statut`, `anneAcademique`, `vues`, `telechargemements`, `ue_id`, `enseignant_id`

### Sujet
- `id`, `titre`, `type`, `session`, `annee`, `cheminFichier`, `avecCorrige`, `cheminCorrige`, `statut`, `telechargemements`, `ue_id`, `enseignant_id`

## Comportement des endpoints principaux

### Auth
- `POST /api/auth/login` : retourne `accessToken`, `refreshToken`, `utilisateur`
- `POST /api/auth/refresh` : renouvelle les tokens
- `POST /api/auth/logout` : invalide le `refreshToken`
- `GET /api/auth/me` : renvoie le profil connecté

### Recherche publique
- `GET /api/search/documents` : recherche de cours et sujets
- filtres disponibles : `q`, `nom`, `niveau`, `filiere`, `filiere_id`, `ecole`, `ecole_id`, `annee`, `type`

### CRUD Écoles
- `GET /api/ecoles` : liste des écoles
- `GET /api/ecoles/:id` : détail d'une école
- `POST /api/ecoles` : création (admin)
- `PUT /api/ecoles/:id` : modification (admin)
- `DELETE /api/ecoles/:id` : suppression (admin)

## Notes pratiques

- Le serveur démarre via `src/app.js`.
- En développement, utilisez `npm run dev`.
- Pour synchroniser/seed la base : `npm run db:seed`.
- Les réponses sont uniformes grâce aux helpers de `src/utils/apiResponse.js`.
- Les erreurs de validation renvoient des objets `errors` détaillés.
