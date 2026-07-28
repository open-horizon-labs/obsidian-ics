module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Excluded here, run separately via "npm run test:dist-artifact" (see
  // jest.dist-artifact.config.js): it requires dist/main.js to already be
  // built, which isn't true at the point "npm test" runs in CI (before the
  // build step) or in a fresh checkout.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/issue-198-dist-artifact.test.ts'],
};