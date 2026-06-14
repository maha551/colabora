const { calculateMinimumQuorum, getEffectiveQuorum, getActiveMemberCount } = require('../../server/modules/safety-mechanisms');
const { getTestKnex } = require('../utils/db-cleanup');

describe('Safety Mechanisms Module Tests', () => {
  test('should calculate minimum quorum', () => {
    expect(typeof calculateMinimumQuorum).toBe('function');

    const quorum = calculateMinimumQuorum(10);
    expect(typeof quorum).toBe('number');
    expect(quorum).toBeGreaterThan(0);
  });

  test('should get effective quorum', async () => {
    expect(typeof getEffectiveQuorum).toBe('function');

    // Mock database and governance rules
    const mockDb = {};
    const mockRules = { defaultQuorumPercentage: 0.5 };
    const result = await getEffectiveQuorum(mockDb, 'org-id', mockRules, 10);
    
    expect(result).toHaveProperty('percentage');
    expect(result).toHaveProperty('minimumVotes');
  });

  test('should get active member count', async () => {
    expect(typeof getActiveMemberCount).toBe('function');

    const db = getTestKnex();
    const count = await getActiveMemberCount(db, 'org-id-with-no-members');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

