module.exports = {
  setupFilesAfterEnv: ['./src/setupTests.ts'],
  setupFiles: [require.resolve('whatwg-fetch')],
};
