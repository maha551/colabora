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
  canVoteInElections: boolean;

  // Analytics permissions
  canViewAnalytics: boolean;
  canExportData: boolean;

  // Administrative permissions
  canManageOrganization: boolean;
  canDeleteOrganization: boolean;
}

/**
 * Custom hook for determining user permissions within an organization
 * Now supports dynamic permissions based on governance rules
 */
export function useOrganizationPermissions(
  user: User,
  organization: Organization,
  governanceRules: OrganizationGovernanceRules | null = null
): OrganizationPermissions {
  // Basic role checks
  const isRepresentative = organization.representatives?.includes(user.id) ?? false;
  const isActiveMember = organization.members?.some(m => m.userId === user.id && m.status === 'active') ?? false;
  const isAdmin = user.role === 'admin';

  // Bootstrap mode check
  const isBootstrap = governanceRules?.bootstrapMode ?? true; // Default to true for new orgs
  const isRecovery = governanceRules?.recoveryMode ?? false;

  // Dynamic permissions based on governance rules
  const canProposeRules = isAdmin ||
    (isBootstrap && isActiveMember) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanProposeRules && isActiveMember) ||
    isRepresentative;

  const canCreateDocuments = isAdmin ||
    (isBootstrap && isActiveMember) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanCreateDocuments && isActiveMember) ||
    isRepresentative;

  const canInitializeElections = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanInitializeElections && isActiveMember) ||
    isRepresentative;

  const canInviteMembers = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanInviteMembers && isActiveMember && governanceRules?.representativeCanInviteMembers === true) ||
    (isRepresentative && governanceRules?.representativeCanInviteMembers === true);

  const canManageRuleProposals = isAdmin ||
    (isBootstrap && isRepresentative) ||
    (isRecovery && isActiveMember) ||
    (governanceRules?.membersCanManageRuleProposals && isActiveMember) ||
    isRepresentative;

  // Document permissions
  const canViewAllDocuments = isRepresentative || isActiveMember || isAdmin;

  // Member management permissions
  const canManageMembers = isRepresentative || isAdmin;
  const canViewMemberList = isActiveMember || isRepresentative || isAdmin;

  // Governance permissions
  const canCreateElections = canInitializeElections;
  const canManageGovernanceRules = isRepresentative || isAdmin;
  const canVoteInElections = isActiveMember || isRepresentative || isAdmin;

  // Analytics permissions
  const canViewAnalytics = isRepresentative || isActiveMember || isAdmin;
  const canExportData = isRepresentative || isAdmin;

  // Administrative permissions
  const canManageOrganization = isRepresentative || isAdmin;
  const canDeleteOrganization = isAdmin; // Only admins can delete organizations

  return {
    // Basic roles
    isRepresentative,
    isActiveMember,

    // Document permissions
    canCreateDocuments,
    canViewAllDocuments,

    // Member management permissions
    canInviteMembers,
    canManageMembers,
    canViewMemberList,

    // Governance permissions
    canCreateElections,
    canManageGovernanceRules,
    canProposeRules,
    canManageRuleProposals,
    canVoteInElections,

    // Analytics permissions
    canViewAnalytics,
    canExportData,

    // Administrative permissions
    canManageOrganization,
    canDeleteOrganization,
  };
}
