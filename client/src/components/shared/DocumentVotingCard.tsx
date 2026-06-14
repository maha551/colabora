import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import { Document, Organization, User } from '../../types';
import { DeletionStatusResponse } from '../../lib/api';
import { VoteProgressBar } from '../ui/VoteProgressBar';
import { CompleteVoteButton } from './CompleteVoteButton';
import { documentsApi } from '../../lib/api';
import { toast } from 'sonner';
import { useTimezone } from '../../hooks/useTimezone';
import { SHADOWS, SPACING, COLORS, HIERARCHY, RADIUS } from '../../lib/designSystem';
import { useDesignSystemLabels } from '../../hooks/useDesignSystemLabels';
import { cn } from '../ui/utils';
import { getDeletionVoteBreakdown } from '../../lib/votingAdapters';

export interface DocumentVotingCardProps {
  document: Document;
  deletionStatus?: DeletionStatusResponse | null;
  isLoadingDeletion?: boolean;
  totalEligibleVoters: number;
  allCollaborators: User[];
  /** When true (rep mode), show CompleteVoteButton. When false (member mode), show Vote button */
  showCompleteButton: boolean;
  onCompleteContentVote?: () => void | Promise<void>;
  onCompleteDeletionVote?: () => void | Promise<void>;
  onRefreshDocuments?: () => void | Promise<void>;
  onNavigateToDocument?: (documentId: string) => void;
  /** When provided, card border uses organization branding color */
  organization?: Organization | null;
}

/**
 * Shared card for documents in voting phase (content voting and/or deletion voting).
 * Used in RepresentativesTab (rep mode with CompleteVoteButton) and DashboardTab (member mode with Vote button).
 */
export function DocumentVotingCard({
  document,
  deletionStatus,
  isLoadingDeletion = false,
  totalEligibleVoters,
  allCollaborators,
  showCompleteButton,
  onCompleteContentVote,
  onCompleteDeletionVote,
  onRefreshDocuments,
  onNavigateToDocument,
  organization,
}: DocumentVotingCardProps) {
  const { t } = useTranslation('governance');
  const { cardActions } = useDesignSystemLabels();
  const { formatRelativeTime } = useTimezone();
  const cardStyle = organization?.brandingColor ? { borderColor: organization.brandingColor, borderWidth: '2px' as const } : undefined;
  const hasContentVoting = document.status === 'voting';
  const hasDeletionVoting =
    !!document.deletionProposedAt &&
    !!document.deletionVoteDeadline &&
    new Date(document.deletionVoteDeadline) > new Date();
  const deletionQuorumMet = deletionStatus?.quorumMet ?? false;
  const contentQuorumMet =
    (document.documentVotes?.length ?? 0) >= (document.minVotersRequired || 1);
  const deadlinePassed = !!(document.votingDeadline && new Date(document.votingDeadline) <= new Date());
  const canCompleteEarly = !document.options?.voteChangeAllowed || deadlinePassed;
  const votingDeferredUntilDeadline = hasContentVoting && contentQuorumMet && !canCompleteEarly;

  const handleCompleteContentVote = async () => {
    await documentsApi.completeVoting(document.id);
    toast.success('Vote completed successfully');
    onRefreshDocuments?.();
    onCompleteContentVote?.();
  };

  const handleCompleteDeletionVote = async () => {
    await documentsApi.completeDeletionVote(document.id);
    toast.success('Vote completed successfully');
    onRefreshDocuments?.();
    onCompleteDeletionVote?.();
  };

  return (
    <Card className={cn(SHADOWS.md, 'hover:shadow-md transition-shadow overflow-hidden gap-0')} style={cardStyle}>
      {hasContentVoting && (
        <>
          <div className="px-4 pt-4 pb-1 md:px-6 md:pt-6">
            <Badge variant="outline">
              <Icon name="Vote" className="h-3 w-3 mr-1" />
              Content Voting
            </Badge>
          </div>
          <VoteProgressBar
            aggregatedCounts={{
              pro: document.documentVotes?.filter((v) => v.vote === 'PRO').length ?? 0,
              neutral: document.documentVotes?.filter((v) => v.vote === 'NEUTRAL').length ?? 0,
              contra: document.documentVotes?.filter((v) => v.vote === 'CONTRA').length ?? 0,
            }}
            totalEligibleVoters={totalEligibleVoters}
            allCollaborators={allCollaborators}
            isAnonymous={document.options?.votingAnonymous ?? false}
          />
        </>
      )}
      {hasDeletionVoting && (
        <>
          <div
            className={cn(
              'px-4 md:px-6',
              hasContentVoting ? 'pt-2 pb-1' : 'pt-4 md:pt-6 pb-1'
            )}
          >
            <Badge variant="destructive">
              <Icon name="Trash2" className="h-3 w-3 mr-1" />
              Deletion Vote
            </Badge>
          </div>
          {isLoadingDeletion ? (
            <div className="px-4 py-2 md:px-6">
              <div className="text-sm text-muted-foreground">
                Loading deletion vote status...
              </div>
            </div>
          ) : deletionStatus ? (
            <VoteProgressBar
              aggregatedCounts={deletionStatus ? getDeletionVoteBreakdown(deletionStatus) : undefined}
              totalEligibleVoters={
                deletionStatus.eligibleVoters || totalEligibleVoters
              }
              allCollaborators={allCollaborators}
              isAnonymous={false}
            />
          ) : (
            <div className="px-4 py-2 md:px-6">
              <div className="text-sm text-muted-foreground">
                Failed to load deletion vote status
              </div>
            </div>
          )}
        </>
      )}
      <CardContent className="flex items-center justify-between pt-4">
        <div className="flex-1">
          <h4 className="font-medium">{document.title}</h4>
          <div className="space-y-1">
            {votingDeferredUntilDeadline && document.votingDeadline && (
              <p className="text-sm text-muted-foreground">
                {t('votingDeferredUntilDeadline', { deadline: formatRelativeTime(document.votingDeadline) })}
              </p>
            )}
            {hasContentVoting && document.votingDeadline && !showCompleteButton && (
              <p className="text-sm text-muted-foreground">
                Ends {formatRelativeTime(document.votingDeadline)}
              </p>
            )}
            {hasDeletionVoting && deletionStatus?.voteDeadline && (
              <p className="text-sm text-muted-foreground">
                Ends {formatRelativeTime(deletionStatus.voteDeadline)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {showCompleteButton && hasContentVoting && contentQuorumMet && canCompleteEarly && (
            <CompleteVoteButton
              quorumMet={contentQuorumMet}
              onComplete={handleCompleteContentVote}
              confirmDescription="This will close content voting and finalize the document status based on current votes."
            />
          )}
          {showCompleteButton && hasDeletionVoting && deletionQuorumMet && (
            <CompleteVoteButton
              quorumMet={deletionQuorumMet}
              onComplete={handleCompleteDeletionVote}
              confirmDescription="This will close the deletion vote. The document will be deleted if approved, or the proposal cancelled if rejected."
            />
          )}
          {onNavigateToDocument && (hasContentVoting || hasDeletionVoting) && (
            <Button
              size="sm"
              variant={showCompleteButton ? 'outline' : 'default'}
              onClick={() => onNavigateToDocument(document.id)}
              className={!showCompleteButton ? 'gap-1.5' : ''}
            >
              {showCompleteButton ? (
                <>
                  <Icon name="ArrowRight" className="h-4 w-4 ml-1" />
                  {cardActions.open}
                </>
              ) : (
                <>
                  <Icon name="Vote" className="h-4 w-4" />
                  {cardActions.vote}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
      {/* Discussion placeholder — aligned with TreeProposalCard / SuggestionCard */}
      <div className={cn(HIERARCHY.majorSection, 'px-4 pb-4 pt-0 md:px-6 md:pb-6')}>
        <div className={cn('flex items-center gap-2 p-3 bg-muted/40 border border-border/40', RADIUS.panel, SPACING.content.inline)}>
          <Icon name="MessageSquare" className={cn('h-4 w-4 flex-shrink-0', COLORS.text.secondary)} />
          <span className={cn('text-sm', COLORS.text.secondary)}>
            Discussion for this document takes place on the document. Use {showCompleteButton ? cardActions.open : cardActions.vote} to open and participate.
          </span>
        </div>
      </div>
    </Card>
  );
}
