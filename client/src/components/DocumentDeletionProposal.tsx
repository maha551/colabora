/**
 * Document Deletion Proposal Component
 * Allows representatives to propose deletion and members to vote
 */

import React, { useState, useEffect } from 'react';
import { Document, User } from '../types';
import { DeletionStatusResponse } from '../lib/api';
import { documentsApi } from '../lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Trash2, X, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

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
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [voting, setVoting] = useState(false);

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
      console.error('Error loading deletion status:', error);
    }
  };

  const handleProposeDeletion = async () => {
    if (!confirm('Are you sure you want to propose deletion of this document? This will start a voting period.')) {
      return;
    }

    try {
      setProposing(true);
      await documentsApi.proposeDeletion(document.id);
      toast.success('Deletion proposal created');
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
      setVoting(true);
      await documentsApi.voteDeletion(document.id, vote);
      toast.success('Vote cast successfully');
      await loadDeletionStatus();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to cast vote';
      toast.error(errorMessage);
    } finally {
      setVoting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel the deletion proposal?')) {
      return;
    }

    try {
      setLoading(true);
      await documentsApi.cancelDeletion(document.id);
      toast.success('Deletion proposal cancelled');
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
      <Card className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
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
      <Card className="p-4 border-orange-200 bg-orange-50">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <Trash2 className="h-5 w-5 text-orange-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-orange-900 mb-1">Propose Document Deletion</h3>
              <p className="text-sm text-orange-700 mb-3">
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
  const approvalRate = votes?.approvalRate || 0;
  const threshold = 75; // Default threshold

  // Check if user can cancel (proposer or representative)
  const canCancel = isRepresentative;

  return (
    <Card className="p-4 border-red-200 bg-red-50">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-900 mb-1">Document Deletion Proposed</h3>
              <p className="text-sm text-red-700">
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
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {deadline && (
          <div className="text-sm">
            <span className="text-muted-foreground">Vote deadline: </span>
            <span className={deadlinePassed ? 'text-red-600 font-medium' : 'font-medium'}>
              {format(deadline, 'MMM d, yyyy HH:mm')}
              {' '}
              ({formatDistanceToNow(deadline, { addSuffix: true })})
            </span>
          </div>
        )}

        {votes && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Votes:</span>
              <span className="font-medium">
                {votes.total} / {eligibleVoters} members
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-green-600">{votes.breakdown.PRO || 0}</div>
                <div className="text-xs text-muted-foreground">Approve</div>
              </div>
              <div>
                <div className="text-lg font-bold text-yellow-600">{votes.breakdown.NEUTRAL || 0}</div>
                <div className="text-xs text-muted-foreground">Neutral</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">{votes.breakdown.CONTRA || 0}</div>
                <div className="text-xs text-muted-foreground">Reject</div>
              </div>
            </div>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Approval: </span>
              <span className="font-medium">{approvalRate.toFixed(1)}%</span>
              <span className="text-muted-foreground"> (Threshold: {threshold}%)</span>
            </div>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Quorum: </span>
              <Badge variant={quorumMet ? 'default' : 'secondary'}>
                {quorumMet ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Met ({votes.total}/{quorumRequired})
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Required ({votes.total}/{quorumRequired})
                  </>
                )}
              </Badge>
            </div>
          </div>
        )}

        {!deadlinePassed && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Cast Your Vote:</p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => handleVote('PRO')}
                disabled={voting}
                variant="outline"
                className="border-green-200 hover:bg-green-50"
                size="sm"
              >
                Approve
              </Button>
              <Button
                onClick={() => handleVote('NEUTRAL')}
                disabled={voting}
                variant="outline"
                className="border-yellow-200 hover:bg-yellow-50"
                size="sm"
              >
                Neutral
              </Button>
              <Button
                onClick={() => handleVote('CONTRA')}
                disabled={voting}
                variant="outline"
                className="border-red-200 hover:bg-red-50"
                size="sm"
              >
                Reject
              </Button>
            </div>
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

