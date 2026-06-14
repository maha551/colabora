const HealthService = require('../../server/modules/health');
const config = require('../../server/config');
const { getTestKnex } = require('../utils/db-cleanup');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let db;
let healthService;

describe('Health Module Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();
    healthService = new HealthService(config, db);
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('should get basic health status', async () => {
    const health = await healthService.getBasicHealth();
    expect(health).toHaveProperty('status');
    expect(health.status).toBe('healthy');
  });

  test('should get detailed health status', async () => {
    const health = await healthService.getDetailedHealth();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('checks');
    expect(health.checks).toHaveProperty('database');
    expect(health).toHaveProperty('uptime');
  });

  test('should check database connectivity', async () => {
    const health = await healthService.getDetailedHealth();
    expect(health.checks.database).toBeDefined();
  });
});
