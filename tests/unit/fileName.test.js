const { cleanFileName, contentDisposition } = require('../../src/utils/fileName');

describe('cleanFileName', () => {
  it.each([
    ['Sujet%20Algo%202024.pdf', 'Sujet Algo 2024.pdf'],
    ['Sujet Algo 2024.pdf', 'Sujet Algo 2024.pdf'],
    ['Syst%C3%A8me%20d%27exploitation.pdf', "Système d'exploitation.pdf"],
    ['Sujet%2520double.pdf', 'Sujet double.pdf'],            // doublement encodé
    ['cours/INF%20101/td%201.pdf', 'td 1.pdf'],               // chemin Blob -> nom seul
    ['100%.pdf', '100%.pdf'],                                 // % isolé conservé
    ['a%zz.pdf', 'a%zz.pdf'],                                 // séquence invalide conservée
    ['  trop   d espaces .pdf ', 'trop d espaces .pdf'],
  ])('%p -> %p', (input, expected) => {
    expect(cleanFileName(input)).toBe(expected);
  });

  it('gère null / vide', () => {
    expect(cleanFileName(null)).toBeNull();
    expect(cleanFileName('')).toBeNull();
  });
});

describe('contentDisposition', () => {
  it('ne met plus de %20 dans filename=, et garde l\'UTF-8 dans filename*', () => {
    const h = contentDisposition('Système TD 1.pdf');
    expect(h).toContain('filename="Systeme TD 1.pdf"');
    expect(h).toContain("filename*=UTF-8''Syst%C3%A8me%20TD%201.pdf");
    expect(h.split('filename*')[0]).not.toContain('%20');
  });

  it('corrige aussi un nom déjà encodé et neutralise les guillemets', () => {
    expect(contentDisposition('Sujet%20L1.pdf')).toContain('filename="Sujet L1.pdf"');
    expect(contentDisposition('a"b.pdf')).toContain('filename="a_b.pdf"');
  });
});
