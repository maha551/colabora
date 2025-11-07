// Test setup and global configurations
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-jest-testing-only';
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing-only';
// Use a timestamp-based database name to avoid conflicts between test runs
const timestamp = Date.now();
process.env.DATABASE_URL = path.join(__dirname, `../test-colabora-${timestamp}.db`);

// Global test utilities
global.testConfig = {
  testUser: {
    id: 'test-user-123',
    name: 'Test User',
    email: 'test@example.com',
    password: 'TestPass123!'
  },
  demoUsers: [
    { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!' }
  ]
};

// Clean up after all tests
afterAll(async () => {
  // Close any open database connections
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DATABASE_URL;

  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch (error) {
    console.warn('Could not clean up test database:', error.message);
  }
});
