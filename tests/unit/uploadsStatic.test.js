// /uploads n'est servi qu'en développement (ou avec SERVE_UPLOADS=true)
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const charger = (env) => {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'brouillon non publié');
  Object.assign(process.env, { UPLOAD_DIR: dir, ...env });
  return require('../../src/app');
};

describe('service statique /uploads', () => {
  const avant = { ...process.env };
  afterEach(() => { process.env = { ...avant }; });

  it('désactivé en production', async () => {
    const res = await request(charger({ NODE_ENV: 'production' })).get('/uploads/secret.txt');
    expect(res.status).toBe(404);
  });
  it('réactivable explicitement avec SERVE_UPLOADS=true', async () => {
    const res = await request(charger({ NODE_ENV: 'production', SERVE_UPLOADS: 'true' })).get('/uploads/secret.txt');
    expect(res.status).toBe(200);
  });
  it('actif en développement', async () => {
    const res = await request(charger({ NODE_ENV: 'development' })).get('/uploads/secret.txt');
    expect(res.status).toBe(200);
  });
});
