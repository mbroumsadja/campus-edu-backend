const request = require('supertest');
const app = require('../../src/app');

describe('Users API', () => {
  let adminToken = null;
  let createdUserId = null;

  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = auth.body.data.accessToken;
  });

  it('devrait lister les utilisateurs pour un admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('devrait créer un nouvel utilisateur', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        matricule: '22FS9999',
        nom: 'Test',
        prenom: 'Utilisateur',
        email: 'test.user@uniportal.cm',
        role: 'etudiant',
        niveau: 'L1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.matricule).toBe('22FS9999');
    createdUserId = res.body.data.id;
  });

  it('devrait récupérer un utilisateur par id', async () => {
    const res = await request(app)
      .get(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('matricule', '22FS9999');
  });

  it('devrait modifier le statut d\'un utilisateur', async () => {
    const res = await request(app)
      .patch(`/api/users/${createdUserId}/statut`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statut: 'suspendu' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('statut', 'suspendu');
  });

  it('devrait supprimer un utilisateur', async () => {
    const res = await request(app)
      .delete(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
