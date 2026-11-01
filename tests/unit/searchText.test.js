const { normalizeSearch, escapeLike } = require('../../src/utils/searchText');

describe('normalizeSearch (CE-16)', () => {
  it.each([
    ['Système', 'systeme'],
    ['ÉLECTRONIQUE', 'electronique'],
    ['Algèbre linéaire', 'algebre lineaire'],
    ['cœur', 'coeur'],
    ['Æsop', 'aesop'],
    ['François', 'francois'],
    ['  trop   d\'espaces ', 'trop d\'espaces'],
    ['Đorđe', 'dorde'],
    ['', ''],
    [null, ''],
  ])('%p -> %p', (input, expected) => expect(normalizeSearch(input)).toBe(expected));
});

describe('escapeLike', () => {
  it('neutralise les jokers', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});
