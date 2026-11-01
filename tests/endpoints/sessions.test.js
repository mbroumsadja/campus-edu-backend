// CE-12 — sessions multi-appareils
process.env.LOGIN_RATE_LIMIT_MAX = '1000'; // ce fichier enchaîne de nombreuses connexions
const request = require('supertest');
const app = require('../../src/app');
const { Session, Utilisateur, sequelize } = require('../../src/models');
const { hashToken } = require('../../src/modules/auth/sessions');

const login = (appareil) => request(app).post('/api/v1/auth/login')
  .send({ matricule: 'ADM-0001', password: 'Admin@1234', ...(appareil ? { appareil } : {}) });
const me = (t) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`);
const refresh = (rt) => request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });

describe('Sessions multi-appareils', () => {
  beforeEach(async () => { await Session.destroy({ where: {} }); });

  it('deux appareils connectés en même temps sans se déconnecter mutuellement', async () => {
    const web = (await login('Chrome web')).body.data;
    const mobile = (await login('Android')).body.data;
    expect((await me(web.accessToken)).status).toBe(200);
    expect((await me(mobile.accessToken)).status).toBe(200);
    expect((await refresh(web.refreshToken)).status).toBe(200);
    expect((await refresh(mobile.refreshToken)).status).toBe(200);
  });

  it('un access token reste valable après la rotation du refresh token de son appareil', async () => {
    const a = (await login()).body.data;
    await refresh(a.refreshToken);
    expect((await me(a.accessToken)).status).toBe(200);
    expect((await request(app).delete('/api/v1/auth/sessions/pas-un-uuid').set('Authorization', `Bearer ${a.accessToken}`)).status).toBe(400);
  });

  it('aucun refresh token en clair en base : seulement son empreinte', async () => {
    const { refreshToken } = (await login()).body.data;
    const rows = await Session.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(refreshToken));
    expect(JSON.stringify(rows[0].toJSON())).not.toContain(refreshToken);
    const [[u]] = await sequelize.query("SELECT refresh_token FROM utilisateurs WHERE matricule = 'ADM-0001'");
    expect(u.refresh_token).toBeNull();
  });

  it('rotation : l\'ancien refresh token ne marche plus (après la période de grâce, famille révoquée)', async () => {
    const a = (await login()).body.data;
    const b = (await refresh(a.refreshToken)).body.data;
    expect(b.refreshToken).not.toBe(a.refreshToken);
    // rejeu immédiat : refusé (période de grâce) sans révoquer la famille
    expect((await refresh(a.refreshToken)).status).toBe(401);
    expect((await refresh(b.refreshToken)).status).toBe(200);
    // rejeu tardif : vol présumé, toute la famille est révoquée
    await Session.update({ revoked_at: new Date(Date.now() - 60000) }, { where: { token_hash: hashToken(a.refreshToken) } });
    const c = (await login()).body.data;
    const d = (await refresh(c.refreshToken)).body.data;
    await Session.update({ revoked_at: new Date(Date.now() - 60000) }, { where: { token_hash: hashToken(c.refreshToken) } });
    expect((await refresh(c.refreshToken)).status).toBe(401);
    expect((await refresh(d.refreshToken)).status).toBe(401);   // la famille entière est tombée
    expect((await me(d.accessToken)).status).toBe(401);
  });

  it('déconnexion par appareil : seul l\'appareil visé est coupé', async () => {
    const web = (await login('Chrome')).body.data;
    const mobile = (await login('Android')).body.data;
    const out = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${web.accessToken}`).send({});
    expect(out.status).toBe(200);
    expect((await me(web.accessToken)).status).toBe(401);
    expect((await refresh(web.refreshToken)).status).toBe(401);
    expect((await me(mobile.accessToken)).status).toBe(200);
    expect((await refresh(mobile.refreshToken)).status).toBe(200);
  });

  it('logout { tous: true } coupe tous les appareils', async () => {
    const a = (await login()).body.data; const b = (await login()).body.data;
    await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${a.accessToken}`).send({ tous: true });
    expect((await me(b.accessToken)).status).toBe(401);
  });

  it('liste les appareils et permet d\'en révoquer un', async () => {
    const web = (await login('Chrome web')).body.data;
    await login('Android');
    const list = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${web.accessToken}`);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s) => s.courante)).toHaveLength(1);
    expect(list.body.data.map((s) => s.appareil).sort()).toEqual(['Android', 'Chrome web']);
    const autre = list.body.data.find((s) => !s.courante);
    const del = await request(app).delete(`/api/v1/auth/sessions/${autre.id}`).set('Authorization', `Bearer ${web.accessToken}`);
    expect(del.status).toBe(200);
    const apres = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${web.accessToken}`);
    expect(apres.body.data).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/auth/sessions/${autre.id}`).set('Authorization', `Bearer ${web.accessToken}`)).status).toBe(404);
  });

  it('on ne peut pas révoquer la session d\'un autre utilisateur', async () => {
    const admin = (await login()).body.data;
    const autre = await Utilisateur.findOne({ where: { role: 'etudiant' } });
    const s = await Session.create({ utilisateur_id: autre.id, famille_id: '11111111-1111-4111-8111-111111111111', token_hash: 'a'.repeat(64), expires_at: new Date(Date.now() + 1e6) });
    const del = await request(app).delete(`/api/v1/auth/sessions/${s.famille_id}`).set('Authorization', `Bearer ${admin.accessToken}`);
    expect(del.status).toBe(404);
    expect((await Session.findByPk(s.id)).revoked_at).toBeNull();
  });

  it('limite le nombre d\'appareils actifs (les plus anciens sont révoqués)', async () => {
    process.env.MAX_SESSIONS_PER_USER = '2';
    try {
      const un = (await login('1')).body.data;
      await new Promise((r) => setTimeout(r, 20));
      await login('2'); await new Promise((r) => setTimeout(r, 20));
      await login('3');
      expect(await Session.count({ where: { revoked_at: null } })).toBe(2);
      expect((await me(un.accessToken)).status).toBe(401);
    } finally { delete process.env.MAX_SESSIONS_PER_USER; }
  });

  it('un refresh token expiré en base est refusé', async () => {
    const a = (await login()).body.data;
    await Session.update({ expires_at: new Date(Date.now() - 1000) }, { where: {} });
    expect((await refresh(a.refreshToken)).status).toBe(401);
  });

  it('suspendre un compte coupe toutes ses sessions', async () => {
    const admin = (await login()).body.data;
    const etu = await Utilisateur.findOne({ where: { role: 'etudiant' } });
    const s = await Session.create({ utilisateur_id: etu.id, famille_id: '22222222-2222-4222-8222-222222222222', token_hash: 'b'.repeat(64), expires_at: new Date(Date.now() + 1e6) });
    const res = await request(app).patch(`/api/v1/users/${etu.id}/statut`).set('Authorization', `Bearer ${admin.accessToken}`).send({ statut: 'suspendu' });
    expect(res.status).toBe(200);
    expect((await Session.findByPk(s.id)).motif_revocation).toBe('suspension');
    await etu.update({ statut: 'actif' });
  });

  it('changer le mot de passe déconnecte les autres appareils mais pas l\'appareil courant', async () => {
    const a = (await login()).body.data; const b = (await login()).body.data;
    const res = await request(app).put('/api/v1/auth/change-password').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ ancienPassword: 'Admin@1234', nouveauPassword: 'Admin@1234' });
    expect(res.status).toBe(200);
    expect((await me(a.accessToken)).status).toBe(200);
    expect((await me(b.accessToken)).status).toBe(401);
  });
});
