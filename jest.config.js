const tsJest = { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] };

module.exports = {
  projects: [
    { displayName: 'unit', testEnvironment: 'node', transform: tsJest, testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { displayName: 'integration', testEnvironment: 'node', transform: tsJest, testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
    { displayName: 'e2e', testEnvironment: 'node', transform: tsJest, testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'] },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary', 'cobertura'],
  coverageThreshold: {
    global: { branches: 80, lines: 85, statements: 85, functions: 85 },
  },
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml' }]],
};
