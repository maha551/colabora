module.exports = {
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/client/src/components/OrganizationManagement/blocks/__tests__',
    '<rootDir>/client/src/components/OrganizationManagement/navigation/__tests__',
    '<rootDir>/client/src/components/OrganizationManagement/tabs/__tests__',
    '<rootDir>/client/src/components/OrganizationManagement/agenda/__tests__',
    '<rootDir>/client/src/components/__tests__',
    '<rootDir>/client/src/components/ActivityFeed/decisions/shared/__tests__',
  ],
  testMatch: ['**/?(*.)+(spec|test).ts', '**/?(*.)+(spec|test).tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/client/tsconfig.json' }],
  },
  moduleNameMapper: {
    '.*/ui/Icon$': '<rootDir>/client/src/components/OrganizationManagement/blocks/__tests__/mocks/IconMock.tsx',
    '\\.css$': '<rootDir>/client/src/components/OrganizationManagement/blocks/__tests__/mocks/styleMock.js',
  },
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
