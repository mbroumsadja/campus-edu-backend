const request = require('supertest');
const app = require('../../src/app');

describe('Auth API', () => {
  let accessToken = null;
  let refreshToken = null;

  it('devrait se connecter avec succès en tant qu\'admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ matricule: 'ADM-0001', password: 'Admin@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.utilisateur.role).toBe('admin');

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('devrait retourner les informations du profil avec /auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('matricule', 'ADM-0001');
  });

  it('devrait renouveler le token avec /auth/refresh', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('devrait se déconnecter avec /auth/logout', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('devrait refuser une connexion avec un mauvais mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ matricule: 'ADM-0001', password: 'mauvaispassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('devrait refuser une connexion avec un matricule invalide', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ matricule: 'ZZZ', password: 'anything' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
