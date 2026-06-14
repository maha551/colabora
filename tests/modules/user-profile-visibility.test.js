const { v4: uuidv4 } = require('uuid');
const { getTestKnex } = require('../utils/db-cleanup');
const { createTestUser, safeDeleteTestDatabase } = require('../utils/test-helpers');
const { ensureSystemUser } = require('../../server/database/ensureSystemUser');
const { SYSTEM_USER_ID } = require('../../server/utils/auditUserIds');
const UserProfileService = require('../../server/services/UserProfileService');

let db;
let aliceId;
let bobId;
let organizationId;

describe('UserProfileService visibility', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();
    await ensureSystemUser(db);

    const alice = await createTestUser(db, {
      email: `alice-vis-${Date.now()}@example.com`,
      name: 'Alice Visibility',
    });
    const bob = await createTestUser(db, {
      email: `bob-vis-${Date.now()}@example.com`,
      name: 'Bob Visibility',
    });
    aliceId = alice.id;
    bobId = bob.id;

    organizationId = uuidv4();
    await db('organizations').insert({
      id: organizationId,
      name: 'Visibility Test Org',
      description: '',
      representatives: JSON.stringify([aliceId]),
      membership_policy: 'invitation',
      voting_enabled: false,
      voting_threshold: 0.5,
      is_active: true,
      created_by_admin_id: SYSTEM_USER_ID,
      created_at: db.fn.now(),
    });

    await db('organization_members').insert([
      {
        id: uuidv4(),
        organization_id: organizationId,
        user_id: aliceId,
        status: 'active',
        joined_at: db.fn.now(),
      },
      {
        id: uuidv4(),
        organization_id: organizationId,
        user_id: bobId,
        status: 'active',
        joined_at: db.fn.now(),
      },
    ]);

    await db('organization_representatives').insert({
      id: uuidv4(),
      organization_id: organizationId,
      user_id: aliceId,
      status: 'active',
      added_at: db.fn.now(),
    });
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('representatives visibility allows self and reps, not plain co-org members', async () => {
    expect(await UserProfileService.canViewWithVisibility(db, aliceId, aliceId, 'representatives')).toBe(true);
    expect(await UserProfileService.canViewWithVisibility(db, aliceId, bobId, 'representatives')).toBe(true);
    expect(await UserProfileService.canViewWithVisibility(db, bobId, aliceId, 'representatives')).toBe(false);
  });

  test('org_members visibility allows co-org members', async () => {
    expect(await UserProfileService.canViewWithVisibility(db, bobId, aliceId, 'org_members')).toBe(true);
  });

  test('hidden visibility is denied to non-self viewers', async () => {
    expect(await UserProfileService.canViewWithVisibility(db, bobId, aliceId, 'hidden')).toBe(false);
  });

  test('filterProfileDataForViewer hides representatives-only links from members', async () => {
    const profileData = {
      links: [
        { type: 'github', url: 'https://github.com/alice', visibility: 'representatives' },
        { type: 'website', url: 'https://hidden.example.com', visibility: 'hidden' },
        { type: 'website', url: 'https://example.com', visibility: 'org_members' },
      ],
    };

    const filtered = await UserProfileService.filterProfileDataForViewer(
      db,
      bobId,
      aliceId,
      profileData,
      'alice@example.com',
      organizationId
    );

    const urls = (filtered.links || []).map((l) => l.url);
    expect(urls).toContain('https://example.com');
    expect(urls).not.toContain('https://github.com/alice');
    expect(urls).not.toContain('https://hidden.example.com');
  });

  test('representatives-only fields respect organization context when caller is rep elsewhere', async () => {
    const otherOrgId = uuidv4();
    await db('organizations').insert({
      id: otherOrgId,
      name: 'Other Rep Org',
      description: '',
      representatives: JSON.stringify([bobId]),
      membership_policy: 'invitation',
      voting_enabled: false,
      voting_threshold: 0.5,
      is_active: true,
      created_by_admin_id: SYSTEM_USER_ID,
      created_at: db.fn.now(),
    });
    await db('organization_members').insert([
      {
        id: uuidv4(),
        organization_id: otherOrgId,
        user_id: aliceId,
        status: 'active',
        joined_at: db.fn.now(),
      },
      {
        id: uuidv4(),
        organization_id: otherOrgId,
        user_id: bobId,
        status: 'active',
        joined_at: db.fn.now(),
      },
    ]);
    await db('organization_representatives').insert({
      id: uuidv4(),
      organization_id: otherOrgId,
      user_id: bobId,
      status: 'active',
      added_at: db.fn.now(),
    });

    const profileData = {
      links: [{ type: 'github', url: 'https://github.com/alice', visibility: 'representatives' }],
    };

    const withoutContext = await UserProfileService.filterProfileDataForViewer(
      db,
      bobId,
      aliceId,
      profileData,
      'alice@example.com'
    );
    expect((withoutContext.links || []).map((l) => l.url)).toContain('https://github.com/alice');

    const withOrgContext = await UserProfileService.filterProfileDataForViewer(
      db,
      bobId,
      aliceId,
      profileData,
      'alice@example.com',
      organizationId
    );
    expect((withOrgContext.links || []).map((l) => l.url)).not.toContain('https://github.com/alice');
  });
});
