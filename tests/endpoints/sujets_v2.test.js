// CE-10 (relations obligatoires) et CE-11 (modèle Sujet v2)
const request = require('supertest');
const app = require('../../src/app');
const { Sujet, UE, Ecole, Filiere } = require('../../src/models');

const BLOB = 'https://abc123.public.blob.vercel-storage.com/sujets';
const SHA_A = 'a'.repeat(64);

describe('Sujets v2', () => {
  let admin; let ue;

  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    admin = auth.body.data.accessToken;
    ue = await UE.findOne({ where: { code: 'INF101' } });
  });

  const post = (body) => request(app).post('/api/sujets').set('Authorization', `Bearer ${admin}`).send(body);

  it('nouveau contrat : type_epreuve + annee_academique, avec empreinte et taille', async () => {
    const res = await post({
      titre: 'Algo 2024', type_epreuve: 'terminal', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id,
      sujet: { url: `${BLOB}/algo-Xy12.pdf`, tailleFichier: 2048, sha256: SHA_A.toUpperCase(), mime: 'application/pdf', nomOrigine: 'algo.pdf' },
    });
    expect(res.status).toBe(201);
    const s = res.body.data;
    expect(s.type_epreuve).toBe('terminal');
    expect(s.type).toBe('terminal');            // ancien contrat dérivé
    expect(s.annee).toBe(2025);                 // ancien contrat dérivé
    expect(s.annee_academique).toBe('2024-2025');
    expect(s.sha256).toBe(SHA_A);               // normalisé en minuscules
    expect(Number(s.taille_octets)).toBe(2048);
    expect(s.nb_telechargements).toBe(0);
  });

  it('refuse un doublon (même SHA-256) avec 409', async () => {
    const res = await post({
      titre: 'Algo 2024 bis', type_epreuve: 'terminal', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id,
      sujet: { url: `${BLOB}/algo-autre.pdf`, sha256: SHA_A },
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/existe déjà/);
  });

  it('ancien contrat (type + annee) toujours accepté et complété', async () => {
    const res = await post({
      titre: 'Ancien format', type: 'rattrapage', session: 'rattrapage', annee: 2023, ue_id: ue.id,
      sujet: { url: `${BLOB}/ancien-1.pdf` },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.type_epreuve).toBe('terminal');
    expect(res.body.data.annee_academique).toBe('2022-2023');
  });

  it.each([
    ['annee_academique invalide', { annee_academique: '2024' }],
    ['type_epreuve invalide', { type_epreuve: 'rattrapage' }],
    ['sha256 invalide', { sujet: { url: `${BLOB}/x.pdf`, sha256: 'zz' } }],
    ['URL hors Blob', { sujet: { url: 'https://169.254.169.254/x.pdf' } }],
  ])('rejette : %s', async (_nom, patch) => {
    const res = await post({
      titre: 'KO', type_epreuve: 'tp', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id,
      sujet: { url: `${BLOB}/ok.pdf` }, ...patch,
    });
    expect(res.status).toBe(400);
  });

  it('exige type_epreuve ou type, et annee_academique ou annee', async () => {
    const res = await post({ titre: 'Vide', session: 'normale', ue_id: ue.id, sujet: { url: `${BLOB}/v.pdf` } });
    expect(res.status).toBe(400);
  });

  it('le téléchargement incrémente ancien et nouveau compteurs', async () => {
    const s = await Sujet.findOne({ where: { sha256: SHA_A } });
    await s.update({ statut: 'publie' });
    await request(app).get(`/api/sujets/${s.id}/telecharger`).set('Authorization', `Bearer ${admin}`);
    await s.reload();
    expect(s.nb_telechargements).toBe(1);
    expect(s.telechargemements).toBe(1);
  });
});

describe('Relations obligatoires (CE-10)', () => {
  let admin;
  beforeAll(async () => {
    const auth = await request(app).post('/api/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    admin = auth.body.data.accessToken;
  });

  it('refuse de supprimer une école qui possède des filières (409)', async () => {
    const ecole = await Ecole.findOne();
    const res = await request(app).delete(`/api/ecoles/${ecole.id}`).set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(409);
    expect(await Ecole.count()).toBeGreaterThan(0);
  });

  it('refuse de supprimer une UE qui possède des sujets (RESTRICT)', async () => {
    const ue = await UE.findOne({ where: { code: 'INF101' } });
    await expect(ue.destroy()).rejects.toMatchObject({ name: 'SequelizeForeignKeyConstraintError' });
  });

  it('ne permet pas de créer un sujet, un cours ou une UE sans parent', async () => {
    await expect(Sujet.create({ titre: 'x', type: 'tp', session: 'normale', annee: 2024, cheminFichier: 'y' }))
      .rejects.toBeDefined();
    await expect(UE.create({ code: 'ZZ1', intitule: 'x', niveau: 'L1', semestre: 'S1' })).rejects.toBeDefined();
    await expect(Filiere.create({ code: 'ZZ', nom: 'x' })).rejects.toBeDefined();
  });
});
