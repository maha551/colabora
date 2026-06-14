/**
 * Vote quorum utilities - mirrors backend logic from server/routes/organizations.js
 * Used for UI disable/tooltip on Complete vote button when quorum not met
 */
import type { OrganizationVote, Organization, OrganizationGovernanceRules } from '../types';

/**
 * Compute whether participation threshold (quorum) is met for an organization vote.
 * Mirrors logic from server/routes/organizations.js lines 2405-2435.
 *
 * @param vote - Organization vote with resultYes, resultNo, resultAbstain
 * @param organization - Organization with members (filtered to active for count)
 * @param governanceRules - Governance rules for quorum percentage (defaultQuorumPercentage, mistrustVoteQuorumPercentage)
 * @returns true if total votes cast >= quorum required
 */
export function computeOrgVoteQuorumMet(
  vote: OrganizationVote,
  organization: Organization | null | undefined,
  governanceRules: OrganizationGovernanceRules | null | undefined
): boolean {
  const totalVotes =
    (vote.resultYes ?? 0) + (vote.resultNo ?? 0) + (vote.resultAbstain ?? 0);
  if (totalVotes === 0) return false;

  const memberCount =
    organization?.members?.filter((m) => m.status === 'active').length ?? 0;
  if (memberCount === 0) return false;

  const isMistrustVote = vote.voteType === 'representative_removal';
  const quorumPercentage = isMistrustVote
    ? (governanceRules?.mistrustVoteQuorumPercentage ?? 0.5)
    : (governanceRules?.defaultQuorumPercentage ?? 0.5);

  const quorumRequired = Math.ceil(memberCount * quorumPercentage);
  return totalVotes >= quorumRequired;
}
