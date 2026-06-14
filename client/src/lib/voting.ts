export type UnifiedVoteValue = 'PRO' | 'NEUTRAL' | 'CONTRA';
export type LegacyVoteChoice = 'yes' | 'no' | 'abstain' | UnifiedVoteValue;

export type UnifiedVoteStatus =
  | 'draft'
  | 'active'
  | 'pending'
  | 'verified'
  | 'completed'
  | 'approved'
  | 'implemented'
  | 'applied'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface VoteCountSummary {
  pro: number;
  neutral: number;
  contra: number;
  total: number;
}

export interface VoteLike {
  vote?: UnifiedVoteValue;
  voteChoice?: LegacyVoteChoice;
  isPlaceholder?: boolean;
}

const NUMBER_FIELDS = new Set([
  'representativeTermMonths',
  'representativeTermLimits',
  'electionNoticeDays',
  'defaultVotingDeadlineHours',
  'documentProposalPeriodDays',
  'paragraphProposalCutoffDays',
  'minimumVotingPeriodHours',
]);

const PERCENTAGE_FIELDS = new Set([
  'electionQuorumPercentage',
  'defaultQuorumPercentage',
  'minimumQuorumPercentage',
  'minimumApprovalThreshold',
  'mistrustVoteQuorumPercentage',
  'membersCanProposeRulesThreshold',
  'membersCanCreateDocumentsThreshold',
  'membersCanInitializeElectionsThreshold',
  'membersCanInviteMembersThreshold',
  'membersCanManageRuleProposalsThreshold',
]);

const PERCENTAGE100_FIELDS = new Set([
  'defaultAcceptanceThreshold',
  'mistrustVoteThreshold',
]);

const BOOLEAN_FIELDS = new Set([
  'anonymousVotingEnabled',
  'voteChangeAllowed',
  'representativeCanCreateVotes',
  'representativeCanInviteMembers',
  'representativeCanManageDocuments',
  'representativeApprovalRequired',
  'tamperProofEnabled',
  'auditTrailEnabled',
  'defaultStructureProposalsEnabled',
  'defaultVotingAnonymityLocked',
  'membersCanProposeRules',
  'membersCanCreateDocuments',
  'membersCanInitializeElections',
  'membersCanInviteMembers',
  'membersCanManageRuleProposals',
  'membersCanInitiateMistrustVote',
]);

const ACTIVE_STATUSES = new Set(['active', 'pending', 'verified']);
const SUCCESS_STATUSES = new Set(['approved', 'implemented', 'applied', 'completed']);
const ERROR_STATUSES = new Set(['rejected', 'expired', 'cancelled']);

export function normalizeVoteValue(value?: string | null): UnifiedVoteValue {
  if (value === 'yes' || value === 'PRO') return 'PRO';
  if (value === 'no' || value === 'CONTRA') return 'CONTRA';
  return 'NEUTRAL';
}

export function normalizeVoteChoice(value?: string | null): LegacyVoteChoice {
  return normalizeVoteValue(value) as LegacyVoteChoice;
}

export function voteChoiceToUnifiedValue(value?: string | null): UnifiedVoteValue {
  return normalizeVoteValue(value);
}

export function isVoteActive(status?: string | null): boolean {
  return !!status && ACTIVE_STATUSES.has(status.toLowerCase());
}

export function isVoteSuccessful(status?: string | null): boolean {
  return !!status && SUCCESS_STATUSES.has(status.toLowerCase());
}

export function isVoteTerminal(status?: string | null): boolean {
  return !!status && (SUCCESS_STATUSES.has(status.toLowerCase()) || ERROR_STATUSES.has(status.toLowerCase()));
}

export function normalizeVoteStatus(status?: string | null): UnifiedVoteStatus {
  const normalized = (status ?? 'draft').toLowerCase();
  if (normalized === 'voting') return 'active';
  if (normalized === 'proposed') return 'pending';
  if (normalized === 'opened') return 'active';
  if (normalized === 'finalized') return 'completed';
  if (normalized === 'complete') return 'completed';
  if (normalized === 'done') return 'completed';
  if (normalized === 'pass') return 'approved';
  if (normalized === 'fail') return 'rejected';
  if (normalized === 'implementation') return 'implemented';
  if (
    normalized === 'draft' ||
    normalized === 'active' ||
    normalized === 'pending' ||
    normalized === 'verified' ||
    normalized === 'completed' ||
    normalized === 'approved' ||
    normalized === 'implemented' ||
    normalized === 'applied' ||
    normalized === 'rejected' ||
    normalized === 'expired' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }
  return 'draft';
}

export function getVoteStatusLabel(status?: string | null): string {
  switch (normalizeVoteStatus(status)) {
    case 'draft':
      return 'Draft';
    case 'active':
      return 'Voting Active';
    case 'pending':
      return 'Pending';
    case 'verified':
      return 'Verified';
    case 'completed':
      return 'Completed';
    case 'approved':
      return 'Approved';
    case 'implemented':
      return 'Implemented';
    case 'applied':
      return 'Applied';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Draft';
  }
}

export function getVoteStatusTone(status?: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (normalizeVoteStatus(status)) {
    case 'active':
    case 'pending':
    case 'verified':
      return 'default';
    case 'approved':
    case 'implemented':
    case 'applied':
    case 'completed':
      return 'default';
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'destructive';
    case 'draft':
    default:
      return 'secondary';
  }
}

export function formatVoteValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return 'Not set';

  if (NUMBER_FIELDS.has(field)) {
    const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
    const unit = field.includes('Hours') ? 'hours' : field.includes('Days') ? 'days' : 'months';
    return `${numValue} ${unit}`;
  }

  if (PERCENTAGE_FIELDS.has(field)) {
    const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
    return `${Math.round(numValue * 100)}%`;
  }

  if (PERCENTAGE100_FIELDS.has(field)) {
    const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
    return `${Math.round(numValue)}%`;
  }

  if (BOOLEAN_FIELDS.has(field)) {
    const boolValue = typeof value === 'boolean' ? value : value === 'true' || value === true;
    return boolValue ? 'Enabled' : 'Disabled';
  }

  if (field === 'electionVotingMethod') {
    const strValue = String(value);
    return strValue.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return String(value);
}

export function getVoteCounts(votes: VoteLike[] = []): VoteCountSummary {
  return votes.reduce<VoteCountSummary>(
    (acc, vote) => {
      if (vote.isPlaceholder) {
        return acc;
      }
      if (vote.vote) {
        if (vote.vote === 'PRO') acc.pro += 1;
        if (vote.vote === 'NEUTRAL') acc.neutral += 1;
        if (vote.vote === 'CONTRA') acc.contra += 1;
      } else if (vote.voteChoice) {
        const unified = voteChoiceToUnifiedValue(vote.voteChoice);
        if (unified === 'PRO') acc.pro += 1;
        if (unified === 'NEUTRAL') acc.neutral += 1;
        if (unified === 'CONTRA') acc.contra += 1;
      }
      acc.total += 1;
      return acc;
    },
    { pro: 0, neutral: 0, contra: 0, total: 0 }
  );
}

export function getVoteCompletionPercent(totalVotes: number, totalEligible: number): number {
  if (totalEligible <= 0) return 0;
  return Math.min((totalVotes / totalEligible) * 100, 100);
}

export function getVoteProgressCounts(summary: VoteCountSummary, totalEligible: number) {
  const notVoted = totalEligible > 0 ? Math.max(totalEligible - summary.total, 0) : 0;
  return {
    ...summary,
    notVoted,
    completionPercent: getVoteCompletionPercent(summary.total, totalEligible),
  };
}

