module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts', '!src/**/*.module.ts', '!src/**/*.dto.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
