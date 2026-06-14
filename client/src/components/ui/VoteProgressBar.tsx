import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '../../types';
import { VoteResultsDisplay } from '../shared/VoteResultsDisplay';
import { getVoteCounts, getVoteProgressCounts, type VoteCountSummary } from '../../lib/voting';
import { VOTE } from '../../lib/designSystem';
import { DecisionVoteBarTrack } from './DecisionVoteBarTrack';

interface VoteProgressBarProps {
  /** 'proposal' (default): 4-segment bar. 'election': 2-segment cast vs not cast */
  variant?: 'proposal' | 'election';
  // Vote data - can be in different formats (for proposal variant)
  votes?: Array<{
    userId?: string;
    vote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
    voteChoice?: 'yes' | 'no' | 'abstain';
    user?: {
      id: string;
      name: string;
    };
    isPlaceholder?: boolean;
  }>;
  // Or aggregated counts (for rule proposals)
  aggregatedCounts?: {
    pro?: number;
    neutral?: number;
    contra?: number;
    yes?: number;
    no?: number;
    abstain?: number;
  };
  totalEligibleVoters: number;
  /** For election variant: number of votes cast */
  votesCast?: number;
  /** For election variant: total eligible voters */
  totalVoters?: number;
  allCollaborators?: User[];
  isAnonymous?: boolean;
  className?: string;
  /** When true, hide the expanded vote counter (Approve/Neutral/Reject) - used for amendment proposals */
  hideExpandedCounter?: boolean;
  /** When false, bar is read-only (archive cards). Default true. */
  interactive?: boolean;
  /** When true, always show compact counts below the bar (archive cards). */
  showCountsBelow?: boolean;
}

function VoteProgressBarComponent({
  variant = 'proposal',
  votes = [],
  aggregatedCounts,
  totalEligibleVoters,
  votesCast = 0,
  totalVoters = 0,
  allCollaborators = [],
  isAnonymous = false,
  className = '',
  hideExpandedCounter = false,
  interactive = true,
  showCountsBelow = false,
}: VoteProgressBarProps) {
  const { t } = useTranslation('common');
  const [showVoteDetails, setShowVoteDetails] = useState(false);

  const voteSummary = useMemo<VoteCountSummary>(() => {
    if (aggregatedCounts) {
      const pro = aggregatedCounts.pro ?? aggregatedCounts.yes ?? 0;
      const neutral = aggregatedCounts.neutral ?? aggregatedCounts.abstain ?? 0;
      const contra = aggregatedCounts.contra ?? aggregatedCounts.no ?? 0;
      return { pro, neutral, contra, total: pro + neutral + contra };
    }
    return getVoteCounts(votes);
  }, [aggregatedCounts, votes]);

  const progress = useMemo(
    () => getVoteProgressCounts(voteSummary, totalEligibleVoters),
    [voteSummary, totalEligibleVoters]
  );

  const realVotes = useMemo(() => votes.filter((v) => !v.isPlaceholder), [votes]);
  const proVotes = useMemo(
    () => realVotes.filter((v) => v.vote === 'PRO' || v.voteChoice === 'yes'),
    [realVotes]
  );
  const neutralVotes = useMemo(
    () => realVotes.filter((v) => v.vote === 'NEUTRAL' || v.voteChoice === 'abstain'),
    [realVotes]
  );
  const contraVotes = useMemo(
    () => realVotes.filter((v) => v.vote === 'CONTRA' || v.voteChoice === 'no'),
    [realVotes]
  );
  const votedUserIds = useMemo(
    () => new Set(realVotes.map((v) => v.userId).filter((id): id is string => !!id)),
    [realVotes]
  );
  const usersWhoHaventVoted = useMemo(
    () => allCollaborators.filter((user) => !votedUserIds.has(user.id)),
    [allCollaborators, votedUserIds]
  );

  // Election variant: 2-segment bar (cast vs not cast)
  if (variant === 'election') {
    const effectiveTotal = Math.max(totalVoters, 1);
    const castPercentage = (votesCast / effectiveTotal) * 100;
    const notCastPercentage = 100 - castPercentage;

    return (
      <div className={className}>
        <DecisionVoteBarTrack
          segments={[
            {
              percent: castPercentage,
              color: VOTE.colors.pro,
              title: `${votesCast} of ${totalVoters} votes cast`,
            },
            {
              percent: notCastPercentage,
              color: VOTE.colors.notVoted,
              title: `${totalVoters - votesCast} members haven't voted`,
            },
          ]}
        />
      </div>
    );
  }

  // Proposal variant: 4-segment bar
  const { pro: proCount, neutral: neutralCount, contra: contraCount, notVoted: notVotedCount } = progress;
  const proPercentage = totalEligibleVoters > 0 ? (proCount / totalEligibleVoters) * 100 : 0;
  const neutralPercentage = totalEligibleVoters > 0 ? (neutralCount / totalEligibleVoters) * 100 : 0;
  const contraPercentage = totalEligibleVoters > 0 ? (contraCount / totalEligibleVoters) * 100 : 0;
  const notVotedPercentage = totalEligibleVoters > 0 ? (notVotedCount / totalEligibleVoters) * 100 : 0;

  const notVotedTitle = isAnonymous
    ? `Not voted: ${notVotedCount}`
    : `Not voted: ${notVotedCount} - ${usersWhoHaventVoted.map((u) => u.name).join(', ') || 'None'}`;
  const contraTitle = isAnonymous
    ? `Reject: ${contraCount}`
    : `Reject: ${contraCount} - ${contraVotes.map((v) => v.user?.name || 'Unknown').join(', ') || 'None'}`;
  const neutralTitle = isAnonymous
    ? `Neutral: ${neutralCount}`
    : `Neutral: ${neutralCount} - ${neutralVotes.map((v) => v.user?.name || 'Unknown').join(', ') || 'None'}`;
  const proTitle = isAnonymous
    ? `Approve: ${proCount}`
    : `Approve: ${proCount} - ${proVotes.map((v) => v.user?.name || 'Unknown').join(', ') || 'None'}`;

  return (
    <div className={className}>
      <DecisionVoteBarTrack
        interactive={interactive}
        onClick={interactive ? () => setShowVoteDetails(!showVoteDetails) : undefined}
        ariaLabel={interactive ? t('aria.votingDetailsToggle') : undefined}
        segments={[
          { percent: notVotedPercentage, color: VOTE.colors.notVoted, title: notVotedTitle },
          { percent: contraPercentage, color: VOTE.colors.contra, title: contraTitle },
          { percent: neutralPercentage, color: VOTE.colors.neutral, title: neutralTitle },
          { percent: proPercentage, color: VOTE.colors.pro, title: proTitle },
        ]}
      />

      {showCountsBelow && (
        <div className="px-3 py-1.5">
          <VoteResultsDisplay
            pro={proCount}
            neutral={neutralCount}
            contra={contraCount}
            variant="compact"
          />
        </div>
      )}

      {/* Vote Details (shown when expanded) - hidden for amendment proposals */}
      {interactive && showVoteDetails && !hideExpandedCounter && (
        <VoteResultsDisplay
          pro={proCount}
          neutral={neutralCount}
          contra={contraCount}
          totalEligible={totalEligibleVoters}
          variant="detailed"
        />
      )}
    </div>
  );
}

export const VoteProgressBar = React.memo(VoteProgressBarComponent);
