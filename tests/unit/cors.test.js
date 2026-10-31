const express = require('express');
const cors = require('cors');
const request = require('supertest');

const load = (env = {}) => {
  jest.resetModules();
  Object.assign(process.env, env);
  return require('../../src/config/cors');
};

describe('CORS (CE-06)', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  it('isLocalOrigin est défini et strict', () => {
    const { isLocalOrigin } = load();
    expect(isLocalOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isLocalOrigin('http://localhost.evil.com')).toBe(false);
    expect(isLocalOrigin('https://localhost:3000')).toBe(false);
  });

  it('autorise FRONTEND_URL et CORS_ORIGINS, refuse le reste', () => {
    const { isAllowedOrigin } = load({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://admin.campus.example/',
      CORS_ORIGINS: 'https://admin-staging.campus.example, https://autre.example',
    });
    expect(isAllowedOrigin('https://admin.campus.example')).toBe(true);
    expect(isAllowedOrigin('https://admin-staging.campus.example')).toBe(true);
    expect(isAllowedOrigin('https://campus-edu-admin-evil.vercel.app')).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false); // refusé en production
    expect(isAllowedOrigin(undefined)).toBe(true);               // app mobile / curl
  });

  it('une origine inconnue est refusée sans exception (pas de 500)', async () => {
    const { corsOptions } = load({ NODE_ENV: 'production', FRONTEND_URL: 'https://ok.example' });
    const app = express();
    app.use(cors(corsOptions));
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const bad = await request(app).get('/x').set('Origin', 'https://evil.example');
    expect(bad.status).toBe(200);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();

    const good = await request(app).get('/x').set('Origin', 'https://ok.example');
    expect(good.headers['access-control-allow-origin']).toBe('https://ok.example');
  });
});
