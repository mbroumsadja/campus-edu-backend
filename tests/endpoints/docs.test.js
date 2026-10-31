// Page de documentation interactive /api/v1/docs
const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/v1/docs', () => {
  afterEach(() => { delete process.env.DOCS_ENABLED; });

  it('sert la page HTML (avec ou sans slash final)', async () => {
    for (const url of ['/api/v1/docs', '/api/v1/docs/']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('swagger-ui-bundle.js');
      expect(res.text).toContain('/api/v1/docs/init.js');
    }
  });

  it('charge Swagger UI en version figée avec empreintes SRI', async () => {
    const { text } = await request(app).get('/api/v1/docs');
    expect(text).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle\.js/);
    expect(text.match(/integrity="sha384-[A-Za-z0-9+/=]+"/g)).toHaveLength(2);
  });

  it('a un CSP dédié qui n\'autorise que jsDelivr et le serveur lui-même', async () => {
    const res = await request(app).get('/api/v1/docs');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('init.js pointe vers le contrat OpenAPI', async () => {
    const res = await request(app).get('/api/v1/docs/init.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('"/api/v1/openapi.json"');
  });

  it('DOCS_ENABLED=false : page et script en 404, le contrat JSON reste servi', async () => {
    process.env.DOCS_ENABLED = 'false';
    expect((await request(app).get('/api/v1/docs')).status).toBe(404);
    expect((await request(app).get('/api/v1/docs/init.js')).status).toBe(404);
    expect((await request(app).get('/api/v1/openapi.json')).status).toBe(200);
  });
});
