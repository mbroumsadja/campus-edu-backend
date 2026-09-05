const request = require('supertest');
const app = require('../../src/app');

describe('Cours API', () => {
  let adminToken = null;
  let enseignantToken = null;
  let coursId = null;
  const { Utilisateur, UE, Cours } = require('../../src/models');

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

  it('devrait permettre à l\'enseignant de modifier et supprimer son propre cours', async () => {
    const enseignant = await Utilisateur.findOne({ where: { matricule: 'ENS-0001' } });
    const ue = await UE.findOne({ where: { code: 'INF101' } });

    const createdCourse = await Cours.create({
      titre: 'Cours perso enseignant',
      description: 'À modifier puis supprimer',
      type: 'pdf',
      cheminFichier: '/tmp/cours_enseignant.pdf',
      nomFichierOriginal: 'cours_enseignant.pdf',
      tailleFichier: 2048,
      statut: 'en_attente',
      anneAcademique: '2026-2027',
      ue_id: ue.id,
      enseignant_id: enseignant.id,
    });

    const updateRes = await request(app)
      .put(`/api/cours/${createdCourse.id}`)
      .set('Authorization', `Bearer ${enseignantToken}`)
      .send({ titre: 'Cours perso enseignant modifié', description: 'Description mise à jour', type: 'slide' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data).toHaveProperty('titre', 'Cours perso enseignant modifié');

    const deleteRes = await request(app)
      .delete(`/api/cours/${createdCourse.id}`)
      .set('Authorization', `Bearer ${enseignantToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
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
