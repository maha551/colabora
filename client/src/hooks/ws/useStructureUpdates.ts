import { useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext, ProcessUpdateHandler } from './types';

const STRUCTURE_EVENTS = new Set([
  'structure-proposal-created',
  'tree-proposal-created',
  'structure-proposal-vote',
  'tree-proposal-vote',
  'deletion-vote',
  'structure-proposal-completed',
  'document-tree-proposal-completed',
  'deletion-vote-completed',
]);

export function useStructureUpdates(ctx: WebSocketUpdatesContext): ProcessUpdateHandler {
  const { reloadDocument, currentDocument, currentUser, setVotingState, onAgreedViewRefresh, t } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (!STRUCTURE_EVENTS.has(update.eventType as string)) return;

      if (update.eventType === 'structure-proposal-created' && update.documentId && update.documentId === currentDocument?.id) {
        logger.log('🏗️ Processing structure proposal created:', { documentId: update.documentId });
        toast.info(t('toasts.structureProposalCreated'));
        reloadDocument(true).catch((err) => logger.error('Failed to reload after structure proposal created:', err));
        onAgreedViewRefresh?.();
        return;
      }

      if (update.eventType === 'tree-proposal-created' && update.documentId && update.documentId === currentDocument?.id) {
        logger.log('🌳 Processing tree proposal created:', { documentId: update.documentId });
        toast.info(t('toasts.treeProposalCreated'));
        reloadDocument(true).catch((err) => logger.error('Failed to reload after tree proposal created:', err));
        onAgreedViewRefresh?.();
        return;
      }

      if (
        update.eventType === 'structure-proposal-vote' &&
        update.data &&
        typeof update.data === 'object' &&
        'type' in update.data &&
        (update.data as { type: string }).type === 'structure-proposal-vote' &&
        'proposalId' in update.data
      ) {
        const data = update.data as { proposalId: string; userId?: string };
        logger.log('🏗️ Processing structure proposal vote update:', { proposalId: data.proposalId });
        if (data.userId === currentUser?.id) {
          setVotingState((prev) => {
            const next = new Set(prev);
            next.delete(data.proposalId);
            return next;
          });
        }
        reloadDocument(true).catch((err) => logger.error('Failed to reload after structure proposal vote update:', err));
        return;
      }

      if (
        update.eventType === 'tree-proposal-vote' &&
        update.data &&
        typeof update.data === 'object' &&
        'type' in update.data &&
        (update.data as { type: string }).type === 'tree-proposal-vote' &&
        'proposalId' in update.data
      ) {
        const data = update.data as { proposalId: string; userId?: string };
        logger.log('🌳 Processing tree proposal vote update:', { proposalId: data.proposalId });
        if (data.userId === currentUser?.id) {
          setVotingState((prev) => {
            const next = new Set(prev);
            next.delete(data.proposalId);
            return next;
          });
        }
        reloadDocument(true).catch((err) => logger.error('Failed to reload after tree proposal vote update:', err));
        return;
      }

      if (
        update.eventType === 'deletion-vote' &&
        update.data &&
        typeof update.data === 'object' &&
        'type' in update.data &&
        (update.data as { type: string }).type === 'deletion-vote'
      ) {
        const data = update.data as { documentId?: string; userId?: string };
        logger.log('🗑️ Processing deletion vote update:', { documentId: data.documentId });
        if (data.userId === currentUser?.id) {
          setVotingState((prev) => {
            const next = new Set(prev);
            next.delete(`deletion-${update.documentId}`);
            return next;
          });
        }
        reloadDocument(true).catch((err) => logger.error('Failed to reload after deletion vote update:', err));
        return;
      }

      if (
        update.eventType === 'structure-proposal-completed' &&
        update.data &&
        typeof update.data === 'object' &&
        'proposalId' in update.data
      ) {
        const data = update.data as { proposalId: string; applied: boolean; outcome: string };
        logger.log('🏗️ Processing structure proposal completed:', data);
        const structureToast = data.outcome === 'approved' ? t('toasts.structureProposalApproved') : t('toasts.structureProposalRejected');
        toast.success(structureToast);
        reloadDocument(true).catch((err) => logger.error('Failed to reload after structure proposal completed:', err));
        onAgreedViewRefresh?.();
        return;
      }

      if (
        update.eventType === 'document-tree-proposal-completed' &&
        update.data &&
        typeof update.data === 'object' &&
        'proposalId' in update.data
      ) {
        const data = update.data as { proposalId: string; applied: boolean; outcome: string };
        logger.log('🌳 Processing document tree proposal completed:', data);
        const treeToast = data.outcome === 'approved' ? t('toasts.treeProposalApproved') : t('toasts.treeProposalRejected');
        toast.success(treeToast);
        reloadDocument(true).catch((err) => logger.error('Failed to reload after tree proposal completed:', err));
        onAgreedViewRefresh?.();
        return;
      }

      if (update.eventType === 'deletion-vote-completed' && update.data && typeof update.data === 'object') {
        logger.log('🗑️ Processing deletion vote completed');
        toast.success(t('toasts.voteCompleted'));
        reloadDocument(true).catch((err) => logger.error('Failed to reload after deletion vote completed:', err));
        onAgreedViewRefresh?.();
        return;
      }

    },
    [reloadDocument, currentDocument?.id, currentUser?.id, setVotingState, onAgreedViewRefresh, t]
  );
}
