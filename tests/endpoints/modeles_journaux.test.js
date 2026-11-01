const request = require('supertest');
const app = require('../../src/app');
const { sequelize, Utilisateur, AuditLog, Cours, CoursDocument } = require('../../src/models');
const { purgeIpAddresses } = require('../../src/utils/retention');

describe('CE-13 — modèles et journaux', () => {
  let token;
  beforeAll(async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    token = r.body.data.accessToken;
  });

  it('le scope par défaut exclut password et refreshToken', async () => {
    const u = await Utilisateur.findOne({ where: { matricule: 'ADM-0001' } });
    expect(u.password).toBeUndefined();
    expect(u.toJSON()).not.toHaveProperty('refreshToken');
    const full = await Utilisateur.scope('avecSecrets').findOne({ where: { matricule: 'ADM-0001' } });
    expect(full.password).toMatch(/^\$2[aby]\$/);
  });

  it('le login est journalisé avec created_at avant la réponse', async () => {
    const before = await AuditLog.count({ where: { action: 'LOGIN_SUCCESS' } });
    await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    const rows = await AuditLog.findAll({ where: { action: 'LOGIN_SUCCESS' }, order: [['id', 'DESC']], limit: 1 });
    expect(await AuditLog.count({ where: { action: 'LOGIN_SUCCESS' } })).toBe(before + 1);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it('un échec de login est journalisé immédiatement', async () => {
    const before = await AuditLog.count({ where: { action: 'LOGIN_FAILED' } });
    const res = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'mauvais' });
    expect(res.status).toBe(401);
    expect(await AuditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(before + 1);
  });

  it('refresh et changement de mot de passe fonctionnent avec le scope par défaut', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.data.refreshToken });
    expect(refresh.status).toBe(200);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${refresh.body.data.accessToken}`);
    expect(JSON.stringify(me.body)).not.toMatch(/\$2[aby]\$/);
  });

  it('le compteur de téléchargements de cours est incrémenté avant la réponse', async () => {
    const doc = await CoursDocument.findOne({ include: [{ model: Cours, as: 'cours', where: { statut: 'publie' }, required: true }] });
    if (!doc) return;
    const cours = await Cours.findByPk(doc.cours_id);
    const avant = (await Cours.findByPk(cours.id)).telechargemements;
    await request(app).get(`/api/v1/cours/${cours.id}/documents/${doc.id}/telecharger`).set('Authorization', `Bearer ${token}`);
    expect((await Cours.findByPk(cours.id)).telechargemements).toBe(avant + 1);
  });

  it('purge : IP effacées après 30 jours, récentes conservées', async () => {
    const vieux = await AuditLog.create({ action: 'TEST_RETENTION', ipAddress: '1.2.3.4', userAgent: 'ua' });
    const recent = await AuditLog.create({ action: 'TEST_RETENTION', ipAddress: '5.6.7.8', userAgent: 'ua' });
    await sequelize.query("UPDATE audit_logs SET created_at = NOW() - interval '31 days' WHERE id = :id", { replacements: { id: vieux.id } });
    const r = await purgeIpAddresses(sequelize);
    expect(r.audit_logs).toBeGreaterThanOrEqual(1);
    expect((await AuditLog.findByPk(vieux.id)).ipAddress).toBeNull();
    expect((await AuditLog.findByPk(vieux.id)).action).toBe('TEST_RETENTION');
    expect((await AuditLog.findByPk(recent.id)).ipAddress).toBe('5.6.7.8');
  });
});
