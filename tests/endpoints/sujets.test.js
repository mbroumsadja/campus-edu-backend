const request = require('supertest');
const app = require('../../src/app');

describe('Sujets API', () => {
  let adminToken = null;
  let sujetId = null;

  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = auth.body.data.accessToken;
  });

  it('devrait lister les sujets publiés', async () => {
    const res = await request(app)
      .get('/api/sujets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('devrait récupérer un sujet existant', async () => {
    const sujets = await request(app)
      .get('/api/sujets')
      .set('Authorization', `Bearer ${adminToken}`);

    const sujet = sujets.body.data[0];
    expect(sujet).toBeDefined();
    sujetId = sujet.id;

    const res = await request(app)
      .get(`/api/sujets/${sujetId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id', sujetId);
  });

  it('devrait changer le statut d\'un sujet', async () => {
    const res = await request(app)
      .patch(`/api/sujets/${sujetId}/statut`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statut: 'archive' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('statut', 'archive');
  });
});
