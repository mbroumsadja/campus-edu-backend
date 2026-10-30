const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

describe('téléchargement depuis Blob : nom de fichier lisible', () => {
  const build = (name) => {
    jest.resetModules();
    const { downloadStoredFile } = require('../../src/middlewares/upload');
    const app = express();
    app.get('/f', (_req, res) => downloadStoredFile(res, 'https://abc.public.blob.vercel-storage.com/x-1.pdf', name));
    return app;
  };

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/pdf' },
      body: Readable.toWeb(Readable.from([Buffer.from('%PDF-test')])),
    }));
  });

  it('pas de %20 dans filename=, UTF-8 dans filename*', async () => {
    const res = await request(build('Cours de Système.pdf')).get('/f');
    expect(res.status).toBe(200);
    const h = res.headers['content-disposition'];
    expect(h).toContain('filename="Cours de Systeme.pdf"');
    expect(h).toContain("filename*=UTF-8''Cours%20de%20Syst%C3%A8me.pdf");
  });

  it('un nom déjà encodé en base est aussi nettoyé', async () => {
    const res = await request(build('Cours%20de%20Maths.pdf')).get('/f');
    expect(res.headers['content-disposition']).toContain('filename="Cours de Maths.pdf"');
  });

  it('refuse toujours une source hors Blob', async () => {
    jest.resetModules();
    const { downloadStoredFile } = require('../../src/middlewares/upload');
    const app = express();
    app.get('/f', (_req, res) => downloadStoredFile(res, 'https://evil.com/a.pdf', 'a.pdf'));
    expect((await request(app).get('/f')).status).toBe(502);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
