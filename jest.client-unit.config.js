/** Pure client/unit helpers — no DB setup (see tests/setup.js). */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/client-unit/setup.js'],
  roots: [
    '<rootDir>/tests/client-unit',
    '<rootDir>/client/src/components/OrganizationManagement/agenda/__tests__',
  ],
  testMatch: ['**/*.test.ts', '**/*.test.js', '**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/client/tsconfig.json' }],
  },
  moduleNameMapper: {
    '.*/ui/Icon$': '<rootDir>/client/src/components/OrganizationManagement/blocks/__tests__/mocks/IconMock.tsx',
    '\\.css$': '<rootDir>/client/src/components/OrganizationManagement/blocks/__tests__/mocks/styleMock.js',
  },
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  modulePaths: ['<rootDir>/node_modules', '<rootDir>/client/node_modules'],
  verbose: true,
  clearMocks: true,
};
