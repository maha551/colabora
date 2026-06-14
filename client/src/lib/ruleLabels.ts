/**
 * Shared rule field labels and descriptions.
 * Single source of truth for governance rule display across RepresentativesTab,
 * GovernanceTab, RuleMetadataDisplay, RuleProposalVotingInterface, RuleProposalDialog,
 * RuleHistoryView, BootstrapModeBanner, and GovernanceRulesVotingInterface.
 */

export interface RuleDisplayInfo {
  label: string;
  description: string;
}

const RULE_LABELS: Record<string, RuleDisplayInfo> = {
  representativeTermMonths: {
    label: 'Representative Term Length',
    description: 'How long representatives serve before needing re-election',
  },
  representativeTermLimits: {
    label: 'Representative Term Limits',
    description: 'Maximum consecutive terms (empty = no limit)',
  },
  electionVotingMethod: {
    label: 'Election Voting Method',
    description: 'How votes are counted in elections',
  },
  electionQuorumPercentage: {
    label: 'Election Quorum',
    description: 'Minimum participation required for valid election',
  },
  electionNoticeDays: {
    label: 'Election Notice Period',
    description: 'Days notice before election starts',
  },
  defaultVotingDeadlineHours: {
    label: 'Default Voting Deadline',
    description: 'Default time for votes to remain open',
  },
  defaultQuorumPercentage: {
    label: 'Default Quorum',
    description: 'Minimum participation for non-election votes',
  },
  defaultAcceptanceThreshold: {
    label: 'Document Acceptance Threshold',
    description: 'Percentage of PRO votes required for document proposals to be automatically accepted (1-100%)',
  },
  documentProposalPeriodDays: {
    label: 'Document Proposal Period',
    description: 'Number of days documents remain in proposal status before voting begins',
  },
  paragraphProposalCutoffDays: {
    label: 'Paragraph Proposal Cutoff',
    description: 'Days before proposal deadline when new paragraph proposals are locked',
  },
  thresholdCalculationMethod: {
    label: 'Threshold Calculation Method',
    description: 'How approval percentage is calculated: "All Votes" uses percentage of votes cast, "All Members" uses percentage of all eligible members',
  },
  anonymousVotingEnabled: {
    label: 'Anonymous Voting',
    description: 'Hide voter identities by default',
  },
  voteChangeAllowed: {
    label: 'Vote Changes Allowed',
    description: 'Allow members to change their votes',
  },
  representativeCanCreateVotes: {
    label: 'Representatives Can Create Votes',
    description: 'Representatives can create votes for organizational decisions',
  },
  representativeCanInviteMembers: {
    label: 'Representatives Can Invite Members',
    description: 'Representatives can send membership invitations',
  },
  representativeCanManageDocuments: {
    label: 'Representatives Can Manage Documents',
    description: 'Representatives can create and manage organization documents',
  },
  representativeApprovalRequired: {
    label: 'Representative Approval Required',
    description: 'Representative approval needed for major actions',
  },
  tamperProofEnabled: {
    label: 'Tamper-Proof Records',
    description: 'Cryptographically verify vote integrity',
  },
  auditTrailEnabled: {
    label: 'Audit Trail',
    description: 'Log all governance actions',
  },
  membersCanProposeRules: {
    label: 'Members Can Propose Rules',
    description: 'Allow members to propose rule changes',
  },
  membersCanCreateDocuments: {
    label: 'Members Can Create Documents',
    description: 'Allow members to create documents',
  },
  membersCanInitializeElections: {
    label: 'Members Can Initialize Elections',
    description: 'Allow members to start elections',
  },
  membersCanInviteMembers: {
    label: 'Members Can Invite Members',
    description: 'Allow members to invite others',
  },
  membersCanManageRuleProposals: {
    label: 'Members Can Manage Rule Proposals',
    description: 'Allow members to manage rule proposals',
  },
  membersCanProposeRulesThreshold: {
    label: 'Members Can Propose Rules Threshold',
    description: 'Minimum approval percentage (0-100%) required when members propose rule changes',
  },
  membersCanCreateDocumentsThreshold: {
    label: 'Members Can Create Documents Threshold',
    description: 'Minimum approval percentage (0-100%) required when members create documents',
  },
  membersCanInitializeElectionsThreshold: {
    label: 'Members Can Initialize Elections Threshold',
    description: 'Minimum approval percentage (0-100%) required when members initialize elections',
  },
  membersCanInviteMembersThreshold: {
    label: 'Members Can Invite Members Threshold',
    description: 'Minimum approval percentage (0-100%) required when members invite new members',
  },
  membersCanManageRuleProposalsThreshold: {
    label: 'Members Can Manage Rule Proposals Threshold',
    description: 'Minimum approval percentage (0-100%) required when members manage rule proposals',
  },
  defaultStructureProposalsEnabled: {
    label: 'Default Structure Proposals Enabled',
    description: 'Whether new documents allow structure proposals by default',
  },
  defaultVotingAnonymityLocked: {
    label: 'Default Voting Anonymity Locked',
    description: 'Whether anonymity settings are locked by default on new documents',
  },
  minimumQuorumPercentage: {
    label: 'Minimum Quorum',
    description: 'Floor for participation required before votes can pass (organization-configurable)',
  },
  minimumApprovalThreshold: {
    label: 'Minimum Approval Threshold',
    description: 'Floor for approval percentage required before votes can pass (organization-configurable)',
  },
  minimumVotingPeriodHours: {
    label: 'Minimum Voting Period',
    description: 'Minimum hours voting must remain open before it can close',
  },
  membersCanInitiateMistrustVote: {
    label: 'Members Can Initiate Mistrust Vote',
    description: 'Allow members to initiate votes to remove representatives',
  },
  mistrustVoteThreshold: {
    label: 'Mistrust Vote Threshold',
    description: 'Percentage of PRO votes required to remove a representative via mistrust vote',
  },
  mistrustVoteQuorumPercentage: {
    label: 'Mistrust Vote Quorum',
    description: 'Minimum participation required for a valid mistrust vote',
  },
};

/** All known governance rule field keys (for selects and filters). */
export const RULE_FIELD_KEYS = Object.keys(RULE_LABELS);

/**
 * Returns the display label for a rule field.
 * Prefer useRuleLabels() in React components for i18n.
 */
export function getRuleLabel(field: string): string {
  return RULE_LABELS[field]?.label ?? field;
}

/**
 * Returns label and description for a rule field.
 */
export function getRuleDisplayInfo(field: string): RuleDisplayInfo {
  return RULE_LABELS[field] ?? { label: field, description: '' };
}
