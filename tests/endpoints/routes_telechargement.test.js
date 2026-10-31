// CE-19 — une seule route de téléchargement recommandée ; les anciennes sont dépréciées mais servies
const request = require('supertest');
const app = require('../../src/app');
const spec = require('../../src/docs/openapi');
const { Sujet, UE, Cours, CoursDocument } = require('../../src/models');

const BLOB = 'https://abc123.public.blob.vercel-storage.com/x';

describe('Routes de téléchargement', () => {
  let sujet; let cours; let doc; let token;
  beforeAll(async () => {
    const ue = await UE.findOne({ where: { code: 'INF101' } });
    sujet = await Sujet.create({ titre: 'S dépréciation', type_epreuve: 'td', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id, cheminFichier: `${BLOB}/s.pdf`, statut: 'publie' });
    cours = await Cours.findOne({ where: { statut: 'publie' } });
    doc = await CoursDocument.findOne({ where: { cours_id: cours.id } });
    const r = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    token = r.body.data.accessToken;
  });

  it('l\'ancienne route sujet est servie, marquée dépréciée, avec le successeur', async () => {
    const res = await request(app).get(`/api/v1/sujets/${sujet.id}/telecharger`).set('Authorization', `Bearer ${token}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`);
    expect(res.headers.link).toContain('rel="successor-version"');
  });

  it('l\'ancienne route de document de cours est servie et dépréciée', async () => {
    const res = await request(app).get(`/api/v1/cours/${cours.id}/documents/${doc.id}/telecharger`).redirects(0);
    expect([200, 302, 502]).toContain(res.status);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain(`type=cours&id=${cours.id}&document_id=${doc.id}`);
  });

  it('la route unique n\'est pas dépréciée et fonctionne sans authentification', async () => {
    const res = await request(app).get(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('le contrat OpenAPI marque les anciennes routes comme dépréciées', () => {
    expect(spec.paths['/sujets/{id}/telecharger'].get.deprecated).toBe(true);
    expect(spec.paths['/cours/{coursId}/documents/{documentId}/telecharger'].get.deprecated).toBe(true);
    expect(spec.paths['/search/documents/telecharger'].get.deprecated).toBeUndefined();
  });
});
