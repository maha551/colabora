import { useTranslation } from 'react-i18next';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { VoteButtonGroup } from './shared/VoteButtonGroup';
import { getUserColor, getUserColorForText } from '../lib/userColors';
import { Icon } from './ui/Icon';
import { useTimezone } from '../hooks/useTimezone';
import { COLORS } from '../lib/designSystem';

export interface VoteSummary {
  pro: number;
  contra: number;
  neutral: number;
  total: number;
}

interface DiffContextBarProps {
  suggestion1Author?: string;
  suggestion1UserId?: string;
  suggestion1Timestamp?: Date | string;
  suggestion1Votes?: VoteSummary;
  suggestion2Author?: string;
  suggestion2UserId?: string;
  suggestion2Timestamp?: Date | string;
  suggestion2Votes?: VoteSummary;
  compact?: boolean;
  onVote?: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment?: (suggestionId: string) => void;
  suggestion1Id?: string;
  suggestion2Id?: string;
  totalUsers?: number; // Total users for vote guidance
  currentUserId?: string; // Current user ID to check if they've voted
  suggestion1UserVote?: 'PRO' | 'NEUTRAL' | 'CONTRA'; // Current user's vote for suggestion1
  suggestion2UserVote?: 'PRO' | 'NEUTRAL' | 'CONTRA'; // Current user's vote for suggestion2
}

/**
 * Determines vote status for a suggestion
 */
function getVoteStatus(votes: VoteSummary | undefined, totalUsers: number): {
  status: 'leading' | 'contested' | 'new' | 'rejected';
  needsVote: boolean;
  approvalPercentage: number;
} {
  if (!votes || votes.total === 0) {
    return { status: 'new', needsVote: true, approvalPercentage: 0 };
  }

  const approvalPercentage = votes.total > 0 ? (votes.pro / votes.total) * 100 : 0;
  const participationRate = totalUsers > 0 ? (votes.total / totalUsers) * 100 : 0;

  let status: 'leading' | 'contested' | 'new' | 'rejected';
  if (approvalPercentage >= 75) {
    status = 'leading';
  } else if (approvalPercentage < 50 && votes.contra > votes.pro) {
    status = 'rejected';
  } else if (votes.pro > 0 && votes.contra > 0 && Math.abs(votes.pro - votes.contra) < 3) {
    status = 'contested';
  } else {
    status = 'new';
  }

  const needsVote = participationRate < 50 || votes.total < totalUsers * 0.5;

  return { status, needsVote, approvalPercentage };
}


/**
 * Displays contextual information about suggestions (author, timestamp, votes)
 * Used in discussion area (full mode) to provide decision-making context
 */
export function DiffContextBar({
  suggestion1Author,
  suggestion1UserId,
  suggestion1Timestamp,
  suggestion1Votes,
  suggestion2Author,
  suggestion2UserId,
  suggestion2Timestamp,
  suggestion2Votes,
  compact = false,
  onVote,
  onComment,
  suggestion1Id,
  suggestion2Id,
  totalUsers = 0,
  currentUserId,
  suggestion1UserVote,
  suggestion2UserVote,
}: DiffContextBarProps) {
  const { t } = useTranslation('common');
  const { formatRelativeTime } = useTimezone();
  const user1Color = suggestion1UserId ? getUserColor(suggestion1UserId) : undefined;
  const user1TextColor = suggestion1UserId ? getUserColorForText(suggestion1UserId) : undefined;
  const user2Color = suggestion2UserId ? getUserColor(suggestion2UserId) : undefined;
  const user2TextColor = suggestion2UserId ? getUserColorForText(suggestion2UserId) : undefined;

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {suggestion1Author && (
          <Badge
            style={{
              backgroundColor: user1Color || 'var(--color-amber-500)',
              color: user1TextColor || 'var(--color-white)',
            }}
            className={!user1Color ? "hover:bg-[var(--color-amber-600)]" : undefined}
          >
            {suggestion1Author}
          </Badge>
        )}
        {suggestion1Timestamp && (
          <span className="text-muted-foreground flex items-center gap-1">
            <Icon name="Clock" className="h-3 w-3" />
            {formatRelativeTime(suggestion1Timestamp)}
          </span>
        )}
        {suggestion1Votes && suggestion1Votes.total > 0 && (
          <span className="text-muted-foreground">
            {suggestion1Votes.pro} approve, {suggestion1Votes.contra} reject
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Suggestion 1 Context */}
      {suggestion1Author && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              style={{
                backgroundColor: user1Color || 'var(--color-amber-500)',
                color: user1TextColor || 'var(--color-white)',
              }}
              className={!user1Color ? "hover:bg-[var(--color-amber-600)]" : undefined}
            >
              {suggestion1Author}
            </Badge>
            {suggestion1Timestamp && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Icon name="Clock" className="h-3 w-3" />
                {formatRelativeTime(suggestion1Timestamp)}
              </span>
            )}
          </div>

          {/* Vote Summary with Guidance */}
          {suggestion1Votes && (
            <div className="space-y-2">
              {suggestion1Votes.total > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <div className={`flex items-center gap-1 ${COLORS.status.success}`}>
                    <Icon name="ThumbsUp" className="h-3 w-3" />
                    <span>{suggestion1Votes.pro}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${COLORS.status.error}`}>
                    <Icon name="ThumbsDown" className="h-3 w-3" />
                    <span>{suggestion1Votes.contra}</span>
                  </div>
                  {suggestion1Votes.neutral > 0 && (
                    <div className={`flex items-center gap-1 ${COLORS.status.info}`}>
                      <Icon name="Minus" className="h-3 w-3" />
                      <span>{suggestion1Votes.neutral}</span>
                    </div>
                  )}
                  {/* Only show total when there are neutral votes or when it adds information */}
                  {(suggestion1Votes.neutral > 0 || suggestion1Votes.total !== (suggestion1Votes.pro + suggestion1Votes.contra + suggestion1Votes.neutral)) && (
                    <span className="text-muted-foreground">
                      ({suggestion1Votes.total} total)
                    </span>
                  )}
                </div>
              )}
              
              {/* Vote Guidance */}
              {(() => {
                const voteStatus = getVoteStatus(suggestion1Votes, totalUsers);
                const hasUserVoted = suggestion1UserVote !== undefined;
                const isLeading = voteStatus.status === 'leading';
                const is100Percent = voteStatus.approvalPercentage >= 99.5;
                
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* If user voted, prioritize showing their vote badge */}
                    {hasUserVoted ? (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        {t('comparison.youVoted', {
                          vote: suggestion1UserVote === 'PRO' ? t('vote.approve') : suggestion1UserVote === 'CONTRA' ? t('vote.reject') : t('vote.neutral'),
                        })}
                      </Badge>
                    ) : (
                      <>
                        {isLeading && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">
                            <Icon name="TrendingUp" className="h-3 w-3 mr-1" />
                            {is100Percent ? t('comparison.leading100') : t('comparison.leading')}
                          </Badge>
                        )}
                        {voteStatus.status === 'contested' && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">
                            <Icon name="AlertCircle" className="h-3 w-3 mr-1" />
                            {t('comparison.contested')}
                          </Badge>
                        )}
                        {voteStatus.status === 'rejected' && (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                            <Icon name="ThumbsDown" className="h-3 w-3 mr-1" />
                            {t('comparison.rejected')}
                          </Badge>
                        )}
                        {voteStatus.status === 'new' && suggestion1Votes && suggestion1Votes.total === 0 && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                            {t('comparison.new')}
                          </Badge>
                        )}
                      </>
                    )}
                    {/* Only show "Your vote needed" if not rejected and user hasn't voted */}
                    {voteStatus.needsVote && !hasUserVoted && voteStatus.status !== 'rejected' && (
                      <Badge variant="outline" className={COLORS.statusBadge.warning}>
                        <Icon name="CheckCircle2" className="h-3 w-3 mr-1" />
                        {t('comparison.yourVoteNeeded')}
                      </Badge>
                    )}
                    {/* Only show approval percentage if not 100% and not already shown in Leading badge */}
                    {voteStatus.approvalPercentage > 0 && !is100Percent && !(isLeading && !hasUserVoted) && (
                      <span className="text-xs text-muted-foreground">
                        {t('comparison.approvalPercent', { percent: voteStatus.approvalPercentage.toFixed(0) })}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action Buttons */}
          {(onVote || onComment) && suggestion1Id && (
            <div className="flex items-center gap-2">
              {onVote && (
                <VoteButtonGroup
                  value={suggestion1UserVote ?? null}
                  onVote={(vote) => onVote(suggestion1Id, vote)}
                  variant="compact"
                />
              )}
              {onComment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onComment(suggestion1Id)}
                  className="h-7 text-xs"
                >
                  <Icon name="MessageSquare" className="h-3 w-3 mr-1" />
                  {t('comparison.comment')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suggestion 2 Context */}
      {suggestion2Author && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              style={{
                backgroundColor: user2Color || 'var(--color-blue-500)',
                color: user2TextColor || 'var(--color-white)',
              }}
              className={!user2Color ? "hover:bg-[var(--color-blue-600)]" : undefined}
            >
              {suggestion2Author}
            </Badge>
            {suggestion2Timestamp && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Icon name="Clock" className="h-3 w-3" />
                {formatRelativeTime(suggestion2Timestamp)}
              </span>
            )}
          </div>

          {/* Vote Summary with Guidance */}
          {suggestion2Votes && (
            <div className="space-y-2">
              {suggestion2Votes.total > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <div className={`flex items-center gap-1 ${COLORS.status.success}`}>
                    <Icon name="ThumbsUp" className="h-3 w-3" />
                    <span>{suggestion2Votes.pro}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${COLORS.status.error}`}>
                    <Icon name="ThumbsDown" className="h-3 w-3" />
                    <span>{suggestion2Votes.contra}</span>
                  </div>
                  {suggestion2Votes.neutral > 0 && (
                    <div className={`flex items-center gap-1 ${COLORS.status.info}`}>
                      <Icon name="Minus" className="h-3 w-3" />
                      <span>{suggestion2Votes.neutral}</span>
                    </div>
                  )}
                  {/* Only show total when there are neutral votes or when it adds information */}
                  {(suggestion2Votes.neutral > 0 || suggestion2Votes.total !== (suggestion2Votes.pro + suggestion2Votes.contra + suggestion2Votes.neutral)) && (
                    <span className="text-muted-foreground">
                      ({suggestion2Votes.total} total)
                    </span>
                  )}
                </div>
              )}
              
              {/* Vote Guidance */}
              {(() => {
                const voteStatus = getVoteStatus(suggestion2Votes, totalUsers);
                const hasUserVoted = suggestion2UserVote !== undefined;
                const isLeading = voteStatus.status === 'leading';
                const is100Percent = voteStatus.approvalPercentage >= 99.5;
                
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* If user voted, prioritize showing their vote badge */}
                    {hasUserVoted ? (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        {t('comparison.youVoted', {
                          vote: suggestion2UserVote === 'PRO' ? t('vote.approve') : suggestion2UserVote === 'CONTRA' ? t('vote.reject') : t('vote.neutral'),
                        })}
                      </Badge>
                    ) : (
                      <>
                        {isLeading && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">
                            <Icon name="TrendingUp" className="h-3 w-3 mr-1" />
                            {is100Percent ? t('comparison.leading100') : t('comparison.leading')}
                          </Badge>
                        )}
                        {voteStatus.status === 'contested' && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">
                            <Icon name="AlertCircle" className="h-3 w-3 mr-1" />
                            {t('comparison.contested')}
                          </Badge>
                        )}
                        {voteStatus.status === 'rejected' && (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                            <Icon name="ThumbsDown" className="h-3 w-3 mr-1" />
                            {t('comparison.rejected')}
                          </Badge>
                        )}
                        {voteStatus.status === 'new' && suggestion2Votes && suggestion2Votes.total === 0 && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                            {t('comparison.new')}
                          </Badge>
                        )}
                      </>
                    )}
                    {/* Only show "Your vote needed" if not rejected and user hasn't voted */}
                    {voteStatus.needsVote && !hasUserVoted && voteStatus.status !== 'rejected' && (
                      <Badge variant="outline" className={COLORS.statusBadge.warning}>
                        <Icon name="CheckCircle2" className="h-3 w-3 mr-1" />
                        {t('comparison.yourVoteNeeded')}
                      </Badge>
                    )}
                    {/* Only show approval percentage if not 100% and not already shown in Leading badge */}
                    {voteStatus.approvalPercentage > 0 && !is100Percent && !(isLeading && !hasUserVoted) && (
                      <span className="text-xs text-muted-foreground">
                        {t('comparison.approvalPercent', { percent: voteStatus.approvalPercentage.toFixed(0) })}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action Buttons */}
          {(onVote || onComment) && suggestion2Id && (
            <div className="flex items-center gap-2">
              {onVote && (
                <VoteButtonGroup
                  value={suggestion2UserVote ?? null}
                  onVote={(vote) => onVote(suggestion2Id, vote)}
                  variant="compact"
                />
              )}
              {onComment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onComment(suggestion2Id)}
                  className="h-7 text-xs"
                >
                  <Icon name="MessageSquare" className="h-3 w-3 mr-1" />
                  {t('comparison.comment')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

