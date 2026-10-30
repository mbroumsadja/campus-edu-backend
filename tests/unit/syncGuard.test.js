// CE-09 : sync({ alter | force }) interdit en production
describe('garde-fou sync en production', () => {
  it('refuse alter et force quand NODE_ENV=production', () => {
    jest.resetModules();
    process.env.DB_URL = 'postgres://u:p@localhost:5432/x';
    process.env.NODE_ENV = 'production';
    const { sequelize } = require('../../src/config/database_production');
    expect(() => sequelize.sync({ alter: true })).toThrow(/interdit en production/);
    expect(() => sequelize.sync({ force: true })).toThrow(/interdit en production/);
    process.env.NODE_ENV = 'test';
  });
});
