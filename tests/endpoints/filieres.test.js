const request = require('supertest');
const app = require('../../src/app');

describe('Filieres API', () => {
  let adminToken = null;
  let filiereId = null;
  let ueId = null;
  let ecoleId = null;

  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = auth.body.data.accessToken;

    const ecolesRes = await request(app)
      .get('/api/ecoles')
      .set('Authorization', `Bearer ${adminToken}`);

    ecoleId = ecolesRes.body.data[0].id;
  });

  it('devrait lister les filières actives', async () => {
    const res = await request(app)
      .get('/api/filieres')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('devrait créer une nouvelle filière avec ecole_id', async () => {
    const res = await request(app)
      .post('/api/filieres')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'MAT', nom: 'Mathématiques', departement: 'Sciences', ecole_id: ecoleId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('ecole_id', ecoleId);
    filiereId = res.body.data.id;
  });

  it('devrait ajouter une UE à la filière', async () => {
    const res = await request(app)
      .post(`/api/filieres/${filiereId}/ues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'MAT101', intitule: 'Algèbre', niveau: 'L1', semestre: 'S1', credits: 6 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    ueId = res.body.data.id;
  });

  it('devrait retourner la filière avec ses UEs', async () => {
    const res = await request(app)
      .get(`/api/filieres/${filiereId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('ues');
    expect(Array.isArray(res.body.data.ues)).toBe(true);
  });

  it('devrait lister les UEs de la filière', async () => {
    const res = await request(app)
      .get(`/api/filieres/${filiereId}/ues`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
