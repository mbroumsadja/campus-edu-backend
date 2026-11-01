// CE-18 — téléchargement par redirection 302 vers le CDN Blob
const request = require('supertest');
const app = require('../../src/app');
const { Sujet, UE } = require('../../src/models');

const BLOB = 'https://abc123.public.blob.vercel-storage.com/sujets';

describe('Téléchargement : 302 vers Blob', () => {
  let sujet; let fetchSpy;
  beforeAll(async () => {
    const ue = await UE.findOne({ where: { code: 'INF101' } });
    sujet = await Sujet.create({
      titre: 'Sujet CDN', type_epreuve: 'terminal', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id,
      cheminFichier: `${BLOB}/cdn-Ab12.pdf`, avecCorrige: false, statut: 'publie',
    });
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterAll(() => fetchSpy.mockRestore());

  it('répond 302 vers l\'URL Blob, sans relayer le fichier, et compte exactement un téléchargement', async () => {
    const avant = (await Sujet.findByPk(sujet.id)).nb_telechargements;
    const res = await request(app).get(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${BLOB}/cdn-Ab12.pdf?download=1`);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(fetchSpy).not.toHaveBeenCalled();                       // aucun octet ne transite par la fonction
    expect((await Sujet.findByPk(sujet.id)).nb_telechargements).toBe(avant + 1);
  });

  it('un sujet non publié reste inaccessible (404, pas de redirection)', async () => {
    await Sujet.update({ statut: 'en_attente' }, { where: { id: sujet.id } });
    const res = await request(app).get(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`).redirects(0);
    expect(res.status).toBe(404);
    await Sujet.update({ statut: 'publie' }, { where: { id: sujet.id } });
  });

  it('une URL hors Vercel Blob n\'est jamais suivie (anti-SSRF conservé)', async () => {
    await Sujet.update({ cheminFichier: 'https://evil.example.com/a.pdf' }, { where: { id: sujet.id }, validate: false });
    const res = await request(app).get(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`).redirects(0);
    expect(res.status).toBe(502);
    expect(res.headers.location).toBeUndefined();
    await Sujet.update({ cheminFichier: `${BLOB}/cdn-Ab12.pdf` }, { where: { id: sujet.id } });
  });

  it('DOWNLOAD_MODE=proxy rétablit le relais', async () => {
    process.env.DOWNLOAD_MODE = 'proxy';
    fetchSpy.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/pdf' }, body: require('stream').Readable.toWeb(require('stream').Readable.from([Buffer.from('%PDF')])) });
    const res = await request(app).get(`/api/v1/sujets/${sujet.id}/telecharger`).set('Authorization', `Bearer ${await token()}`).redirects(0);
    delete process.env.DOWNLOAD_MODE;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

async function token() {
  const r = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
  return r.body.data.accessToken;
}
