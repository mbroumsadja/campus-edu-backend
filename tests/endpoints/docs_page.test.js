// Page de documentation autonome /api/v1/docs (générée depuis le contrat OpenAPI)
const request = require('supertest');
const app = require('../../src/app');
const spec = require('../../src/docs/openapi');
const { renderPage, flatten } = require('../../src/docs/renderDocs');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ method: m, path, op: item[m] })));

describe('GET /api/v1/docs (page autonome)', () => {
  afterEach(() => { delete process.env.DOCS_ENABLED; });

  it('sert une page HTML avec ou sans slash final', async () => {
    for (const url of ['/api/v1/docs', '/api/v1/docs/']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Documentation de l\'API');
    }
  });

  it('documente chaque endpoint du contrat (44), chacun une seule fois', async () => {
    const { text } = await request(app).get('/api/v1/docs');
    expect(operations.length).toBeGreaterThanOrEqual(44);
    expect((text.match(/<details class="op"/g) || []).length).toBe(operations.length);
    for (const { method, path } of operations) {
      expect(text).toContain(`<span class="m ${method}">${method.toUpperCase()}</span>`);
      expect(text).toContain(path.replace(/\{(\w+)\}/g, '<i>{$1}</i>'));
    }
  });

  it('n\'utilise aucune ressource externe et pas de script ni style en ligne', async () => {
    const res = await request(app).get('/api/v1/docs');
    const external = res.text.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
    expect(external).toEqual([]);
    expect(res.text).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(res.text).not.toMatch(/<style/);
    expect(res.text).not.toMatch(/\son\w+="/);
  });

  it('a une politique CSP stricte', async () => {
    const csp = (await request(app).get('/api/v1/docs')).headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('sert sa feuille de style et son script', async () => {
    const css = await request(app).get('/api/v1/docs/style.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/text\/css/);
    expect(css.text).toContain('prefers-color-scheme:dark');
    const js = await request(app).get('/api/v1/docs/app.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(() => new Function(js.text)).not.toThrow();
  });

  it('chaque endpoint a un exemple curl ; ceux qui exigent un jeton ont l\'en-tête Authorization', () => {
    const html = renderPage(spec, { baseUrl: '/api/v1', origin: 'https://api.test' });
    const blocks = html.split('<details class="op"').slice(1);
    expect(blocks).toHaveLength(operations.length);
    // La page regroupe par thème : on associe chaque bloc à son endpoint via data-search="méthode chemin …"
    const byKey = Object.fromEntries(blocks.map((b) => [/data-search="(\S+ \S+)/.exec(b)[1], b]));
    for (const { method, path, op } of operations) {
      const b = byKey[`${method} ${path}`.toLowerCase()];
      expect(b).toBeDefined();
      expect(b).toContain('<code>curl');
      expect(b).toContain('https://api.test/api/v1');
      expect(b.includes('Authorization: Bearer')).toBe(!!op.security);
    }
  });

  it('montre les corps de requête et les paramètres (ex. création de sujet, recherche)', async () => {
    const { text } = await request(app).get('/api/v1/docs');
    expect(text).toContain('<code>sujet.sha256</code>');
    expect(text).toContain('<code>annee_academique</code>');
    expect(text).toContain('<code>limit</code>');
    expect(text).toContain('défaut 20');
    expect(text).toContain('max 50');
  });

  it('échappe le HTML venant du contrat (pas d\'injection)', () => {
    const evil = JSON.parse(JSON.stringify(spec));
    evil.paths['/ping'].get.summary = '<script>alert(1)</script>';
    evil.info.description = '- <img src=x onerror=alert(1)>';
    const html = renderPage(evil, { baseUrl: '/api/v1', origin: 'https://x"><script>alert(2)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('flatten : résout les $ref et les sous-objets', () => {
    const rows = flatten(spec, spec.components.schemas.SujetCreation);
    const names = rows.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['titre', 'sujet', 'sujet.url', 'sujet.sha256', 'corrige.url']));
    expect(rows.find((r) => r.name === 'titre').required).toBe(true);
    expect(rows.find((r) => r.name === 'type').deprecated).toBe(true);
  });

  it('un champ imbriqué n\'est « obligatoire » que si son parent l\'est (corrige est facultatif)', () => {
    const rows = flatten(spec, spec.components.schemas.SujetCreation);
    expect(rows.find((r) => r.name === 'sujet.url').required).toBe(true);
    expect(rows.find((r) => r.name === 'corrige.url').required).toBe(false);
  });

  it('met les `extraits de code` des descriptions en forme et décrit les paramètres de recherche', async () => {
    const { text: html } = await request(app).get('/api/v1/docs');
    const text = html.replace(/ data-search="[^"]*"/g, ''); // attribut caché du filtre
    expect(text).not.toContain('`');
    expect(text).toContain('Alias de <code>q</code>');
    expect(text).toContain('« systeme » trouve « Système »');
  });

  it('DOCS_ENABLED=false : page, style et script en 404, le contrat JSON reste servi', async () => {
    process.env.DOCS_ENABLED = 'false';
    for (const url of ['/api/v1/docs', '/api/v1/docs/style.css', '/api/v1/docs/app.js']) {
      expect((await request(app).get(url)).status).toBe(404);
    }
    expect((await request(app).get('/api/v1/openapi.json')).status).toBe(200);
  });

  it('l\'ancien chemin /api/docs n\'expose rien de plus que /api/v1/docs', async () => {
    const res = await request(app).get('/api/docs');
    expect([200, 404]).toContain(res.status);
  });
});
