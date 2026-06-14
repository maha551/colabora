/**
 * Vote Adapter - Centralized mapping between UI vote format and API formats
 *
 * UI uses PRO/NEUTRAL/CONTRA everywhere for consistency.
 * Organization votes API expects yes/no/abstain - adapter maps at API boundary.
 */

/** Canonical vote value used across the UI */
export type VoteValue = 'PRO' | 'NEUTRAL' | 'CONTRA';

/** API format for organization votes (yes/no/abstain) */
export type OrgVoteValue = 'yes' | 'no' | 'abstain';

/** Map PRO/NEUTRAL/CONTRA to organization API format */
export const PRO_CONTRA_TO_YES_NO: Record<VoteValue, OrgVoteValue> = {
  PRO: 'yes',
  NEUTRAL: 'abstain',
  CONTRA: 'no',
};

/** Map organization API format to PRO/NEUTRAL/CONTRA */
export const YES_NO_TO_PRO_CONTRA: Record<OrgVoteValue, VoteValue> = {
  yes: 'PRO',
  abstain: 'NEUTRAL',
  no: 'CONTRA',
};

/**
 * Convert UI vote to organization API format.
 * Use when calling organizationsApi.castVote().
 */
export function toOrgVote(value: VoteValue): OrgVoteValue {
  return PRO_CONTRA_TO_YES_NO[value];
}

/**
 * Convert organization API response to UI format.
 * Use when displaying user's vote from API that returns yes/no/abstain.
 */
export function fromOrgVote(value: OrgVoteValue): VoteValue {
  return YES_NO_TO_PRO_CONTRA[value];
}
