import {
  formatVoteValue,
  getVoteCounts,
  getVoteProgressCounts,
  getVoteStatusLabel,
  normalizeVoteStatus,
} from '../../client/src/lib/voting';
import {
  getDeletionVoteBreakdown,
  mapDocumentVoteResponse,
  normalizeRuleProposalVoteResponse,
} from '../../client/src/lib/votingAdapters';
import type { VotingStatusResponse } from '../../client/src/lib/api/types/documents';

describe('shared voting helpers', () => {
  it('normalizes vote status values', () => {
    expect(normalizeVoteStatus('voting')).toBe('active');
    expect(normalizeVoteStatus('proposed')).toBe('pending');
    expect(normalizeVoteStatus('finalized')).toBe('completed');
    expect(getVoteStatusLabel('pass')).toBe('Approved');
  });

  it('formats vote values consistently', () => {
    expect(formatVoteValue('defaultVotingDeadlineHours', 12)).toBe('12 hours');
    expect(formatVoteValue('electionQuorumPercentage', 0.66)).toBe('66%');
    expect(formatVoteValue('anonymousVotingEnabled', true)).toBe('Enabled');
    expect(formatVoteValue('minimumVotingPeriodHours', 24)).toBe('24 hours');
    expect(formatVoteValue('minimumQuorumPercentage', 0.1)).toBe('10%');
    expect(formatVoteValue('mistrustVoteThreshold', 75)).toBe('75%');
    expect(formatVoteValue('defaultStructureProposalsEnabled', false)).toBe('Disabled');
  });

  it('counts votes and progress from shared summaries', () => {
    const summary = getVoteCounts([
      { vote: 'PRO' },
      { voteChoice: 'no' },
      { voteChoice: 'abstain' },
      { vote: 'PRO', isPlaceholder: true },
    ]);

    expect(summary).toEqual({ pro: 1, neutral: 1, contra: 1, total: 3 });
    expect(getVoteProgressCounts(summary, 5)).toEqual({
      pro: 1,
      neutral: 1,
      contra: 1,
      total: 3,
      notVoted: 2,
      completionPercent: 60,
    });
  });
});

describe('vote adapters', () => {
  it('maps document vote responses into a unified voting state', () => {
    const prev = {
      document: { id: 'doc-1', title: 'Doc', status: 'voting' },
      voting: {
        totalVotes: 0,
        totalEligibleVoters: 5,
        quorumRequired: 3,
        quorumMet: false,
        voteBreakdown: { PRO: 0, NEUTRAL: 0, CONTRA: 0 },
        approvalRate: 0,
        canVote: true,
      },
    } as VotingStatusResponse;

    const next = mapDocumentVoteResponse(
      prev,
      {
        votes: [
          { userId: 'user-1', vote: 'PRO' },
          { userId: 'user-2', vote: 'CONTRA' },
          { userId: 'user-3', vote: 'PRO' },
        ],
      },
      'user-2'
    );

    expect(next.voting.totalVotes).toBe(3);
    expect(next.voting.voteBreakdown).toEqual({ PRO: 2, NEUTRAL: 0, CONTRA: 1 });
    expect(next.voting.userVote).toBe('CONTRA');
    expect(next.voting.approvalRate).toBeCloseTo(66.666, 2);
  });

  it('derives deletion vote breakdowns without array expansion', () => {
    expect(
      getDeletionVoteBreakdown({
        proposed: true,
        votes: { PRO: 4, NEUTRAL: 2, CONTRA: 1 },
      } as never)
    ).toEqual({ pro: 4, neutral: 2, contra: 1, total: 7 });
  });

  it('normalizes rule proposal api payloads', () => {
    const normalized = normalizeRuleProposalVoteResponse({
      id: 'rule-1',
      title: 'Rule change',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      current_rule_field: 'anonymousVotingEnabled',
      proposed_rule_value: true,
      created_by: 'user-1',
      created_by_name: 'Alice',
      votes_yes: 2,
      votes_no: 1,
      votes_abstain: 0,
      votes_cast: 3,
      total_voters: 5,
      options: [],
      votes: [],
    } as never);

    expect(normalized.ruleField).toBe('anonymousVotingEnabled');
    expect(normalized.proposedValue).toBe(true);
    expect(normalized.createdBy).toEqual({ id: 'user-1', name: 'Alice' });
    expect(normalized.votesYes).toBe(2);
    expect(normalized.votesCast).toBe(3);
  });
});
