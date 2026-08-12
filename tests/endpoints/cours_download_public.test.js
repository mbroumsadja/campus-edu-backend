const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../src/app');
const { UE, Utilisateur, Cours, CoursDocument } = require('../../src/models');

let coursId, docId;

beforeAll(async () => {
  const ue = await UE.findOne({ where: { code: 'INF101' } });
  const ens = await Utilisateur.findOne({ where: { matricule: 'ENS-0001' } });

  const dir = path.resolve(__dirname, '../../uploads/test-public-dl');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'doc.pdf');
  fs.writeFileSync(filePath, 'dummy');

  const cours = await Cours.create({
    titre: 'Cours telechargement public', type: 'pdf', ue_id: ue.id, enseignant_id: ens.id,
    cheminFichier: filePath, nomFichierOriginal: 'doc.pdf', tailleFichier: 5,
    anneAcademique: '2025-2026', statut: 'publie',
  });
  const doc = await CoursDocument.create({ cours_id: cours.id, cheminFichier: filePath, nomFichierOriginal: 'doc.pdf', tailleFichier: 5 });
  coursId = cours.id; docId = doc.id;
});

describe('GET /api/cours/:coursId/documents/:documentId/telecharger — doit rester public', () => {
  test('fonctionne sans aucun token (utilisateur anonyme)', async () => {
    const res = await request(app).get(`/api/cours/${coursId}/documents/${docId}/telecharger`);
    expect(res.status).toBe(200);
  });

  test('fonctionne aussi avec un token valide (utilisateur connecte)', async () => {
    const login = await request(app).post('/api/auth/login').send({ matricule: '22FS0001', password: 'Student@1234' });
    const token = login.body?.data?.accessToken || login.body?.accessToken;
    const res = await request(app)
      .get(`/api/cours/${coursId}/documents/${docId}/telecharger`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
