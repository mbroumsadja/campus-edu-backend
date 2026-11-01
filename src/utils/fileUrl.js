// src/utils/fileUrl.js
// Validation des URL de fichiers (anti-SSRF, CE-01).
// Seules les URL https hébergées sur Vercel Blob sont acceptées.
// Les chemins locaux fournis par le client sont refusés (lecture arbitraire du disque).

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

// Hôtes additionnels explicitement autorisés (ex. CDN de préproduction), séparés par des virgules
const extraHosts = () =>
  (process.env.BLOB_EXTRA_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

const isTrustedFileUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false;

  let url;
  try {
    url = new URL(value);
  } catch (_e) {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;     // https://blob...@evil.com
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase();
  // Le suffixe doit être précédé d'au moins un label (pas d'hôte nu)
  if (host.endsWith(BLOB_HOST_SUFFIX) && host.length > BLOB_HOST_SUFFIX.length) return true;
  return extraHosts().includes(host);
};

class UntrustedFileUrlError extends Error {
  constructor(message = 'URL de fichier non autorisée.') {
    super(message);
    this.name = 'UntrustedFileUrlError';
    this.statusCode = 400;
  }
}

const assertTrustedFileUrl = (value) => {
  if (!isTrustedFileUrl(value)) throw new UntrustedFileUrlError();
  return value;
};

module.exports = { isTrustedFileUrl, assertTrustedFileUrl, UntrustedFileUrlError };
