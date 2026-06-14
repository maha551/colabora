const path = require('path');
const DatabaseManager = require('../../server/database/DatabaseManager');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

// Obsolete: bootstrap no longer throws "Missing required bootstrap env vars"; SQLite paths removed.
describe.skip('Production admin bootstrap safety', () => {
  let dbPath;
  let dbManager;
  let originalEnv;

  beforeEach(async () => {
    dbPath = path.join(__dirname, `../../test-admin-bootstrap-${Date.now()}.db`);
    await safeDeleteTestDatabase(dbPath);

    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL,
      ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD,
      ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN
    };
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close().catch(() => {});
      dbManager = null;
    }
    await safeDeleteTestDatabase(dbPath);

    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.ADMIN_BOOTSTRAP_EMAIL = originalEnv.ADMIN_BOOTSTRAP_EMAIL;
    process.env.ADMIN_BOOTSTRAP_PASSWORD = originalEnv.ADMIN_BOOTSTRAP_PASSWORD;
    process.env.ADMIN_BOOTSTRAP_TOKEN = originalEnv.ADMIN_BOOTSTRAP_TOKEN;
  });

  test('fails initialization in production when no admin and bootstrap env vars are missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;

    dbManager = new DatabaseManager({
      NODE_ENV: 'production',
      DATABASE_URL: dbPath
    });

    await expect(dbManager.initialize()).rejects.toThrow(/Missing required bootstrap env vars/);
  });

  test('creates initial admin only when explicit bootstrap env vars are provided', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_BOOTSTRAP_EMAIL = 'owner@example.com';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'VerySecureBootstrapPass123!';
    process.env.ADMIN_BOOTSTRAP_TOKEN = '0123456789abcdef0123456789abcdef';

    dbManager = new DatabaseManager({
      NODE_ENV: 'production',
      DATABASE_URL: dbPath
    });

    await expect(dbManager.initialize()).resolves.toBeDefined();
    const admin = await dbManager.db('users').where('role', 'admin').first();
    expect(admin).toBeDefined();
    expect(admin.email).toBe('owner@example.com');
  });
});
