# Campus-edu-backend

Plateforme universitaire — API REST Node.js / Express / Sequelize / MySQL

---

## Endpoints API

### Auth — `/api/auth`

| Méthode | Route            | Accès   | Description                      |
|---------|------------------|---------|----------------------------------|
| POST    | `/login`         | Public  | Connexion par matricule + mdp    |
| POST    | `/refresh`       | Public  | Renouveler l'access token        |
| POST    | `/logout`        | Auth    | Déconnexion (invalide le token)  |
| GET     | `/me`            | Auth    | Profil de l'utilisateur connecté |


### Cours — `/api/cours`

| Méthode | Route                   | Accès               | Description                       |
|---------|-------------------------|---------------------|-----------------------------------|
| GET     | `/`                     | Tous (auth)         | Liste (filtrée selon rôle)        |
| GET     | `/:id`                  | Tous (auth)         | Détail d'un cours                 |
| GET     | `/:id/telecharger`      | Tous (auth)         | Télécharger le fichier            |
| POST    | `/`                     | Enseignant / Admin  | Déposer un cours (multipart)      |
| PATCH   | `/:id/statut`           | Admin               | Publier / archiver                |
| DELETE  | `/:id`                  | Admin               | Supprimer                         |

**Query params GET `/` :**
- `ue_id`, `type` (pdf|video|slide), `annee`, `search`, `page`, `limit`

---

### Sujets — `/api/sujets`

| Méthode | Route                   | Accès               | Description                        |
|---------|-------------------------|---------------------|------------------------------------|
| GET     | `/`                     | Tous (auth)         | Liste (filtrée selon rôle)         |
| GET     | `/:id`                  | Tous (auth)         | Détail                             |
| GET     | `/:id/telecharger`      | Tous (auth)         | Télécharger sujet (ou corrigé)     |
| POST    | `/`                     | Enseignant / Admin  | Déposer sujet + corrigé optionnel  |
| PATCH   | `/:id/statut`           | Admin               | Publier / archiver                 |

---

### Filières & UEs — `/api/filieres`

| Méthode | Route              | Accès  | Description              |
|---------|--------------------|--------|--------------------------|
| GET     | `/`                | Auth   | Liste des filières       |
| GET     | `/:id`             | Auth   | Détail + UEs             |
| GET     | `/:id/ues`         | Auth   | UEs d'une filière        |
| POST    | `/`                | Admin  | Créer une filière        |
| POST    | `/:id/ues`         | Admin  | Ajouter une UE           |

---

### Recherche publique — `/api/search/documents`

| Méthode | Route                   | Accès | Description |
|---------|-------------------------|-------|-------------|
| GET     | `/documents`            | Public | Recherche de cours et sujets avec filtres `q`, `nom`, `niveau`, `filiere`, `ecole`, `annee`, `type` |

---

### Utilisateurs — `/api/users`

| Méthode | Route              | Accès  | Description                     |
|---------|--------------------|--------|---------------------------------|
| GET     | `/`                | Admin  | Liste paginée + filtres         |
| GET     | `/:id`             | Admin  | Détail                          |
| POST    | `/`                | Admin  | Créer un compte                 |
| PUT     | `/:id`             | Admin  | Modifier                        |
| PATCH   | `/:id/statut`      | Admin  | Activer / suspendre             |
| DELETE  | `/:id`             | Admin  | Supprimer                       |

---

## Sécurité des commits

Avant de pousser vers un dépôt partagé ou de préparer une version de production :

- ne commitez jamais `*.env`, `uploads/`, `logs/`, `coverage/`, ni les fichiers de base de données locales (`*.sqlite`, `*.sqlite3`).
- utilisez `.gitignore` pour exclure les fichiers locaux et les données de test.
- conservez uniquement le code source et les scripts nécessaires à l'exécution en production.

---

## Structure des dossiers

```
uniportal/
├── src/
│   ├── app.js                    ← Point d'entrée Express
│   ├── config/
│   │   ├── database.js           ← Sequelize + pool connexions
│   │   └── seedDb.js             ← Données initiales
│   ├── middlewares/
│   │   ├── auth.js               ← verifyToken, authorize, ownerOrAdmin
│   │   ├── errorHandler.js       ← Gestionnaire d'erreurs global
│   │   ├── upload.js             ← Multer (PDF, vidéo...)
│   │   └── validate.js           ← express-validator wrapper
│   ├── models/
│   │   └── index.js              ← Tous les modèles + associations
│   ├── modules/
│   │   ├── auth/                 ← login, refresh, logout, me
│   │   ├── cours/                ← CRUD cours + téléchargement
│   │   ├── sujets/               ← CRUD sujets + corrigés
│   │   ├── users/                ← Gestion admin des comptes
│   │   └── filieres/             ← Filières + UEs
│   └── utils/
│       ├── apiResponse.js        ← Helpers réponses cohérentes
│       └── logger.js             ← Winston logger
├── uploads/                      ← Fichiers uploadés (hors git)
├── .env.example
├── .gitignore
└── package.json
```

---

## Authentification

Toutes les routes protégées nécessitent :
```
Authorization: Bearer <accessToken>
```

Le rôle est détecté automatiquement depuis le **format du matricule** :
- `22FS0001` → étudiant
- `ENS-0001` → enseignant
- `ADM-0001` → admin

---

## Format des réponses

**Succès :**
```json
{ "success": true, "message": "...", "data": { ... } }
```

**Paginé :**
```json
{
  "success": true,
  "data": [...],
  "pagination": { "total": 120, "page": 1, "limit": 20, "totalPages": 6 }
}
```

**Erreur :**
```json
{ "success": false, "message": "...", "errors": [...] }
```
