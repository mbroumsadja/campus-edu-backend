// CE-16 : recherche insensible à la casse et aux accents (mode extension ET mode repli)
const request = require('supertest');
const app = require('../../src/app');
const { sequelize, Cours, CoursDocument, Sujet, UE, Utilisateur } = require('../../src/models');

describe('Recherche sans accents', () => {
  let token; let ue; let ens;

  beforeAll(async () => {
    const auth = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    token = auth.body.data.accessToken;
    ue = await UE.findOne({ where: { code: 'INF101' } });
    ens = await Utilisateur.findOne({ where: { matricule: 'ENS-0001' } });

    const base = { ue_id: ue.id, enseignant_id: ens.id, statut: 'publie', cheminFichier: 'x', type: 'pdf' };
    // /search/documents renvoie un résultat par fichier : chaque cours doit en avoir un
    const created = await Cours.bulkCreate([
      { ...base, titre: 'Système d\'exploitation' },
      { ...base, titre: 'Électronique numérique' },
      { ...base, titre: 'Taux de 100% de réussite' },
      { ...base, titre: 'Cours de cœur et æther' },
    ]);
    await CoursDocument.bulkCreate(created.map((c) => ({
      cours_id: c.id, cheminFichier: 'x', nomFichierOriginal: `${c.titre}.pdf`, tailleFichier: 10,
    })));
    await Sujet.create({ titre: 'Examen d\'Algèbre linéaire', type: 'partiel', session: 'normale', annee: 2025,
      cheminFichier: 'y', statut: 'publie', ue_id: ue.id, enseignant_id: ens.id });
  });

  const docs = async (q) => {
    const res = await request(app).get('/api/v1/search/documents').query({ q });
    expect(res.status).toBe(200);
    return res.body.data.documents.map((d) => d.nom || d.titre);
  };
  const coursListe = async (search) => {
    const res = await request(app).get('/api/v1/cours').set('Authorization', `Bearer ${token}`).query({ search });
    expect(res.status).toBe(200);
    return res.body.data.map((c) => c.titre);
  };

  it('f_unaccent est installée et retire les accents', async () => {
    const [[r]] = await sequelize.query("SELECT f_unaccent('Éléphant Çà œuvre') AS v");
    expect(r.v).toBe('Elephant Ca oeuvre');
  });

  it('/search/documents : « systeme » trouve « Système », sans tenir compte de la casse', async () => {
    expect((await docs('systeme')).join('|')).toMatch(/Système/);
    expect((await docs('SYSTÈME')).join('|')).toMatch(/Système/);
    expect((await docs('Systéme')).join('|')).toMatch(/Système/);   // accent au mauvais endroit
  });

  it('/search/documents : « electronique » trouve « Électronique »', async () => {
    expect((await docs('electronique')).join('|')).toMatch(/Électronique/);
  });

  it('/search/documents : trouve aussi les sujets (algebre -> Algèbre)', async () => {
    expect((await docs('algebre lineaire')).join('|')).toMatch(/Algèbre/);
  });

  it('ligatures : « coeur » trouve « cœur », « aether » trouve « æther »', async () => {
    expect((await coursListe('coeur')).join('|')).toMatch(/cœur/);
    expect((await coursListe('aether')).join('|')).toMatch(/æther/);
  });

  it('/cours?search= est insensible à la casse et aux accents', async () => {
    expect(await coursListe('SYSTEME')).toEqual(expect.arrayContaining(["Système d'exploitation"]));
    expect(await coursListe('électronique')).toEqual(expect.arrayContaining(['Électronique numérique']));
  });

  it('/sujets?search= idem', async () => {
    const res = await request(app).get('/api/v1/sujets').set('Authorization', `Bearer ${token}`).query({ search: 'ALGEBRE' });
    expect(res.body.data.map((s) => s.titre).join('|')).toMatch(/Algèbre/);
  });

  it('/users?search= trouve un nom sans tenir compte de la casse', async () => {
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`).query({ search: 'professeur' });
    expect(res.status).toBe(200);
    expect(res.body.data.some((u) => u.matricule === 'ENS-0001')).toBe(true);
  });

  it('% et _ sont cherchés littéralement (pas des jokers)', async () => {
    expect(await coursListe('100%')).toEqual(['Taux de 100% de réussite']);
    expect(await coursListe('%')).toEqual(['Taux de 100% de réussite']);
    expect(await coursListe('_')).toEqual([]);
  });

  it('une recherche sans résultat renvoie une liste vide, pas une erreur', async () => {
    expect(await coursListe('zzzintrouvablezzz')).toEqual([]);
  });
});
