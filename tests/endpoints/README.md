# Tests d'endpoints API

Ce dossier contient tous les tests d'API pour les endpoints du backend Campus-Edu.

## Structure

```
tests/
├── endpoints/           # Tests des endpoints API
│   ├── documents.test.js    # Tests pour la recherche de documents
│   └── README.md
├── setup.js             # Configuration Jest globale
└── README.md
```

## Installation des dépendances de test

```bash
npm install --save-dev jest supertest
```

## Scripts de test disponibles

```bash
# Exécuter tous les tests
npm test

# Exécuter les tests en mode watch (auto-refresh)
npm run test:watch

# Générer un rapport de couverture de code
npm run test:coverage
```

## Écrire un test d'endpoint

Exemple basique avec `supertest` :

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/mon-endpoint', () => {
  
  it('devrait retourner 200 avec les données attendues', async () => {
    const res = await request(app)
      .get('/api/mon-endpoint')
      .query({ parametre: 'valeur' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

});
```

## Tests existants

### documents.test.js
Tests pour l'endpoint `/api/search/documents` qui recherche des documents (cours et sujets) selon les critères :
- nom (obligatoire)
- niveau (optionnel)
- filiere (optionnel)
- type (optionnel)

Voir la documentation complète : [SEARCH_DOCUMENTS_API.md](../../SEARCH_DOCUMENTS_API.md)

## Configuration Jest

La configuration Jest est définie dans `jest.config.js` :
- Environnement : Node.js
- Timeout : 30 secondes
- Fichier de setup : `tests/setup.js`
- Pattern des tests : `tests/**/*.test.js`

## Variables d'environnement

Créer un fichier `.env.test` à la racine du projet pour la configuration de test :

```env
NODE_ENV=test
PORT=3001
DATABASE_URL=mysql://user:pass@localhost:3306/campus_edu_test
```

## Bonnes pratiques

1. **Nommer les tests clairement** : Utiliser des descriptions `describe` et `it` qui expliquent ce qu'on teste
2. **Un test = une responsabilité** : Ne tester qu'une seule chose par test
3. **Isoler les données** : Utiliser des fixtures ou une base de données de test
4. **Nettoyer après les tests** : Utiliser `afterEach` ou `afterAll` pour nettoyer les données
5. **Tester les cas d'erreur** : Tester les réponses d'erreur autant que les cas de succès

## Exemple complet

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('API - Recherche de Documents', () => {
  
  describe('GET /api/search/documents', () => {
    
    it('devrait retourner une erreur sans paramètre "nom"', async () => {
      const res = await request(app)
        .get('/api/search/documents');
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('devrait retourner les documents correspondant au nom', async () => {
      const res = await request(app)
        .get('/api/search/documents')
        .query({ nom: 'algorithme' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('nombre_resultats');
      expect(Array.isArray(res.body.data.documents)).toBe(true);
    });

    it('devrait appliquer les filtres de niveau et filière', async () => {
      const res = await request(app)
        .get('/api/search/documents')
        .query({ nom: 'cours', niveau: 'L2', filiere: 'INFO' });
      
      expect(res.status).toBe(200);
      res.body.data.documents.forEach(doc => {
        expect(doc.niveau).toBe('L2');
        expect(doc.filiere_code).toBe('INFO');
      });
    });

  });

});
```

## Debugging des tests

Pour déboguer un test spécifique, utiliser le flag `.only` :

```javascript
it.only('devrait faire ceci', async () => {
  // Ce test sera le seul exécuté
});
```

Ou lancer Jest avec le debugger Node :

```bash
node --inspect-brk ./node_modules/.bin/jest --runInBand tests/endpoints/documents.test.js
```

