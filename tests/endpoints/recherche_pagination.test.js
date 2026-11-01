// CE-16 : pagination, sujets avant cours, tri par année académique décroissante, champs exposés
const request = require('supertest');
const app = require('../../src/app');
const { Cours, CoursDocument, Sujet, UE, Utilisateur } = require('../../src/models');

describe('Recherche : pagination et tri', () => {
  const TAG = 'pagtest';
  let ue; let ens;

  beforeAll(async () => {
    ue = await UE.findOne({ where: { code: 'INF101' } });
    ens = await Utilisateur.findOne({ where: { matricule: 'ENS-0001' } });

    const years = ['2021-2022', '2024-2025', '2022-2023', '2023-2024'];
    for (let i = 0; i < 28; i++) {
      const ya = years[i % years.length];
      await Sujet.create({
        titre: `${TAG} sujet ${i}`, type_epreuve: 'terminal', session: i % 2 ? 'rattrapage' : 'normale',
        annee_academique: ya, ue_id: ue.id, enseignant_id: ens.id, statut: 'publie', cheminFichier: 'x',
        avecCorrige: i % 3 === 0, taille_octets: 1048576, sha256: i.toString(16).padStart(64, '0'),
      });
    }
    for (let i = 0; i < 5; i++) {
      const c = await Cours.create({
        titre: `${TAG} cours ${i}`, type: 'pdf', ue_id: ue.id, enseignant_id: ens.id, statut: 'publie',
        cheminFichier: 'x', anneAcademique: '2025-2026',
      });
      await CoursDocument.create({ cours_id: c.id, cheminFichier: 'x', nomFichierOriginal: `c${i}.pdf`, tailleFichier: 10 });
    }
  });

  const search = (query) => request(app).get('/api/v1/search/documents').query({ q: TAG, ...query });

  it('20 résultats par défaut, avec les infos de pagination', async () => {
    const res = await search();
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.documents).toHaveLength(20);
    expect(d.nombre_resultats).toBe(33);
    expect(d.pagination).toEqual({ total: 33, page: 1, limit: 20, totalPages: 2, hasNext: true, hasPrev: false });
  });

  it('page 2 : le reste, sans doublon avec la page 1', async () => {
    const p1 = (await search({ page: 1 })).body.data.documents;
    const r2 = await search({ page: 2 });
    const p2 = r2.body.data.documents;
    expect(p2).toHaveLength(13);
    expect(r2.body.data.pagination).toMatchObject({ page: 2, hasNext: false, hasPrev: true });
    const key = (d) => `${d.type_contenu}:${d.id}`;
    const ids = new Set(p1.map(key));
    expect(p2.some((d) => ids.has(key(d)))).toBe(false);
  });

  it('limit est plafonné à 50 ; valeurs invalides ramenées aux défauts', async () => {
    expect((await search({ limit: 500 })).body.data.pagination.limit).toBe(50);
    expect((await search({ limit: 0 })).body.data.pagination.limit).toBe(20);
    const bad = (await search({ page: 'abc', limit: 'xyz' })).body.data.pagination;
    expect(bad).toMatchObject({ page: 1, limit: 20 });
  });

  it('page au-delà de la fin : liste vide, pas d\'erreur', async () => {
    const res = await search({ page: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data.documents).toEqual([]);
    expect(res.body.data.nombre_resultats).toBe(33);
  });

  it('les sujets passent avant les cours, sur toutes les pages', async () => {
    const all = [...(await search({ limit: 50 })).body.data.documents];
    const types = all.map((d) => d.type_contenu);
    expect(types.slice(0, 28).every((t) => t === 'sujet_examen')).toBe(true);
    expect(types.slice(28).every((t) => t === 'cours')).toBe(true);
  });

  it('tri par année académique décroissante parmi les sujets', async () => {
    const sujets = (await search({ limit: 50 })).body.data.documents.filter((d) => d.type_contenu === 'sujet_examen');
    const years = sujets.map((d) => d.annee_academique);
    expect(years).toEqual([...years].sort().reverse());
    expect(years[0]).toBe('2024-2025');
  });

  it('expose session, avec_corrige, taille et annee_academique', async () => {
    const sujets = (await search({ limit: 50 })).body.data.documents.filter((d) => d.type_contenu === 'sujet_examen');
    const avec = sujets.find((d) => d.avec_corrige);
    const sans = sujets.find((d) => !d.avec_corrige);
    expect(avec).toMatchObject({ session: expect.stringMatching(/normale|rattrapage/), annee_academique: expect.stringMatching(/^\d{4}-\d{4}$/),
      taille_octets: 1048576, taille_lisible: '1 Mo', type_epreuve: 'terminal' });
    expect(avec.lien_corrige).toMatch(/corrige=true$/);
    expect(avec.lien_telechargement).toMatch(/^\/api\/v1\/search\/documents\/telecharger/);
    expect(sans.lien_corrige).toBeNull();
    expect(avec).not.toHaveProperty('cheminFichier');
  });

  it('un résultat vide reste paginé', async () => {
    const res = await request(app).get('/api/v1/search/documents').query({ q: 'zzzintrouvablezzz' });
    expect(res.body.data).toMatchObject({ nombre_resultats: 0, documents: [], pagination: { total: 0, totalPages: 1 } });
  });
});
