# Recherche de documents par filière, niveau et école

## Endpoint

Pour rechercher des documents, utilisez l’endpoint suivant :

GET /api/search/documents

## Paramètres de recherche

- `nom` ou `q` : terme de recherche (optionnel si un filtre est fourni)
- `filiere` : filtre par filière
  - exemple : `INF`
  - ou le nom complet : `Informatique`
- `filiere_id` : identifiant de la filière
- `niveau` : filtre par niveau d’UE
  - exemples : `L1`, `L2`, `L3`, `M1`, `M2`
- `ecole` : filtre par nom d’école
- `ecole_id` : identifiant de l’école
- `type` : type de document
  - exemples : `pdf`, `video`, `slide`, `partiel`, `rattrapage`
- `annee` : année académique ou année d’examen

## Exemples de requêtes

### 1. Rechercher par filière

```bash
curl "http://localhost:3000/api/search/documents?filiere=INF"
```

```bash
curl "http://localhost:3000/api/search/documents?filiere=Informatique"
```

### 2. Rechercher par niveau

```bash
curl "http://localhost:3000/api/search/documents?niveau=L1"
```

### 3. Rechercher par école

```bash
curl "http://localhost:3000/api/search/documents?ecole=Ecole%20Centrale"
```

### 4. Rechercher par filière + niveau

```bash
curl "http://localhost:3000/api/search/documents?filiere=INF&niveau=L1"
```

### 5. Rechercher par filière + école

```bash
curl "http://localhost:3000/api/search/documents?filiere=Informatique&ecole=Ecole%20Centrale"
```

### 6. Rechercher par mot-clé + filière + niveau + école

```bash
curl "http://localhost:3000/api/search/documents?nom=algorithme&filiere=INF&niveau=L1&ecole=Ecole%20Centrale"
```

## Exemple de réponse

```json
{
  "success": true,
  "data": {
    "nombre_resultats": 2,
    "documents": [
      {
        "id": 1,
        "type_contenu": "cours",
        "nom": "Cours de test",
        "type": "pdf",
        "niveau": "L1",
        "filiere_code": "INF",
        "filiere_nom": "Informatique",
        "ecole_nom": "Ecole Centrale"
      }
    ]
  }
}
```

## Notes importantes

- Si vous ne fournissez pas de mot-clé `nom` ou `q`, il faut au moins un filtre (`filiere`, `niveau`, `ecole`, `type` ou `annee`).
- Le filtre `filiere` accepte maintenant le code ou le nom complet de la filière.
- L’endpoint est public et peut être utilisé sans authentification.
