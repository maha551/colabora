const { canInviteMembers, canStartDocumentVoting, isActiveMember } = require('../../server/modules/permissions');
const { getTestKnex } = require('../utils/db-cleanup');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let db;

describe('Permissions Module Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('should check if user is active member', async () => {
    expect(typeof isActiveMember).toBe('function');

    const result = await isActiveMember(db, 'fake-user-id', 'fake-org-id');
    expect(typeof result).toBe('boolean');
  });

  test('should check if user can invite members', async () => {
    expect(typeof canInviteMembers).toBe('function');

    const rules = {
      representativeCanInviteMembers: true
    };

    const result = await canInviteMembers(db, 'fake-user-id', 'fake-org-id', rules, 'user');
    expect(typeof result).toBe('boolean');
  });

  test('should check if user can start document voting', async () => {
    expect(typeof canStartDocumentVoting).toBe('function');

    const adminResult = await canStartDocumentVoting(db, 'any-user', 'any-org', null, 'admin');
    expect(adminResult).toBe(true);

    const rulesDisabled = { representativeCanCreateVotes: false };
    const resultDisabled = await canStartDocumentVoting(db, 'fake-user-id', 'fake-org-id', rulesDisabled, 'user');
    expect(resultDisabled).toBe(false);

    const rulesEnabled = { representativeCanCreateVotes: true };
    const resultMember = await canStartDocumentVoting(db, 'fake-user-id', 'fake-org-id', rulesEnabled, 'user');
    expect(typeof resultMember).toBe('boolean');
  });
});
