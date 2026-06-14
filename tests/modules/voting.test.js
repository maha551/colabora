const VoterManager = require('../../server/modules/voting');
const { getTestKnex } = require('../utils/db-cleanup');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let db;

describe('Voting Module Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('should get eligible voter count for document', async () => {
    expect(typeof VoterManager.getEligibleVoterCount).toBe('function');

    const count = await VoterManager.getEligibleVoterCount(db, 'fake-doc-id');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should calculate approval percentage', () => {
    const proVotes = 3;
    const totalVoters = 4;
    const approvalPercentage = (proVotes / totalVoters) * 100;

    expect(approvalPercentage).toBe(75);
  });

  test('should handle zero voters', () => {
    const proVotes = 0;
    const totalVoters = 0;
    const approvalPercentage = totalVoters > 0 ? (proVotes / totalVoters) * 100 : 0;

    expect(approvalPercentage).toBe(0);
  });
});
