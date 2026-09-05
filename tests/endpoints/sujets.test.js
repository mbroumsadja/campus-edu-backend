const request = require('supertest');
const app = require('../../src/app');

describe('Sujets API', () => {
  let adminToken = null;
  let enseignantToken = null;
  let sujetId = null;
  const { Utilisateur, UE, Sujet } = require('../../src/models');

  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    adminToken = auth.body.data.accessToken;

    const authEns = await request(app).post('/api/auth/login').send({ matricule: 'ENS-0001', password: 'Ens@1234' });
    enseignantToken = authEns.body.data.accessToken;
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

  it('devrait permettre à l\'enseignant de modifier et supprimer son propre sujet', async () => {
    const enseignant = await Utilisateur.findOne({ where: { matricule: 'ENS-0001' } });
    const ue = await UE.findOne({ where: { code: 'INF101' } });

    const createdSujet = await Sujet.create({
      titre: 'Sujet perso enseignant',
      type: 'partiel',
      session: 'normale',
      annee: 2026,
      cheminFichier: '/tmp/sujet_enseignant.pdf',
      avecCorrige: false,
      statut: 'en_attente',
      ue_id: ue.id,
      enseignant_id: enseignant.id,
    });

    const updateRes = await request(app)
      .put(`/api/sujets/${createdSujet.id}`)
      .set('Authorization', `Bearer ${enseignantToken}`)
      .send({ titre: 'Sujet perso enseignant modifié', type: 'tp', session: 'rattrapage', annee: 2027 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data).toHaveProperty('titre', 'Sujet perso enseignant modifié');

    const deleteRes = await request(app)
      .delete(`/api/sujets/${createdSujet.id}`)
      .set('Authorization', `Bearer ${enseignantToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
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
