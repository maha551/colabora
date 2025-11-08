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
  // Shutdown metrics collector to clean up intervals
  try {
    const { metricsCollector } = require('../server/middleware/monitoring');
    if (metricsCollector && typeof metricsCollector.shutdown === 'function') {
      metricsCollector.shutdown();
    }
  } catch (error) {
    // Ignore errors if metrics collector isn't available
  }

  // Wait a bit for any pending operations
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force close any remaining database connections
  try {
    const sqlite3 = require('sqlite3');
    // This helps ensure SQLite connections are released
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    // Ignore GC errors
  }

  // Close any open database connections and cleanup
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DATABASE_URL;

  // Try multiple times to delete the database file
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Successfully cleaned up test database');
      }
      break;
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.warn('Could not clean up test database after', maxAttempts, 'attempts:', error.message);
      } else {
        // Wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
});
