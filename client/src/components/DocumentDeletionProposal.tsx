/**
 * Document Deletion Proposal Component
 * Allows representatives to propose deletion and members to vote
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, User } from '../types';
import { DeletionStatusResponse } from '../lib/api';
import { documentsApi } from '../lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { VoteButtonGroup } from './shared/VoteButtonGroup';
import { VoteProgressBar } from './ui/VoteProgressBar';
import { Alert, AlertDescription } from './ui/alert';
import { Icon } from './ui/Icon';
import { CompleteVoteButton } from './shared/CompleteVoteButton';
import { toast } from 'sonner';
import { useTimezone } from '../hooks/useTimezone';
import { logger } from '../lib/logger';
import { COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { useVoteSubmission } from '../hooks/useVoteSubmission';
import { extractVoteReceipt, persistReceipt } from '../lib/verification/voteReceipt';

interface DocumentDeletionProposalProps {
  document: Document;
  currentUser: User | null;
  isRepresentative: boolean;
  onDeletionProposed?: () => void;
  onDeletionCancelled?: () => void;
}

export function DocumentDeletionProposal({
  document,
  currentUser,
  isRepresentative,
  onDeletionProposed,
  onDeletionCancelled
}: DocumentDeletionProposalProps) {
  const { t } = useTranslation('common');
  const { t: tDoc } = useTranslation('documents');
  const { formatDateTime, formatRelativeTime } = useTimezone();
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const { isSubmitting: voting, submitVote: submitDeletionVote } = useVoteSubmission({
    throwOnError: true,
    successMessage: t('toasts.voteRecorded'),
    errorMessage: 'Failed to cast vote',
  });
  const { isSubmitting: completing, submitVote: submitCompleteVote } = useVoteSubmission({
    throwOnError: true,
    successMessage: 'Vote completed successfully',
    errorMessage: 'Failed to complete vote',
  });

  useEffect(() => {
    if (document?.id) {
      loadDeletionStatus();
    }
  }, [document?.id]);

  const loadDeletionStatus = async () => {
    try {
      const status = await documentsApi.getDeletionStatus(document.id);
      setDeletionStatus(status);
    } catch (error) {
      logger.error('Error loading deletion status:', error);
    }
  };

  const handleProposeDeletion = async () => {
    if (!confirm(t('confirm.proposeDeletion'))) {
      return;
    }

    try {
      setProposing(true);
      await documentsApi.proposeDeletion(document.id);
      toast.success(tDoc('deletionProposalCreated'));
      await loadDeletionStatus();
      onDeletionProposed?.();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to propose deletion';
      toast.error(errorMessage);
    } finally {
      setProposing(false);
    }
  };

  const handleVote = async (vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      await submitDeletionVote(async () => {
        const response = await documentsApi.voteDeletion(document.id, vote);
        if (currentUser?.id && document.organizationId) {
          const payload = extractVoteReceipt(response);
          if (payload) {
            await persistReceipt(currentUser.id, document.organizationId, {
              ...payload,
              contestTitle: `Deletion: ${document.title}`,
              organizationId: document.organizationId,
            });
          }
        }
        await loadDeletionStatus();
        return response;
      });
    } catch (error) {
      logger.error('Failed to cast deletion vote', error);
    }
  };

  const handleCompleteVote = async () => {
    try {
      await submitCompleteVote(async () => {
        const response = await documentsApi.completeDeletionVote(document.id);
        await loadDeletionStatus();
        onDeletionProposed?.(); // May trigger parent refresh
        return response;
      });
    } catch (error) {
      logger.error('Failed to complete deletion vote', error);
    }
  };

  const handleCancel = async () => {
    if (!confirm(t('confirm.cancelDeletionProposal'))) {
      return;
    }

    try {
      setLoading(true);
      await documentsApi.cancelDeletion(document.id);
      toast.success(tDoc('deletionProposalCancelled'));
      await loadDeletionStatus();
      onDeletionCancelled?.();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel deletion';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!document || document.ownershipType !== 'organizational' || !document.id) {
    return null;
  }

  if (!deletionStatus) {
    return (
      <Card className="p-6 border-0">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-3"></div>
          <div className="h-8 bg-muted rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  // No deletion proposed
  if (!deletionStatus.proposed) {
    if (!isRepresentative) {
      return null; // Only show to representatives
    }

    return (
      <Card className={cn('p-6 border-0', COLORS.statusBg.active)}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Icon name="Trash2" className={cn('h-5 w-5 mt-0.5', COLORS.status.active)} />
            <div>
              <h3 className={cn('font-medium mb-2', COLORS.status.active)}>Propose Document Deletion</h3>
              <p className={cn('text-sm mb-4', COLORS.status.active)}>
                As a representative, you can propose deletion of this document. Organization members will vote on the proposal.
              </p>
              <Button
                onClick={handleProposeDeletion}
                disabled={proposing}
                variant="destructive"
                size="sm"
              >
                {proposing ? 'Proposing...' : 'Propose Deletion'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Deletion proposed - show voting interface
  const { votes, voteDeadline, quorumMet, quorumRequired, eligibleVoters } = deletionStatus;
  const deadline = voteDeadline ? new Date(voteDeadline) : null;
  const deadlinePassed = deadline ? deadline < new Date() : false;

  // Check if user can cancel (proposer or representative)
  const canCancel = isRepresentative;

  const totalEligibleVoters = eligibleVoters || Math.max(votes?.total || 0, 1);

  return (
    <Card className={cn('p-6 border-0 overflow-hidden', COLORS.statusBg.error)}>
      {/* 4-segment status bar at top */}
      {votes && !deadlinePassed && (
        <VoteProgressBar
          aggregatedCounts={{
            pro: votes.breakdown.PRO || 0,
            neutral: votes.breakdown.NEUTRAL || 0,
            contra: votes.breakdown.CONTRA || 0,
          }}
          totalEligibleVoters={totalEligibleVoters}
          allCollaborators={[]}
          isAnonymous={false}
        />
      )}

      <div className="space-y-4 p-6 pt-4">
        <div className="flex items-start justify-between -mt-2">
          <div className="flex items-start gap-3">
            <Icon name="AlertTriangle" className={cn('h-5 w-5 mt-0.5', COLORS.status.error)} />
            <div>
              <h3 className={cn('font-medium mb-2', COLORS.status.error)}>Document Deletion Proposed</h3>
              <p className={cn('text-sm', COLORS.status.error)}>
                This document has been proposed for deletion. Organization members are voting on the proposal.
              </p>
            </div>
          </div>
          {canCancel && (
            <Button
              onClick={handleCancel}
              disabled={loading}
              variant="ghost"
              size="sm"
            >
              <Icon name="X" className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {deadline && (
          <div className="text-sm">
            <span className="text-muted-foreground">Vote deadline: </span>
            <span className={deadlinePassed ? cn(COLORS.status.error, 'font-medium') : 'font-medium'}>
              {formatDateTime(deadline)}
              {' '}
              ({formatRelativeTime(deadline)})
            </span>
          </div>
        )}

        {!deadlinePassed && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <p className="text-sm font-medium mb-3">Cast Your Vote:</p>
            <VoteButtonGroup
              value={undefined}
              onVote={handleVote}
              disabled={voting}
              variant="compact"
            />
            {isRepresentative && quorumMet && (
              <CompleteVoteButton
                quorumMet={quorumMet}
                loading={completing}
                onComplete={handleCompleteVote}
                confirmDescription="This will close the deletion vote now. The document will be deleted if approved, or the proposal cancelled if rejected."
              />
            )}
          </div>
        )}

        {deadlinePassed && (
          <Alert>
            <AlertDescription>
              Voting deadline has passed. The deletion proposal will be finalized automatically.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  );
}

