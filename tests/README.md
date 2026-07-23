# Tests - Campus Edu Backend

Ce dossier contient tous les tests automatisés du backend Campus-Edu.

## Structure

```
tests/
├── endpoints/               # Tests des endpoints API
│   ├── documents.test.js    # 🔍 Recherche de documents
│   ├── README.md            # Guide des tests
│   └── ...
├── setup.js                 # Configuration globale Jest
└── README.md
```

## Démarrer les tests

### Installation des dépendances
```bash
npm install
```

### Exécuter tous les tests
```bash
npm test
```

### Mode watch (auto-refresh pendant le développement)
```bash
npm run test:watch
```

### Rapport de couverture
```bash
npm run test:coverage
```

## Types de tests

### Tests d'Endpoints API
Chaque module a son fichier de test correspondant :
- `documents.test.js` - Recherche de documents (GET /api/search/documents)

## Guidelines pour les tests

1. **Structure** : Utiliser `describe()` pour grouper les tests
2. **Nommage** : Les noms doivent décrire ce qui est testé
3. **Assertion** : Une responsabilité par test
4. **Isolation** : Les tests ne doivent pas dépendre l'un de l'autre

## Exemple minimal

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/search/documents', () => {
  
  it('devrait retourner les documents filtrés', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'algorithme' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

});
```

## Configuration Jest

- **Environnement** : Node.js
- **Timeout** : 30 secondes
- **Fichier de config** : `jest.config.js`
- **Fichier de setup** : `tests/setup.js`

## Ajouter des nouveaux tests

1. Créer un fichier `tests/endpoints/[module].test.js`
2. Importer `app` depuis `src/app.js`
3. Utiliser `supertest` pour tester les requêtes HTTP
4. Exécuter `npm test` pour valider

## Ressources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Guide](https://github.com/visionmedia/supertest)
- [Documentation API Complète](../SEARCH_DOCUMENTS_API.md)
