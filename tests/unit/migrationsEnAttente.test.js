const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrationsEnAttente } = require('../../src/utils/migrationsEnAttente');

const faux = (existe, noms) => ({
  query: async (sql) => (/to_regclass/.test(sql) ? [[{ existe }]] : [noms.map((name) => ({ name }))]),
});

describe('migrations en attente', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  beforeAll(() => ['001-a.js', '002-b.js', '003-c.js', 'notes.txt'].forEach((f) => fs.writeFileSync(path.join(dossier, f), '')));

  it('liste celles qui ne sont pas dans sequelize_meta', async () => {
    expect(await migrationsEnAttente(faux(true, ['001-a.js']), dossier)).toEqual(['002-b.js', '003-c.js']);
  });
  it('rien en attente quand tout est appliqué', async () => {
    expect(await migrationsEnAttente(faux(true, ['001-a.js', '002-b.js', '003-c.js']), dossier)).toEqual([]);
  });
  it('base jamais migrée : toutes sont en attente', async () => {
    expect(await migrationsEnAttente(faux(false, []), dossier)).toHaveLength(3);
  });
});
