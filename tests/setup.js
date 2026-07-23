/**
 * Setup file pour les tests Jest
 * Configuré dans jest.config.js
 */

// Augmenter le timeout pour les requêtes réseau/DB
jest.setTimeout(30000);

// Ignorer les avertissements des dépendances externes
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: An update to')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
