module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/generated/**",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          moduleResolution: "node16",
          module: "commonjs",
          strict: false,
        },
      },
    ],
    "node_modules/(uniffi-bindgen-react-native)/.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          moduleResolution: "node16",
          module: "commonjs",
          strict: false,
        },
      },
    ],
  },
  // Mock the native module during tests
  moduleNameMapper: {
    "^react-native$": "<rootDir>/node_modules/react-native",
  },
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  // Transform node_modules that use ES modules
  transformIgnorePatterns: ["node_modules/(?!uniffi-bindgen-react-native)"],
}
