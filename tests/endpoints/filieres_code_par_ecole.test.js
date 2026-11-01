// Le code d'une filière est unique par école (cahier §8.2)
const request = require('supertest');
const app = require('../../src/app');
const { Ecole } = require('../../src/models');

describe('Filières : code unique par école', () => {
  let admin; let ecoleA; let ecoleB;
  beforeAll(async () => {
    admin = (await request(app).post('/api/v1/auth/login').send({ matricule: 'ADM-0001', password: 'Admin@1234' })).body.data.accessToken;
    ecoleA = await Ecole.create({ ecole: 'École A (code filière)' });
    ecoleB = await Ecole.create({ ecole: 'École B (code filière)' });
  });
  const creer = (code, ecole_id) => request(app).post('/api/v1/filieres').set('Authorization', `Bearer ${admin}`).send({ code, nom: `Filière ${code}`, ecole_id });

  it('deux écoles peuvent avoir le même code de filière', async () => {
    expect((await creer('MEC', ecoleA.id)).status).toBe(201);
    expect((await creer('MEC', ecoleB.id)).status).toBe(201);
  });

  it('le même code dans la même école est refusé (409)', async () => {
    const res = await creer('MEC', ecoleA.id);
    expect(res.status).toBe(409);
  });
});
