// Runs only the compiled-artifact contract test (tests/issue-198-dist-artifact.test.ts)
// against the already-built dist/main.js. Deliberately excluded from the main
// jest.config.js (and therefore from "npm test") because it requires a build
// to have already happened - see "npm run test:dist-artifact" in package.json,
// and the CI steps that run it after "npm run build".
const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/issue-198-dist-artifact.test.ts'],
};
