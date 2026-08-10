# Recherche de documents

## Endpoint

Pour rechercher des documents, utilisez l’endpoint suivant :

GET /api/search/documents

## Paramètres disponibles

- `nom` ou `q` : terme de recherche (optionnel si au moins un filtre est fourni)
- `filiere` : filtre par filière. Il accepte maintenant soit :
  - le code de la filière, par exemple `INF`
  - le nom complet de la filière, par exemple `Informatique`
- `filiere_id` : identifiant de la filière
- `niveau` : niveau de l’UE, par exemple `L1`, `L2`, `L3`, `M1`, `M2`
- `ecole` : nom de l’école
- `ecole_id` : identifiant de l’école
- `type` : type de document, par exemple `pdf`, `video`, `slide`, `partiel`, `rattrapage`, `terminal`, `tp`, `td`
- `annee` : année académique ou année d’examen

## Méthodes de recherche possibles

### 1. Recherche par filière uniquement

Cette méthode retourne tous les documents publiés liés à une filière donnée.

```bash
curl "http://localhost:3000/api/search/documents?filiere=INF"
```

```bash
curl "http://localhost:3000/api/search/documents?filiere=Informatique"
```

### 2. Recherche par mot-clé + filière

Permet de limiter les résultats à une filière tout en recherchant un mot précis.

```bash
curl "http://localhost:3000/api/search/documents?nom=algorithme&filiere=INF"
```

### 3. Recherche par niveau

Retourne les documents selon le niveau de l’UE.

```bash
curl "http://localhost:3000/api/search/documents?niveau=L1"
```

### 4. Recherche par école

Retourne les documents associés à une école donnée.

```bash
curl "http://localhost:3000/api/search/documents?ecole=Ecole%20Centrale"
```

### 5. Recherche combinée

Vous pouvez combiner plusieurs filtres pour affiner les résultats.

```bash
curl "http://localhost:3000/api/search/documents?nom=cours&filiere=INF&niveau=L1&type=pdf"
```

```bash
curl "http://localhost:3000/api/search/documents?filiere=Informatique&ecole=Ecole%20Centrale&annee=2024"
```

### 6. Recherche par identifiant

Si vous connaissez déjà l’ID de la filière ou de l’école, vous pouvez utiliser ces paramètres.

```bash
curl "http://localhost:3000/api/search/documents?filiere_id=2"
```

```bash
curl "http://localhost:3000/api/search/documents?ecole_id=1"
```

## Notes importantes

- Si aucun terme de recherche `nom` ou `q` n’est fourni, il faut au moins un filtre comme `filiere`, `niveau`, `ecole`, `type` ou `annee`.
- L’endpoint est public et peut être appelé sans authentification.
- Le filtre `filiere` peut être utilisé avec soit le code (`INF`) soit le nom complet (`Informatique`).
- Les résultats contiennent des informations utiles comme :
  - `filiere_code`
  - `filiere_nom`
  - `ecole_nom`
  - `niveau`
  - `code_ue`
  - `intitule_ue`

## Exemple de réponse

La réponse retourne un objet JSON contenant :

- `nombre_resultats`
- `documents`

Exemple :

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
        "ecole_nom": "Ecole Centrale",
        "code_ue": "INFO101",
        "intitule_ue": "Algorithmique"
      }
    ]
  }
}
```

## Notes

- Si aucun terme de recherche n’est fourni, il faut au moins un filtre comme `filiere`, `niveau`, `ecole` ou `type`.
- L’endpoint est public et peut être appelé sans authentification.
