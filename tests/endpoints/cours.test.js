const request = require('supertest');
const app = require('../../src/app');

describe('Cours API', () => {
  let adminToken = null;
  let enseignantToken = null;
  let coursId = null;

  beforeAll(async () => {
    const authAdmin = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = authAdmin.body.data.accessToken;

    const authEns = await request(app).post('/api/auth/login').send({ matricule: 'ENS-0001', password: 'Ens@1234' });
    enseignantToken = authEns.body.data.accessToken;
  });

  it('devrait lister les cours publiés', async () => {
    const res = await request(app)
      .get('/api/cours')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('devrait récupérer un cours existant', async () => {
    const coursList = await request(app)
      .get('/api/cours')
      .set('Authorization', `Bearer ${adminToken}`);

    const course = coursList.body.data[0];
    expect(course).toBeDefined();
    coursId = course.id;

    const res = await request(app)
      .get(`/api/cours/${coursId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id', coursId);
  });

  it('devrait changer le statut d\'un cours', async () => {
    const res = await request(app)
      .patch(`/api/cours/${coursId}/statut`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statut: 'archive' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('statut', 'archive');
  });

  it('devrait supprimer un cours', async () => {
    const res = await request(app)
      .delete(`/api/cours/${coursId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
