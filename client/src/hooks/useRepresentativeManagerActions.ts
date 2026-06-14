import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { governanceApi, organizationsApi } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiErrorMessage';
import { logger } from '../lib/logger';

export interface PendingResignation {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  resignationRequestedAt: string;
  replacementElectionId?: string;
  failedElectionAttempts?: number;
  electionStatus?: string;
  electionTitle?: string;
}

interface UseRepresentativeManagerActionsParams {
  organizationId: string;
  currentUserId: string;
  isRepresentative: boolean;
  nominateSuccessMessage: string;
  selectUserToNominateMessage: string;
  resignationRequestSubmittedMessage: string;
  onUpdate: () => void;
}

export function useRepresentativeManagerActions({
  organizationId,
  currentUserId,
  isRepresentative,
  nominateSuccessMessage,
  selectUserToNominateMessage,
  resignationRequestSubmittedMessage,
  onUpdate,
}: UseRepresentativeManagerActionsParams) {
  const [nominateDialogOpen, setNominateDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [resignDialogOpen, setResignDialogOpen] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [mistrustVoteDialogOpen, setMistrustVoteDialogOpen] = useState<string | null>(null);
  const [initiatingMistrustVote, setInitiatingMistrustVote] = useState<string | null>(null);
  const [pendingResignations, setPendingResignations] = useState<PendingResignation[]>([]);

  const refreshPendingResignations = useCallback(async () => {
    try {
      const response = await governanceApi.getPendingResignations(organizationId);
      setPendingResignations(response.pendingResignations || []);
    } catch (error) {
      logger.error('Failed to fetch pending resignations:', error);
      // Silently fail - not critical for UI
    }
  }, [organizationId]);

  useEffect(() => {
    if (isRepresentative) {
      refreshPendingResignations();
    }
  }, [isRepresentative, refreshPendingResignations]);

  const handleNominate = useCallback(async () => {
    if (!selectedUserId) {
      toast.error(selectUserToNominateMessage);
      return;
    }

    try {
      setLoading(true);
      await organizationsApi.nominateRepresentative(organizationId, selectedUserId);
      toast.success(nominateSuccessMessage);
      setNominateDialogOpen(false);
      setSelectedUserId('');
      // WebSocket will handle the refresh via 'member-added' event
    } catch (error: unknown) {
      logger.error('Failed to nominate representative:', error);
      toast.error(getApiErrorMessage(error, 'Failed to nominate representative'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedUserId, nominateSuccessMessage, selectUserToNominateMessage]);

  const handleInitiateMistrustVote = useCallback(
    async (repId: string) => {
      try {
        setInitiatingMistrustVote(repId);
        const result = await governanceApi.initiateMistrustVote(organizationId, repId);
        toast.success(result.message || 'Mistrust vote initiated successfully');
        setMistrustVoteDialogOpen(null);
        onUpdate();
      } catch (error: unknown) {
        logger.error('Failed to initiate mistrust vote:', error);
        toast.error(getApiErrorMessage(error, 'Failed to initiate mistrust vote'));
      } finally {
        setInitiatingMistrustVote(null);
      }
    },
    [organizationId, onUpdate]
  );

  const handleResign = useCallback(async () => {
    try {
      setResigning(true);
      const result = await governanceApi.resignAsRepresentative(organizationId, currentUserId);
      toast.success(result.message || resignationRequestSubmittedMessage);
      setResignDialogOpen(false);
      await refreshPendingResignations();
      onUpdate();
    } catch (error: unknown) {
      logger.error('Failed to resign:', error);
      toast.error(getApiErrorMessage(error, 'Failed to submit resignation'));
    } finally {
      setResigning(false);
    }
  }, [organizationId, currentUserId, resignationRequestSubmittedMessage, refreshPendingResignations, onUpdate]);

  return {
    nominateDialogOpen,
    setNominateDialogOpen,
    selectedUserId,
    setSelectedUserId,
    loading,
    resignDialogOpen,
    setResignDialogOpen,
    resigning,
    mistrustVoteDialogOpen,
    setMistrustVoteDialogOpen,
    initiatingMistrustVote,
    pendingResignations,
    handleNominate,
    handleInitiateMistrustVote,
    handleResign,
  };
}
