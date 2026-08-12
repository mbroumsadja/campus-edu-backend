const request = require('supertest');
const app = require('../../src/app');

const login = async (matricule, password) => {
  const res = await request(app).post('/api/auth/login').send({ matricule, password });
  return res.body?.data?.accessToken || res.body?.accessToken;
};

describe('POST /api/upload/client-token', () => {
  test('refuse sans authentification', async () => {
    const res = await request(app).post('/api/upload/client-token').send({});
    expect(res.status).toBe(401);
  });

  test('refuse pour un role etudiant', async () => {
    const token = await login('22FS0001', 'Student@1234');
    const res = await request(app)
      .post('/api/upload/client-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'blob.generate-client-token', payload: { pathname: 'test.pdf' } });
    expect(res.status).toBe(403);
  });

  test('admin authentifie atteint le controleur (echec propre sans BLOB_READ_WRITE_TOKEN en test)', async () => {
    const token = await login('ADM-0001', 'Admin@1234');
    const res = await request(app)
      .post('/api/upload/client-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'blob.generate-client-token', payload: { pathname: 'test.pdf' } });

    // Pas de BLOB_READ_WRITE_TOKEN en environnement de test : handleUpload
    // doit echouer proprement en 400 (jamais 500, jamais planter le
    // process), et surtout on doit avoir passe l'authentification/le
    // controle de role avant d'atteindre ce point.
    expect(res.status).toBe(400);
  });
});
