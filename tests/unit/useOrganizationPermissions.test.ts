import { useOrganizationPermissions } from '../../client/src/hooks/useOrganizationPermissions';
import type { Organization, OrganizationGovernanceRules, User } from '../../client/src/types';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Member',
    email: 'member@example.com',
    role: 'user',
    ...overrides,
  } as User;
}

function buildOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Test Org',
    representatives: [],
    members: [{ userId: 'user-1', status: 'active' }],
    ...overrides,
  } as Organization;
}

function buildRules(overrides: Partial<OrganizationGovernanceRules> = {}): OrganizationGovernanceRules {
  return {
    bootstrapMode: false,
    recoveryMode: false,
    membersCanCreateDocuments: false,
    membersCanProposeRules: false,
    membersCanInitializeElections: false,
    membersCanInviteMembers: false,
    membersCanManageRuleProposals: false,
    representativeCanInviteMembers: true,
    representativeCanCreateVotes: true,
    ...overrides,
  } as OrganizationGovernanceRules;
}

describe('useOrganizationPermissions', () => {
  it('denies document creation for members when rules are unknown', () => {
    const permissions = useOrganizationPermissions(buildUser(), buildOrganization(), null);

    expect(permissions.canCreateDocuments).toBe(false);
    expect(permissions.canInviteMembers).toBe(false);
    expect(permissions.canCreateElections).toBe(false);
  });

  it('denies document creation for members after bootstrap with rule disabled', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization(),
      buildRules({ bootstrapMode: false, membersCanCreateDocuments: false })
    );

    expect(permissions.canCreateDocuments).toBe(false);
  });

  it('allows document creation for members in bootstrap mode', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization(),
      buildRules({ bootstrapMode: true })
    );

    expect(permissions.canCreateDocuments).toBe(true);
  });

  it('allows document creation for representatives regardless of member rules', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization({ representatives: ['user-1'] }),
      buildRules({ bootstrapMode: false, membersCanCreateDocuments: false })
    );

    expect(permissions.canCreateDocuments).toBe(true);
  });

  it('denies invites when representatives cannot invite members', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization({ representatives: ['user-1'] }),
      buildRules({ representativeCanInviteMembers: false })
    );

    expect(permissions.canInviteMembers).toBe(false);
  });

  it('allows representatives to start document voting when rule is unset', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization({ representatives: ['user-1'] }),
      buildRules({ representativeCanCreateVotes: undefined })
    );

    expect(permissions.canStartDocumentVoting).toBe(true);
  });

  it('denies representatives from starting document voting when rule is disabled', () => {
    const permissions = useOrganizationPermissions(
      buildUser(),
      buildOrganization({ representatives: ['user-1'] }),
      buildRules({ representativeCanCreateVotes: false })
    );

    expect(permissions.canStartDocumentVoting).toBe(false);
  });
});
