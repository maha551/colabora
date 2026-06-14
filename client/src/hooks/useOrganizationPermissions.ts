import { User, Organization, OrganizationGovernanceRules } from '../types';

export interface OrganizationPermissions {
  // Basic roles
  isRepresentative: boolean;
  isActiveMember: boolean;

  // Document permissions
  canCreateDocuments: boolean;
  canViewAllDocuments: boolean;

  // Member management permissions
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canViewMemberList: boolean;

  // Governance permissions
  canCreateElections: boolean;
  canManageGovernanceRules: boolean;
  canProposeRules: boolean;
  canManageRuleProposals: boolean;
  canStartDocumentVoting: boolean;
  canVoteInElections: boolean;

  // Analytics permissions
  canViewAnalytics: boolean;
  canExportData: boolean;

  // Administrative permissions
  canManageOrganization: boolean;
  canDeleteOrganization: boolean;
}

function isRuleDisabled(value: unknown): boolean {
  return value === false || value === 0;
}

/**
 * Custom hook for determining user permissions within an organization.
 * Logic mirrors server/modules/permissions.js so UI actions match API enforcement.
 */
export function useOrganizationPermissions(
  user: User,
  organization: Organization,
  governanceRules: OrganizationGovernanceRules | null = null
): OrganizationPermissions {
  const isRepresentative = organization.representatives?.includes(user.id) ?? false;
  const isActiveMember =
    organization.members?.some((m) => m.userId === user.id && m.status === 'active') ?? false;
  const isAdmin = user.role === 'admin';

  const bootstrapMode = governanceRules?.bootstrapMode;
  const recoveryMode = governanceRules?.recoveryMode;

  const canProposeRules =
    isAdmin ||
    (!!bootstrapMode && isActiveMember) ||
    (!!recoveryMode && isActiveMember) ||
    (!!governanceRules?.membersCanProposeRules && isActiveMember) ||
    isRepresentative;

  const canCreateDocuments =
    isAdmin ||
    (!!bootstrapMode && isActiveMember) ||
    (!!recoveryMode && isActiveMember) ||
    (!!governanceRules?.membersCanCreateDocuments && isActiveMember) ||
    isRepresentative;

  let canInitializeElections = false;
  if (isAdmin) {
    canInitializeElections = true;
  } else if (bootstrapMode) {
    canInitializeElections = isRepresentative;
  } else if (recoveryMode && isActiveMember) {
    canInitializeElections = true;
  } else if (governanceRules?.membersCanInitializeElections && isActiveMember) {
    canInitializeElections = true;
  } else if (isRepresentative) {
    canInitializeElections = true;
  }

  let canInviteMembers = false;
  if (isAdmin) {
    canInviteMembers = true;
  } else if (governanceRules?.representativeCanInviteMembers) {
    if (bootstrapMode) {
      canInviteMembers = isRepresentative;
    } else if (recoveryMode && isActiveMember) {
      canInviteMembers = true;
    } else if (governanceRules.membersCanInviteMembers && isActiveMember) {
      canInviteMembers = true;
    } else if (isRepresentative) {
      canInviteMembers = true;
    }
  }

  let canManageRuleProposals = false;
  if (isAdmin) {
    canManageRuleProposals = true;
  } else if (bootstrapMode) {
    canManageRuleProposals = isRepresentative;
  } else if (recoveryMode && isActiveMember) {
    canManageRuleProposals = true;
  } else if (governanceRules?.membersCanManageRuleProposals && isActiveMember) {
    canManageRuleProposals = true;
  } else if (isRepresentative) {
    canManageRuleProposals = true;
  }

  let canStartDocumentVoting = false;
  if (isAdmin) {
    canStartDocumentVoting = true;
  } else if (!isRuleDisabled(governanceRules?.representativeCanCreateVotes)) {
    canStartDocumentVoting = isRepresentative;
  }

  const canViewAllDocuments = isRepresentative || isActiveMember || isAdmin;
  const canManageMembers = isRepresentative || isAdmin;
  const canViewMemberList = isActiveMember || isRepresentative || isAdmin;
  const canCreateElections = canInitializeElections;
  const canManageGovernanceRules = isRepresentative || isAdmin;
  const canVoteInElections = isActiveMember || isRepresentative || isAdmin;
  const canViewAnalytics = isRepresentative || isActiveMember || isAdmin;
  const canExportData = isRepresentative || isAdmin;
  const canManageOrganization = isRepresentative || isAdmin;
  const canDeleteOrganization = isAdmin;

  return {
    isRepresentative,
    isActiveMember,
    canCreateDocuments,
    canViewAllDocuments,
    canInviteMembers,
    canManageMembers,
    canViewMemberList,
    canCreateElections,
    canManageGovernanceRules,
    canProposeRules,
    canManageRuleProposals,
    canStartDocumentVoting,
    canVoteInElections,
    canViewAnalytics,
    canExportData,
    canManageOrganization,
    canDeleteOrganization,
  };
}
