const request = require('supertest');
const app = require('../../src/app');

describe('CE-17 — cache HTTP de la navigation', () => {
  let adminToken;
  beforeAll(async () => {
    const auth = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = auth.body.data.accessToken;
  });

  const routes = ['/api/v1/ecoles', '/api/v1/filieres'];

  it.each(routes)('%s : Cache-Control public + s-maxage, sans no-store', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['cache-control']).toMatch(/s-maxage=\d+/);
    expect(res.headers['cache-control']).not.toMatch(/no-store/);
    expect(res.headers.pragma).toBeUndefined();
    expect(res.headers.expires).toBeUndefined();
    expect(res.headers.etag).toBeTruthy();
  });

  it('If-None-Match renvoie 304 sans corps', async () => {
    const first = await request(app).get('/api/v1/ecoles');
    const second = await request(app).get('/api/v1/ecoles').set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
    expect(second.text || '').toBe('');
  });

  it('détail école et UE d\'une filière sont aussi mis en cache', async () => {
    const ecoles = await request(app).get('/api/v1/ecoles');
    const detail = await request(app).get(`/api/v1/ecoles/${ecoles.body.data[0].id}`);
    expect(detail.headers['cache-control']).toMatch(/s-maxage/);
    const filieres = await request(app).get('/api/v1/filieres');
    if (filieres.body.data.length) {
      const ues = await request(app).get(`/api/v1/filieres/${filieres.body.data[0].id}/ues`);
      expect(ues.headers['cache-control']).toMatch(/s-maxage/);
    }
  });

  it('l\'ETag change après une modification', async () => {
    const before = await request(app).get('/api/v1/ecoles');
    const created = await request(app).post('/api/v1/ecoles').set('Authorization', `Bearer ${adminToken}`).send({ ecole: 'École cache test' });
    expect(created.status).toBe(201);
    const after = await request(app).get('/api/v1/ecoles').set('If-None-Match', before.headers.etag);
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
  });

  it('les erreurs 404 ne sont jamais mises en cache publiquement', async () => {
    const res = await request(app).get('/api/v1/ecoles/99999999');
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('les autres routes gardent no-store', async () => {
    const res = await request(app).get('/api/v1/sujets').set('Authorization', `Bearer ${adminToken}`);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});
