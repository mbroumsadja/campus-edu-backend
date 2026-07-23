# API Recherche de Documents

## Endpoint : GET /api/search/documents

Recherche des documents (cours et sujets d'examen) dans la base de données selon des critères spécifiés.

### Paramètres

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `nom` | string | ✅ Oui | Nom du document à rechercher (recherche partielle) |
| `niveau` | string | ❌ Non | Niveau d'étude : `L1`, `L2`, `L3`, `M1`, `M2` |
| `filiere` | string | ❌ Non | Code de la filière (ex: `INFO`, `MATH`, `GC`) |
| `type` | string | ❌ Non | Type de document : `pdf`, `video`, `slide`, `autre` (pour cours) ou `partiel`, `rattrapage`, `terminal`, `tp`, `td` (pour sujets) |

### Réponse (Succès - 200)

```json
{
  "success": true,
  "data": {
    "nombre_resultats": 5,
    "documents": [
      {
        "id": 1,
        "type_contenu": "cours",
        "nom": "Algorithmes Avancés",
        "type": "pdf",
        "lien_telechargement": "/uploads/cours/2024/algo_avance.pdf",
        "taille_octets": 2048576,
        "taille_lisible": "1.95 Mo",
        "niveau": "L2",
        "filiere_code": "INFO",
        "filiere_nom": "Informatique",
        "code_ue": "INFO201",
        "intitule_ue": "Algorithmique Avancée"
      },
      {
        "id": 2,
        "type_contenu": "sujet_examen",
        "nom": "Partiel INFO201 - Session 2023",
        "type": "partiel",
        "lien_telechargement": "/uploads/sujets/2023/partiel_info201.pdf",
        "taille_octets": null,
        "taille_lisible": "Non disponible",
        "niveau": "L2",
        "filiere_code": "INFO",
        "filiere_nom": "Informatique",
        "code_ue": "INFO201",
        "intitule_ue": "Algorithmique Avancée",
        "annee": 2023
      }
    ]
  }
}
```

### Réponse (Erreur - 400)

```json
{
  "success": false,
  "message": "Le paramètre \"nom\" est requis pour rechercher des documents."
}
```

### Exemples d'utilisation

#### 1. Recherche simple par nom
```bash
curl "http://localhost:3000/api/search/documents?nom=algorithme"
```

#### 2. Recherche avec niveau
```bash
curl "http://localhost:3000/api/search/documents?nom=cours&niveau=L2"
```

#### 3. Recherche avec filière
```bash
curl "http://localhost:3000/api/search/documents?nom=programmation&filiere=INFO"
```

#### 4. Recherche avec tous les filtres
```bash
curl "http://localhost:3000/api/search/documents?nom=examen&niveau=L3&filiere=MATH&type=partiel"
```

#### 5. Avec JavaScript/Fetch
```javascript
async function rechercherDocuments(nom, niveau = null, filiere = null, type = null) {
  const params = new URLSearchParams({ nom });
  if (niveau) params.append('niveau', niveau);
  if (filiere) params.append('filiere', filiere);
  if (type) params.append('type', type);

  const response = await fetch(`/api/search/documents?${params}`);
  const data = await response.json();
  
  if (data.success) {
    console.log(`${data.data.nombre_resultats} document(s) trouvé(s)`);
    data.data.documents.forEach(doc => {
      console.log(`- ${doc.nom} (${doc.type}) - ${doc.filiere_nom}`);
    });
  }
}

// Utilisation
rechercherDocuments('algorithme', 'L2', 'INFO');
```

#### 6. Avec Axios
```javascript
const axios = require('axios');

async function searchDocuments(nom, filters = {}) {
  try {
    const response = await axios.get('/api/search/documents', {
      params: { nom, ...filters }
    });
    return response.data.data.documents;
  } catch (error) {
    console.error('Erreur de recherche:', error.response.data.message);
  }
}

// Utilisation
searchDocuments('cours', { niveau: 'L3', filiere: 'MATH' });
```

### Notes importantes

1. **Recherche public** : Cet endpoint est accessible sans authentification JWT
2. **Filtres optionnels** : Les paramètres `niveau` et `filière` réduisent le champ de recherche pour plus de précision
3. **Types de documents** : 
   - Les **cours** ont les types : `pdf`, `video`, `slide`, `autre`
   - Les **sujets d'examen** ont les types : `partiel`, `rattrapage`, `terminal`, `tp`, `td`
4. **Lien de téléchargement** : Le chemin est relatif au serveur (`/uploads/...`)
5. **Taille** : 
   - Pour les **cours** : toujours disponible en octets et lisible
   - Pour les **sujets** : peut être `null` si non disponible
6. **Tri** : Les résultats sont triés avec les cours d'abord, puis les sujets

### Status HTTP possibles

| Code | Description |
|------|-------------|
| 200 | Recherche réussie (avec ou sans résultats) |
| 400 | Paramètre requis manquant ou invalide |
| 500 | Erreur serveur |
