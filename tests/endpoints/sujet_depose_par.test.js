// CE-11 — depose_par
const request = require('supertest');
const app = require('../../src/app');
const { Sujet, UE, Utilisateur } = require('../../src/models');

describe('Sujet.depose_par', () => {
  it('est renseigné avec l\'utilisateur qui dépose', async () => {
    const auth = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    const ue = await UE.findOne({ where: { code: 'INF101' } });
    const res = await request(app).post('/api/v1/sujets').set('Authorization', `Bearer ${auth.body.data.accessToken}`).send({
      titre: 'Dépôt tracé', type_epreuve: 'td', session: 'normale', annee_academique: '2023-2024', ue_id: ue.id,
      sujet: { url: 'https://abc123.public.blob.vercel-storage.com/s/trace.pdf', sha256: 'd'.repeat(64) },
    });
    expect(res.status).toBe(201);
    const admin = await Utilisateur.findOne({ where: { matricule: 'ADM-0001' } });
    expect(res.body.data.depose_par).toBe(admin.id);
    const s = await Sujet.findByPk(res.body.data.id, { include: [{ association: 'deposant', attributes: ['id', 'matricule'] }] });
    expect(s.deposant.matricule).toBe('ADM-0001');
  });
});
