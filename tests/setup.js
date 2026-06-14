// Test setup and global configurations
const {
  withWorkerSchemaInUrl,
  ensureWorkerSchemaReady,
  getTestKnex,
  closeTestKnex,
  getWorkerSchemaName,
  resetTestSchema
} = require('./utils/db-cleanup');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-jest-testing-only';
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing-only';
process.env.SKIP_RUNTIME_MIGRATIONS = '1';
process.env.TEST_DB_SCHEMA = process.env.TEST_DB_SCHEMA || getWorkerSchemaName();
process.env.DATABASE_URL = withWorkerSchemaInUrl(
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  process.env.TEST_DB_SCHEMA
);
// Many suites also spin up DatabaseManager (separate pool). Keep per-process pools small to avoid PG "too many clients".
if (!process.env.PG_POOL_MAX) {
  process.env.PG_POOL_MAX = '10';
}

// Make test utilities available globally
global.testHelpers = require('./utils/test-helpers');
global.testDataFactory = require('./utils/test-data-factory');
global.testServerManager = require('./utils/test-server-manager');
global.getTestKnex = getTestKnex;

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

  // Stop all test servers
  try {
    if (global.testServerManager) {
      await global.testServerManager.stopAllServers();
    }
  } catch (error) {
    // Ignore errors if test server manager isn't available
  }

  try {
    await resetTestSchema();
  } finally {
    await closeTestKnex();
  }
});

beforeAll(async () => {
  await resetTestSchema();
});

// Note: a global beforeEach() truncate is intentionally NOT registered.
// Many integration suites set up shared data in their own beforeAll() and
// would be broken by inter-test truncation. Suites that need per-test
// isolation should call resetTestSchema() (or a targeted cleanup) explicitly.

/**
 * Backward-compatible helpers used by older suites that import from tests/setup.
 */
async function setupTestDatabase() {
  await resetTestSchema();
  return getTestKnex();
}

async function teardownTestDatabase(db) {
  if (db && db !== getTestKnex() && typeof db.destroy === 'function') {
    await db.destroy();
    return;
  }
  await resetTestSchema();
}

module.exports = {
  setupTestDatabase,
  teardownTestDatabase,
  getTestKnex
};
