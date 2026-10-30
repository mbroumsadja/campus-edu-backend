const { isTrustedFileUrl } = require('../../src/utils/fileUrl');

describe('isTrustedFileUrl (anti-SSRF, CE-01)', () => {
  it('accepte une URL Vercel Blob https', () => {
    expect(isTrustedFileUrl('https://abc123.public.blob.vercel-storage.com/sujets/a-x7Yz.pdf')).toBe(true);
  });

  it.each([
    'http://abc123.public.blob.vercel-storage.com/a.pdf',            // pas https
    'https://localhost/a.pdf',
    'https://127.0.0.1/a.pdf',
    'https://169.254.169.254/latest/meta-data/',                      // métadonnées cloud
    'https://10.0.0.5/a.pdf',
    'https://[::1]/a.pdf',
    'https://evil.com/a.pdf',
    'https://public.blob.vercel-storage.com.evil.com/a.pdf',          // suffixe trompeur
    'https://evilpublic.blob.vercel-storage.com.attacker.io/a.pdf',
    'https://abc.public.blob.vercel-storage.com@evil.com/a.pdf',      // userinfo
    'https://user:pw@abc.public.blob.vercel-storage.com/a.pdf',
    'https://abc.public.blob.vercel-storage.com:8443/a.pdf',          // port non standard
    'file:///etc/passwd',
    '/etc/passwd',
    '../../etc/passwd',
    '',
    null,
    undefined,
    42,
  ])('refuse %p', (value) => {
    expect(isTrustedFileUrl(value)).toBe(false);
  });

  it('accepte un hôte additionnel explicitement configuré', () => {
    process.env.BLOB_EXTRA_HOSTS = 'cdn.staging.example.com';
    expect(isTrustedFileUrl('https://cdn.staging.example.com/a.pdf')).toBe(true);
    delete process.env.BLOB_EXTRA_HOSTS;
    expect(isTrustedFileUrl('https://cdn.staging.example.com/a.pdf')).toBe(false);
  });
});
