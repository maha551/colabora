const notificationService = require('../../server/modules/notifications');
const { getTestKnex } = require('../utils/db-cleanup');
const { createTestUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let db;
let testUserId;

describe('Notifications Module Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();

    const user = await createTestUser(db, {
      email: `notifications-test-${Date.now()}@example.com`,
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('should get notification preferences', async () => {
    expect(typeof notificationService.getNotificationPreferences).toBe('function');

    const preferences = await notificationService.getNotificationPreferences(db, testUserId);
    expect(preferences).toBeDefined();
  });

  test('should initialize user preferences', async () => {
    expect(typeof notificationService.initializeUserPreferences).toBe('function');

    await expect(
      notificationService.initializeUserPreferences(db, testUserId)
    ).resolves.not.toThrow();
  });

  test('should notify users', async () => {
    expect(typeof notificationService.notifyUsers).toBe('function');

    await expect(
      notificationService.notifyUsers(
        db,
        [testUserId],
        'test_event',
        { message: 'Test notification' },
        false
      )
    ).resolves.not.toThrow();
  });
});
