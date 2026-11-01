// CE-21 — statistiques agrégées par jour + recherches sans résultat
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.DOWNLOAD_RATE_LIMIT_MAX = '1000';
const request = require('supertest');
const app = require('../../src/app');
const { sequelize, Sujet, UE, Cours, CoursDocument, Telechargement, StatQuotidienne, RechercheVide } = require('../../src/models');
const { purgeRecherchesVides } = require('../../src/utils/retention');

describe('Statistiques quotidiennes', () => {
  let admin; let sujet; let cours; let doc;
  beforeAll(async () => {
    const ue = await UE.findOne({ where: { code: 'INF101' } });
    sujet = await Sujet.create({ titre: 'Sujet stats', type_epreuve: 'td', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id, cheminFichier: 'https://abc.public.blob.vercel-storage.com/st.pdf', statut: 'publie' });
    cours = await Cours.findOne({ where: { statut: 'publie' } });
    doc = await CoursDocument.findOne({ where: { cours_id: cours.id } });
    admin = (await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' })).body.data.accessToken;
  });
  beforeEach(async () => { await StatQuotidienne.destroy({ where: {} }); await RechercheVide.destroy({ where: {} }); });
  const dl = (url, token) => { const r = request(app).get(url).redirects(0); return token ? r.set('Authorization', `Bearer ${token}`) : r; };

  it('N téléchargements = UNE ligne par jour et par document, avec le bon total', async () => {
    for (let i = 0; i < 5; i += 1) await dl(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`);
    const rows = await StatQuotidienne.findAll({ where: { type: 'sujet', cible_id: sujet.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].telechargements).toBe(5);
  });

  it('les téléchargements simultanés ne perdent aucun comptage', async () => {
    await Promise.all(Array.from({ length: 10 }, () => dl(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`)));
    expect((await StatQuotidienne.findOne({ where: { type: 'sujet', cible_id: sujet.id } })).telechargements).toBe(10);
  });

  it('cours : un utilisateur connecté n\'a qu\'une ligne d\'historique, mais chaque téléchargement est compté', async () => {
    await Telechargement.destroy({ where: {} });
    for (let i = 0; i < 3; i += 1) await dl(`/api/v1/search/documents/telecharger?type=cours&id=${cours.id}&document_id=${doc.id}`, admin);
    expect(await Telechargement.count({ where: { cours_id: cours.id } })).toBe(1);
    expect((await StatQuotidienne.findOne({ where: { type: 'cours', cible_id: cours.id } })).telechargements).toBe(3);
  });

  it('recherche sans résultat : terme normalisé, compté par jour', async () => {
    for (let i = 0; i < 3; i += 1) await request(app).get('/api/v1/search/documents').query({ q: 'Thermodynamïque Quantique' });
    await request(app).get('/api/v1/search/documents').query({ q: 'xyzzy inexistant' });
    const rows = await RechercheVide.findAll({ order: [['nb', 'DESC']] });
    expect(rows[0]).toMatchObject({ terme: 'thermodynamique quantique', nb: 3 });
    expect(rows).toHaveLength(2);
  });

  it('une recherche avec résultats n\'est pas journalisée', async () => {
    const res = await request(app).get('/api/v1/search/documents').query({ q: 'Sujet stats' });
    expect(res.body.data.nombre_resultats).toBeGreaterThan(0);
    expect(await RechercheVide.count()).toBe(0);
  });

  it('tableau de bord admin : total, par jour, top documents, recherches sans résultat', async () => {
    for (let i = 0; i < 4; i += 1) await dl(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`);
    await request(app).get('/api/v1/search/documents').query({ q: 'introuvable total' });
    const res = await request(app).get('/api/v1/stats').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.total_telechargements).toBe(4);
    expect(d.par_jour).toHaveLength(1);
    expect(d.top_documents[0]).toMatchObject({ type: 'sujet', id: sujet.id, titre: 'Sujet stats', telechargements: 4 });
    expect(d.recherches_sans_resultat[0]).toMatchObject({ terme: 'introuvable total', nb: 1 });
  });

  it('réservé à l\'admin ; dates validées', async () => {
    expect((await request(app).get('/api/v1/stats')).status).toBe(401);
    expect((await request(app).get('/api/v1/stats?depuis=hier').set('Authorization', `Bearer ${admin}`)).status).toBe(400);
    expect((await request(app).get('/api/v1/stats?depuis=2024-01-01&jusqua=2026-01-01').set('Authorization', `Bearer ${admin}`)).status).toBe(400);
    expect((await request(app).get('/api/v1/stats?depuis=2026-02-01&jusqua=2026-01-01').set('Authorization', `Bearer ${admin}`)).status).toBe(400);
  });

  it('la base ne grossit pas avec le nombre de téléchargements', async () => {
    const avant = await StatQuotidienne.count();
    for (let i = 0; i < 20; i += 1) await dl(`/api/v1/search/documents/telecharger?type=sujet&id=${sujet.id}`);
    expect((await StatQuotidienne.count()) - avant).toBe(1);
  });

  it('purge des vieux termes de recherche', async () => {
    await sequelize.query("INSERT INTO recherches_vides (jour, terme, nb) VALUES ((now() AT TIME ZONE 'UTC')::date - 200, 'ancien', 2), ((now() AT TIME ZONE 'UTC')::date, 'recent', 1)");
    expect(await purgeRecherchesVides(sequelize)).toBe(1);
    expect((await RechercheVide.findAll()).map((r) => r.terme)).toEqual(['recent']);
  });
});
