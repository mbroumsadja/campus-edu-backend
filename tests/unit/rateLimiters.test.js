const express = require('express');
const request = require('supertest');

describe('Rate limiting (CE-02)', () => {
  const build = () => {
    jest.resetModules();
    const { loginLimiter, globalLimiter } = require('../../src/middlewares/rateLimiters');
    const app = express();
    app.use(express.json());
    app.use('/api', globalLimiter);
    app.post('/api/auth/login', loginLimiter, (_req, res) => res.json({ ok: true }));
    return app;
  };

  it('la fenêtre globale est de 15 minutes (et non 15 ms)', async () => {
    const app = build();
    const res = await request(app).post('/api/auth/login').send({ matricule: 'A1B2C3' });
    expect(res.headers['ratelimit-policy']).toMatch(/w=900/); // 900 s = 15 min
  });

  it('bloque la 11e tentative de login (429) pour une même IP+matricule', async () => {
    const app = build();
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/api/auth/login').send({ matricule: '22FS0001' });
      expect(r.status).toBe(200);
    }
    const blocked = await request(app).post('/api/auth/login').send({ matricule: '22FS0001' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);

    // un autre matricule n'est pas impacté
    const other = await request(app).post('/api/auth/login').send({ matricule: '22FS0002' });
    expect(other.status).toBe(200);
  });
});

describe('UpstashStore', () => {
  it('incrémente via l\'API REST et renvoie hits + resetTime', async () => {
    const { UpstashStore } = require('../../src/middlewares/rateLimiters');
    const calls = [];
    global.fetch = jest.fn(async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => [{ result: 3 }, { result: 1 }, { result: 120000 }] };
    });
    const store = new UpstashStore({ url: 'https://x.upstash.io/', token: 't' });
    store.init({ windowMs: 900000 });
    const r = await store.increment('1.2.3.4');
    expect(r.totalHits).toBe(3);
    expect(r.resetTime.getTime()).toBeGreaterThan(Date.now());
    expect(calls[0].url).toBe('https://x.upstash.io/pipeline');
    expect(calls[0].body[0]).toEqual(['INCR', 'rl:1.2.3.4']);
  });
});
