// src/utils/fileName.js
// Noms de fichiers lisibles : jamais de « %20 » dans les noms stockés ou téléchargés.

// Décode un nom encodé en pourcentage (une ou deux fois), retire le dossier et les caractères de contrôle.
const cleanFileName = (value) => {
  if (value == null) return value;
  let name = String(value);

  for (let i = 0; i < 2 && /%[0-9a-fA-F]{2}/.test(name); i++) {
    try {
      name = decodeURIComponent(name);
    } catch (_e) {
      break; // % isolé ou séquence invalide : on garde tel quel
    }
  }

  name = name
    .split(/[\\/]/).pop()                 // pas de chemin (a/b/c.pdf -> c.pdf)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);

  return name || null;
};

// En-tête Content-Disposition correct (RFC 6266 / 5987) :
// filename= en ASCII simple (repli) et filename*= en UTF-8 encodé.
const contentDisposition = (fileName, type = 'attachment') => {
  const name = cleanFileName(fileName) || 'document';
  const ascii = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // é -> e
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

module.exports = { cleanFileName, contentDisposition };
