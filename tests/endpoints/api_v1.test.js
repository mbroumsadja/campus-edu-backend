// CE-15 : /api/v1, /config, X-App-Version, OpenAPI
const request = require('supertest');
const SwaggerParser = require('@apidevtools/swagger-parser');
const app = require('../../src/app');
const spec = require('../../src/docs/openapi');

describe('Préfixes /api/v1 et /api', () => {
  it('login fonctionne sur /api/v1 et sur l\'ancien /api', async () => {
    const body = { matricule: 'ADM-0001', password: 'Admin@1234' };
    const v1 = await request(app).post('/api/v1/auth/login').send(body);
    const old = await request(app).post('/api/auth/login').send(body);
    expect(v1.status).toBe(200);
    expect(old.status).toBe(200);
    expect(v1.body.data.accessToken).toBeDefined();
  });

  it('/api/v1 n\'est pas marqué déprécié', async () => {
    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('l\'ancien /api est marqué déprécié avec le lien vers /api/v1', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('</api/v1/ping>; rel="successor-version"');
  });

  it('une route inconnue renvoie 404 JSON', async () => {
    const res = await request(app).get('/api/v1/nimporte-quoi');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/config', () => {
  it('est public et décrit la version minimale', async () => {
    const res = await request(app).get('/api/v1/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ apiVersion: 'v1', minAppVersion: expect.any(String), maxUploadMB: expect.any(Number) });
  });
});

describe('X-App-Version', () => {
  const OLD = process.env.APP_MIN_VERSION;
  beforeAll(() => { process.env.APP_MIN_VERSION = '1.4.0'; process.env.APP_UPDATE_URL = 'https://play.example/campus'; });
  afterAll(() => {
    if (OLD === undefined) delete process.env.APP_MIN_VERSION; else process.env.APP_MIN_VERSION = OLD;
    delete process.env.APP_UPDATE_URL;
  });

  it('426 si la version est trop ancienne', async () => {
    const res = await request(app).get('/api/v1/ping').set('X-App-Version', '1.3.9');
    expect(res.status).toBe(426);
    expect(res.body).toMatchObject({ code: 'APP_UPDATE_REQUIRED', minVersion: '1.4.0', updateUrl: 'https://play.example/campus' });
  });

  it('compare numériquement (1.10.0 > 1.4.0)', async () => {
    expect((await request(app).get('/api/v1/ping').set('X-App-Version', '1.10.0')).status).toBe(200);
    expect((await request(app).get('/api/v1/ping').set('X-App-Version', '1.4.0')).status).toBe(200);
  });

  it('jamais bloqué sans en-tête ni avec un format inconnu', async () => {
    expect((await request(app).get('/api/v1/ping')).status).toBe(200);
    expect((await request(app).get('/api/v1/ping').set('X-App-Version', 'abc')).status).toBe(200);
  });

  it('/config répond même à une version obsolète (pour afficher la mise à jour)', async () => {
    const res = await request(app).get('/api/v1/config').set('X-App-Version', '0.1.0');
    expect(res.status).toBe(200);
    expect(res.body.data.minAppVersion).toBe('1.4.0');
  });
});

describe('Contrat OpenAPI', () => {
  it('est servi publiquement sur /api/v1/openapi.json', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });

  it('est une spécification OpenAPI 3 valide', async () => {
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(spec)))).resolves.toBeDefined();
  });

  // Parcourt toutes les routes Express réellement montées et vérifie qu'elles sont documentées
  it('documente chaque route Express (et ne documente rien d\'inexistant)', () => {
    const apiRouter = require('../../src/routes/api');
    const real = new Set();

    const walk = (stack, prefix) => {
      for (const layer of stack) {
        if (layer.route) {
          for (const method of Object.keys(layer.route.methods)) {
            real.add(`${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`);
          }
        } else if (layer.name === 'router' && layer.handle.stack) {
          const mount = layer.regexp.source
            .replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace(/\$$/, '');
          walk(layer.handle.stack, prefix + mount);
        }
      }
    };
    walk(apiRouter.stack, '');

    const norm = (p) => p.replace(/:([A-Za-z]+)/g, '{$1}');
    const code = new Set([...real].map((r) => { const [m, ...p] = r.split(' '); return `${m} ${norm(p.join(' '))}`; }));

    const documented = new Set();
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) documented.add(`${m.toUpperCase()} ${path}`);
    }

    const missing = [...code].filter((r) => !documented.has(r));
    const ghost = [...documented].filter((r) => !code.has(r));
    expect({ missing, ghost }).toEqual({ missing: [], ghost: [] });
    expect(code.size).toBeGreaterThan(30);
  });
});
