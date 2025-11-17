import { User, Organization } from '../types';

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
 * Centralizes all permission logic for clean, testable, and maintainable code
 */
export function useOrganizationPermissions(user: User, organization: Organization): OrganizationPermissions {
  // Basic role checks
  const isRepresentative = organization.representatives?.includes(user.id) ?? false;
  const isActiveMember = organization.members?.some(m => m.userId === user.id && m.status === 'active') ?? false;
  const isAdmin = user.role === 'admin';

  // Document permissions
  const canCreateDocuments = isRepresentative || isAdmin; // Only reps can create documents directly
  const canViewAllDocuments = isRepresentative || isActiveMember || isAdmin;

  // Member management permissions
  const canInviteMembers = isRepresentative || isAdmin;
  const canManageMembers = isRepresentative || isAdmin;
  const canViewMemberList = isActiveMember || isRepresentative || isAdmin;

  // Governance permissions
  const canCreateElections = isRepresentative || isAdmin;
  const canManageGovernanceRules = isRepresentative || isAdmin;
  const canProposeRules = isRepresentative || isActiveMember || isAdmin; // Members can propose, reps can create directly
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
    canVoteInElections,

    // Analytics permissions
    canViewAnalytics,
    canExportData,

    // Administrative permissions
    canManageOrganization,
    canDeleteOrganization,
  };
}
