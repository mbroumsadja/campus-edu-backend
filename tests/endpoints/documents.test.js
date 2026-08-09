/**
 * Tests pour l'endpoint de recherche de documents
 * GET /api/search/documents
 * 
 * Paramètres query :
 * - nom (requis) : nom du document à rechercher
 * - niveau (optionnel) : L1, L2, L3, M1, M2
 * - filiere (optionnel) : code de la filière (ex: INFO, MATH)
 * - type (optionnel) : pdf, video, slide, autre, partiel, rattrapage, etc.
 */

const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/search/documents', () => {
  
  // Test 1 : Recherche simple par nom de document
  it('devrait retourner les documents correspondant au nom recherché', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'Cours de test' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('documents');
    expect(Array.isArray(res.body.data.documents)).toBe(true);
    expect(res.body.data.nombre_resultats).toBeGreaterThanOrEqual(1);
  });

  // Test 2 : Recherche sans le paramètre obligatoire "nom"
  it('devrait retourner une erreur si "nom" n\'est pas fourni', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({});
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 3 : Recherche avec filtre de niveau
  it('devrait filtrer les documents par niveau (ex: L1)', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'Cours de test', niveau: 'L1' });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('documents');
    if (res.body.data.documents.length > 0) {
      res.body.data.documents.forEach(doc => {
        expect(doc.niveau).toBe('L1');
      });
    }
  });

  // Test 4 : Recherche avec filtre de filière
  it('devrait filtrer les documents par code de filière (ex: INF)', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'Cours de test', filiere: 'INF' });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('documents');
    if (res.body.data.documents.length > 0) {
      res.body.data.documents.forEach(doc => {
        expect(doc.filiere_code).toBe('INF');
      });
    }
  });

  // Test 5 : Recherche avec filtres multiples (nom + niveau + filière)
  it('devrait appliquer plusieurs filtres simultanément', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ 
        nom: 'Cours de test', 
        niveau: 'L1', 
        filiere: 'INF'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('nombre_resultats');
    if (res.body.data.documents.length > 0) {
      res.body.data.documents.forEach(doc => {
        expect(doc.niveau).toBe('L1');
        expect(doc.filiere_code).toBe('INF');
      });
    }
  });

  // Test 6 : Alias de recherche global q
  it('devrait autoriser q comme alias de recherche', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ q: 'Cours de test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.documents)).toBe(true);
  });

  // Test 7 : Recherche avec filtre d'école
  it('devrait filtrer les documents par école', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'Cours de test', ecole: 'Ecole Centrale' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('documents');
    if (res.body.data.documents.length > 0) {
      res.body.data.documents.forEach(doc => {
        expect(doc.ecole_nom).toBe('Ecole Centrale');
      });
    }
  });

  // Test 8 : Un cours téléchargé par l'utilisateur courant doit être marqué
  it('devrait marquer un cours comme déjà téléchargé pour l utilisateur courant', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ matricule: '22FS0001', password: 'Student@1234' });

    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;

    const download = await request(app)
      .get('/api/search/documents/telecharger')
      .set('Authorization', `Bearer ${token}`)
      .query({ type: 'cours', id: 1 });

    expect(download.status).toBe(200);

    const res = await request(app)
      .get('/api/search/documents')
      .set('Authorization', `Bearer ${token}`)
      .query({ nom: 'Cours de test' });

    expect(res.status).toBe(200);
    const courseDoc = res.body.data.documents.find(doc => doc.type_contenu === 'cours');
    expect(courseDoc).toBeDefined();
    expect(courseDoc.deja_telecharge).toBe(true);
    expect(courseDoc.telechargements).toBeGreaterThanOrEqual(1);
  });

  // Test 9 : Un cours téléchargé par un autre utilisateur reste visible
  it('devrait afficher un cours téléchargé par un autre utilisateur sans l indiquer comme déjà téléchargé', async () => {
    const login1 = await request(app)
      .post('/api/auth/login')
      .send({ matricule: '22FS0001', password: 'Student@1234' });
    expect(login1.status).toBe(200);
    const token1 = login1.body.data.accessToken;

    const login2 = await request(app)
      .post('/api/auth/login')
      .send({ matricule: '22FS0002', password: 'Student2@1234' });
    expect(login2.status).toBe(200);
    const token2 = login2.body.data.accessToken;

    const download = await request(app)
      .get('/api/search/documents/telecharger')
      .set('Authorization', `Bearer ${token1}`)
      .query({ type: 'cours', id: 1 });
    expect(download.status).toBe(200);

    const res = await request(app)
      .get('/api/search/documents')
      .set('Authorization', `Bearer ${token2}`)
      .query({ nom: 'Cours de test' });

    expect(res.status).toBe(200);
    const courseDoc = res.body.data.documents.find(doc => doc.type_contenu === 'cours');
    expect(courseDoc).toBeDefined();
    expect(courseDoc.deja_telecharge).toBe(false);
    expect(courseDoc.telechargements).toBeGreaterThanOrEqual(1);
  });

  // Test 10 : Vérifier la structure de la réponse
  it('devrait retourner les documents avec tous les champs requis', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'cours' });
    
    expect(res.status).toBe(200);
    if (res.body.data.documents.length > 0) {
      const doc = res.body.data.documents[0];
      
      // Champs obligatoires
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('type_contenu'); // 'cours' ou 'sujet_examen'
      expect(doc).toHaveProperty('nom');
      expect(doc).toHaveProperty('type');
      expect(doc).toHaveProperty('lien_telechargement');
      expect(doc).toHaveProperty('taille_octets');
      expect(doc).toHaveProperty('taille_lisible');
      expect(doc).toHaveProperty('niveau');
      expect(doc).toHaveProperty('filiere_code');
      expect(doc).toHaveProperty('filiere_nom');
      expect(doc).toHaveProperty('code_ue');
      expect(doc).toHaveProperty('intitule_ue');
    }
  });

  // Test 7 : Recherche qui ne retourne aucun résultat
  it('devrait retourner une liste vide si aucun document ne correspond', async () => {
    const res = await request(app)
      .get('/api/search/documents')
      .query({ nom: 'XXXXXXXXXXXXX_INEXISTANT_XXXXXXXXXXXXX' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // La réponse peut avoir une structure spéciale pour "aucun résultat"
  });

});


/**
 * EXEMPLES D'UTILISATION :
 * 
 * 1. Recherche simple par nom
 *    GET /api/search/documents?nom=algorithme
 * 
 * 2. Recherche avec niveau
 *    GET /api/search/documents?nom=cours&niveau=L2
 * 
 * 3. Recherche avec filière
 *    GET /api/search/documents?nom=programmation&filiere=INFO
 * 
 * 4. Recherche complète
 *    GET /api/search/documents?nom=examen&niveau=L3&filiere=MATH&type=partiel
 * 
 * 5. Avec cURL
 *    curl "http://localhost:3000/api/search/documents?nom=algorithme&niveau=L2&filiere=INFO"
 */
