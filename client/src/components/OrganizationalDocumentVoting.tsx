/**
 * Organizational Document Voting Interface
 * Displays voting status and allows users to cast votes on organizational documents
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { documentsApi, VotingStatusResponse } from '../lib/api';
import { Document, User } from '../types';
import { useTimezone } from '../hooks/useTimezone';
import { logger } from '../lib/logger';
import { getVoteErrorMessage, getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { VoteButtonGroup } from './shared/VoteButtonGroup';
import { VoteProgressBar } from './ui/VoteProgressBar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Icon } from './ui/Icon';
import { Button } from './ui/button';
import { COLORS, RADIUS } from '../lib/designSystem';
import { useVoteSubmission } from '../hooks/useVoteSubmission';
import { extractVoteReceipt, persistReceipt } from '../lib/verification/voteReceipt';
import { mapDocumentVoteResponse } from '../lib/votingAdapters';
import { cn } from './ui/utils';

interface OrganizationalDocumentVotingProps {
  document: Document;
  user?: User | null; // Optional - currently not used but kept for API compatibility
  onVoteCast?: (voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
}

function OrganizationalDocumentVoting({ document, user, onVoteCast }: OrganizationalDocumentVotingProps) {
  const { t } = useTranslation('governance');
  const { formatDateTime, formatRelativeTime } = useTimezone();
  const [votingData, setVotingData] = useState<VotingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting: castingVote, submitVote } = useVoteSubmission({
    throwOnError: true,
    successMessage: 'Vote recorded',
    errorMessage: 'Failed to cast vote. Please try again.',
  });

  const loadVotingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await documentsApi.getVotingStatus(document.id);
      setVotingData(data);
    } catch (err) {
      logger.error('Error loading voting data:', err);
      setError('Failed to load voting information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (document?.id) {
      loadVotingData();
    }
  }, [document.id, document?.status, document?.updatedAt]); // Also reload when document is updated

  if (!document || !document.id || document.ownershipType !== 'organizational') {
    return null;
  }

  const castVote = async (voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      setError(null);
      await submitVote(async () => {
        const response = await documentsApi.voteOnDocument(document.id, voteType);
        if (user?.id && document.organizationId) {
          const payload = extractVoteReceipt(response);
          if (payload) {
            await persistReceipt(user.id, document.organizationId, {
              ...payload,
              contestTitle: document.title,
              organizationId: document.organizationId,
            });
          }
        }

        // Update votes from API response as fallback (WebSocket will update if it arrives)
        if (response.votes) {
          let currentUserId: string | null = null;
          try {
            const token = localStorage.getItem('authToken');
            if (token) {
              const payload = JSON.parse(atob(token.split('.')[1]));
              currentUserId = payload.userId;
            }
          } catch (e) {
            // Ignore errors parsing token
          }

          setVotingData(prev => {
            if (!prev) return prev;
            return mapDocumentVoteResponse(
              prev,
              { votes: response.votes as Array<{ userId?: string; vote?: string | null }> },
              currentUserId
            );
          });
        } else {
          // Fallback: reload voting data if votes not in response
          await loadVotingData();
        }

        // Notify parent component
        onVoteCast?.(voteType);
        return response;
      });
    } catch (err) {
      logger.error('Error casting vote:', err);
      const displayMessage =
        err && typeof err === 'object' && 'code' in err
          ? getVoteErrorMessage((err as { code?: string }).code, (err instanceof Error ? err.message : null) || 'Failed to cast vote. Please try again.')
          : getUserFriendlyErrorMessage(err, 'Failed to cast vote. Please try again.');
      setError(displayMessage);
    }
  };

  const getStatusInfo = () => {
    if (!votingData) return null;

    const { document: doc } = votingData;

    // Don't show voting component for proposal status - that's handled by OrganizationalDocumentStatus
    if (doc.status === 'proposal') {
      return null;
    }

    switch (doc.status) {
      case 'voting':
        return {
          iconName: 'Vote',
          title: 'Voting in Progress',
          description: 'Voting period active',
          color: COLORS.status.success,
          bgColor: COLORS.statusBg.success
        };
      case 'agreed':
        return {
          iconName: 'CheckCircle2',
          title: 'Approved',
          description: 'Document has been approved by the organization',
          color: COLORS.status.success,
          bgColor: COLORS.statusBg.success
        };
      case 'rejected':
        return {
          iconName: 'XCircle',
          title: 'Rejected',
          description: 'Document was not approved',
          color: COLORS.status.error,
          bgColor: COLORS.statusBg.error
        };
      case 'expired':
        return {
          iconName: 'Clock',
          title: 'Expired',
          description: 'Proposal period ended without sufficient activity',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted'
        };
      default:
        return {
          iconName: 'FileText',
          title: 'Draft',
          description: 'Document is being prepared',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted'
        };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
            <div className="h-8 bg-muted rounded w-1/2 mb-6"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-destructive text-sm mb-4">{error}</div>
          <Button onClick={loadVotingData} size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!votingData) return null;

  const { document: doc, voting } = votingData;
  const statusInfo = getStatusInfo();

  // Don't render if status is proposal (handled by OrganizationalDocumentStatus)
  if (!statusInfo || doc.status === 'proposal') return null;

  return (
    <Card className="w-full overflow-hidden">
      {/* 4-segment status bar at top */}
      {doc.status === 'voting' && (
        <VoteProgressBar
          aggregatedCounts={{
            pro: voting.voteBreakdown.PRO,
            neutral: voting.voteBreakdown.NEUTRAL,
            contra: voting.voteBreakdown.CONTRA,
          }}
          totalEligibleVoters={voting.totalEligibleVoters || 1}
          allCollaborators={[]}
          isAnonymous={!!doc.votingAnonymous}
        />
      )}

      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Icon name={statusInfo.iconName} className={cn('h-5 w-5', statusInfo.color)} />
          <div className="space-y-0.5">
            <CardTitle className={statusInfo.color}>{statusInfo.title}</CardTitle>
            <CardDescription className="mt-0.5">{statusInfo.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {doc.status === 'voting' && (
          <>
            {doc.votingDeadline && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="Clock" className="h-4 w-4" />
                <span>Ends {formatRelativeTime(doc.votingDeadline)}</span>
              </div>
            )}
            {doc.votingStartedAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="Clock" className="h-4 w-4" />
                <span>Voting started: {formatDateTime(doc.votingStartedAt)}</span>
              </div>
            )}
            {voting.userVote && (
              <div className={cn("p-3 bg-accent", RADIUS.panel)}>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-foreground">
                    Your current vote: <span className="font-medium">{voting.userVote}</span>
                  </span>
                  {!doc.voteChangeAllowed && (
                    <span className="text-xs text-muted-foreground">(Vote locked)</span>
                  )}
                </div>
              </div>
            )}
            {voting.finalizationDeferredUntilDeadline && doc.votingDeadline && (
              <div className={cn('p-3 border border-border/60 bg-muted/40', RADIUS.panel)}>
                <p className="text-sm text-muted-foreground">
                  {t('votingDeferredUntilDeadline', { deadline: formatRelativeTime(doc.votingDeadline) })}
                </p>
                {voting.wouldApproveIfFinalized && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('votingOnTrackForApproval')}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {(doc.status === 'agreed' || doc.status === 'rejected' || doc.status === 'expired') && (
          <div className={cn(RADIUS.panel, "p-4", doc.status === 'agreed' ? COLORS.statusBg.success : COLORS.statusBg.error)}>
            <div className="flex items-center space-x-2">
              <Icon name={statusInfo.iconName} className={cn('h-5 w-5', statusInfo.color)} />
              <div>
                <div className={`font-medium ${doc.status === 'agreed' ? COLORS.status.success : COLORS.status.error}`}>
                  {doc.status === 'agreed' ? 'Document Approved' : 'Document Rejected'}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Final voting results: {voting.voteBreakdown.PRO} approve, {voting.voteBreakdown.NEUTRAL} neutral, {voting.voteBreakdown.CONTRA} reject
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {doc.status === 'voting' && (
        <CardFooter className="flex flex-col gap-2 pt-0">
          <p className="text-sm font-medium">Cast your vote:</p>
          <VoteButtonGroup
            value={voting.userVote}
            onVote={castVote}
            disabled={castingVote || !voting.canVote}
            voteLocked={!!voting.userVote && !doc.voteChangeAllowed}
            variant="compact"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            {doc.votingAnonymous ? 'Votes are anonymous' : 'Votes are visible to organization members'}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

export default OrganizationalDocumentVoting;
