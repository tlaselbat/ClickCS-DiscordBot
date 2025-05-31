// Simple test to check what's exported from ready.js
const readyModule = require('../src/events/ready.js');

describe('Ready Module Exports', () => {
  it('should log the exported functions', () => {
    console.log('Exported functions from ready.js:', Object.keys(readyModule));
    expect(true).toBe(true);
  });
});
