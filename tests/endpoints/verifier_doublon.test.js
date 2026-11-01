const request = require('supertest');
const app = require('../../src/app');
const { UE, CoursDocument } = require('../../src/models');

const BLOB = 'https://abc123.public.blob.vercel-storage.com/x';
const SHA_S = 'e'.repeat(64);
const SHA_C = 'f'.repeat(64);
const SHA_NEUF = '1'.repeat(64);

describe('Vérification de doublons avant upload', () => {
  let admin; let ue;
  beforeAll(async () => {
    const a = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    admin = a.body.data.accessToken;
    ue = await UE.findOne({ where: { code: 'INF101' } });
  });
  const auth = (r) => r.set('Authorization', `Bearer ${admin}`);
  const verifier = (body) => auth(request(app).post('/api/v1/upload/verifier-doublon')).send(body);

  it('exige une authentification', async () => {
    expect((await request(app).post('/api/v1/upload/verifier-doublon').send({ sha256: SHA_NEUF })).status).toBe(401);
  });

  it('empreinte inconnue : existe=false', async () => {
    const res = await verifier({ sha256: SHA_NEUF });
    expect(res.status).toBe(200);
    expect(res.body.data.existe).toBe(false);
    expect(res.body.data.resultats[0].correspondances).toEqual([]);
  });

  it('détecte un sujet, un corrigé et un document de cours existants', async () => {
    const s = await auth(request(app).post('/api/v1/sujets')).send({
      titre: 'Sujet doublon', type_epreuve: 'td', session: 'normale', annee_academique: '2022-2023', ue_id: ue.id,
      sujet: { url: `${BLOB}/s.pdf`, sha256: SHA_S }, corrige: { url: `${BLOB}/c.pdf`, sha256: SHA_C },
    });
    expect(s.status).toBe(201);
    const res = await verifier({ sha256s: [SHA_S.toUpperCase(), SHA_C, SHA_NEUF] });
    const [a, b, c] = res.body.data.resultats;
    expect(res.body.data.existe).toBe(true);
    expect(a.correspondances[0]).toMatchObject({ type: 'sujet', id: s.body.data.id });
    expect(b.correspondances[0]).toMatchObject({ type: 'sujet_corrige', id: s.body.data.id });
    expect(c.existe).toBe(false);
  });

  it('un cours déposé avec empreinte est détecté, puis un second dépôt identique est refusé (409)', async () => {
    const sha = '2'.repeat(64);
    const dep = () => auth(request(app).post('/api/v1/cours')).send({
      titre: 'Cours doublon', ue_id: ue.id, fichiers: [{ url: `${BLOB}/cours.pdf`, nomFichierOriginal: 'cours.pdf', sha256: sha }],
    });
    const first = await dep();
    expect(first.status).toBe(201);
    expect((await CoursDocument.findOne({ where: { sha256: sha } })).cours_id).toBe(first.body.data.id);
    const res = await verifier({ sha256: sha });
    expect(res.body.data.resultats[0].correspondances[0]).toMatchObject({ type: 'cours', id: first.body.data.id });
    const second = await dep();
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/existe déjà/);
  });

  it('valide les entrées', async () => {
    expect((await verifier({})).status).toBe(400);
    expect((await verifier({ sha256: 'abc' })).status).toBe(400);
    expect((await verifier({ sha256s: [] })).status).toBe(400);
    expect((await verifier({ sha256s: Array(21).fill(SHA_NEUF) })).status).toBe(400);
  });
});
