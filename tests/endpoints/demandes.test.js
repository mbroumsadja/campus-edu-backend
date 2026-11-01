// CE-20 — demandes publiques (sujet manquant / signalement)
process.env.DEMANDE_RATE_LIMIT_MAX = '5';
const request = require('supertest');
const app = require('../../src/app');
const { Demande, UE, Sujet } = require('../../src/models');

describe('Demandes publiques', () => {
  let ue; let sujet; let admin;
  const post = (body, ip) => request(app).post('/api/v1/demandes').set('X-Forwarded-For', ip || '10.0.0.1').send(body);

  beforeAll(async () => {
    ue = await UE.findOne({ where: { code: 'INF101' } });
    sujet = await Sujet.create({ titre: 'Sujet signalé', type_epreuve: 'td', session: 'normale', annee_academique: '2024-2025', ue_id: ue.id, cheminFichier: 'https://abc.public.blob.vercel-storage.com/a.pdf', statut: 'publie' });
    const a = await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' });
    admin = a.body.data.accessToken;
  });
  beforeEach(async () => { await Demande.destroy({ where: {} }); });

  it('enregistre une demande de sujet manquant sans authentification, et l\'admin la consulte', async () => {
    const res = await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'Il manque le partiel 2023 de cette UE.', contact: 'a@b.cm' }, '10.0.1.1');
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/v1/demandes').set('Authorization', `Bearer ${admin}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ type: 'sujet_manquant', statut: 'nouvelle', message: expect.stringContaining('partiel 2023') });
    expect(list.body.data[0].ue.code).toBe('INF101');
    expect(list.body.data[0]).not.toHaveProperty('empreinte_auteur');
    expect(JSON.stringify(list.body)).not.toContain('10.0.1.1');   // IP jamais exposée ni stockée
  });

  it('un signalement exige le sujet concerné ; une demande exige l\'UE', async () => {
    expect((await post({ type: 'signalement', message: 'Fichier illisible, merci de corriger.' }, '10.0.2.1')).status).toBe(400);
    expect((await post({ type: 'sujet_manquant', message: 'Il manque un sujet important.' }, '10.0.2.2')).status).toBe(400);
    expect((await post({ type: 'signalement', sujet_id: sujet.id, message: 'Fichier illisible, merci de corriger.' }, '10.0.2.3')).status).toBe(201);
  });

  it('champ piège : succès apparent mais rien n\'est stocké', async () => {
    const res = await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'Message de robot suffisamment long.', site_web: 'http://spam.example' }, '10.0.3.1');
    expect(res.status).toBe(201);
    expect(await Demande.count()).toBe(0);
  });

  it('tailles maximales et liens', async () => {
    expect((await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'court' }, '10.0.4.1')).status).toBe(400);
    expect((await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'x'.repeat(1001) }, '10.0.4.2')).status).toBe(400);
    expect((await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'Voir http://a.com et http://b.com pour plus.' }, '10.0.4.3')).status).toBe(400);
    expect((await post({ type: 'sujet_manquant', ue_id: ue.id, message: 'Message correct', contact: 'c'.repeat(151) }, '10.0.4.4')).status).toBe(400);
  });

  it('un doublon (même auteur, même UE, 24 h) n\'est stocké qu\'une fois', async () => {
    const corps = { type: 'sujet_manquant', ue_id: ue.id, message: 'Il manque le partiel 2023 de cette UE.' };
    expect((await post(corps, '10.0.5.1')).status).toBe(201);
    expect((await post(corps, '10.0.5.1')).status).toBe(200);
    expect(await Demande.count()).toBe(1);
    expect((await post(corps, '10.0.5.2')).status).toBe(201);   // autre auteur : accepté
  });

  it('les abus sont plafonnés : 429 après 5 envois par IP', async () => {
    const codes = [];
    for (let i = 0; i < 7; i += 1) {
      codes.push((await post({ type: 'sujet_manquant', ue_id: ue.id, message: `Demande numéro ${i} pour test de limite.` }, '10.0.6.1')).status);
    }
    expect(codes.slice(0, 5).every((c) => c === 201 || c === 200)).toBe(true); // 200 = doublon ignoré, compté quand même par la limite
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it('consultation et traitement réservés à l\'admin ; filtre par statut', async () => {
    const d = await Demande.create({ type: 'sujet_manquant', message: 'Message pour le test admin.', ue_id: ue.id });
    expect((await request(app).get('/api/v1/demandes')).status).toBe(401);
    const patch = await request(app).patch(`/api/v1/demandes/${d.id}/statut`).set('Authorization', `Bearer ${admin}`).send({ statut: 'traitee' });
    expect(patch.status).toBe(200);
    const filtre = await request(app).get('/api/v1/demandes?statut=nouvelle').set('Authorization', `Bearer ${admin}`);
    expect(filtre.body.data).toHaveLength(0);
    const traitees = await request(app).get('/api/v1/demandes?statut=traitee').set('Authorization', `Bearer ${admin}`);
    expect(traitees.body.data[0].id).toBe(d.id);
    expect((await request(app).patch(`/api/v1/demandes/${d.id}/statut`).set('Authorization', `Bearer ${admin}`).send({ statut: 'nimporte' })).status).toBe(400);
  });
});
