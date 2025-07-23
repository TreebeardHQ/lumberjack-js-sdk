module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  modulePathIgnorePatterns: [".next"],
  testTimeout: 60000, // Increase timeout for build tests
  rootDir: ".",
};
