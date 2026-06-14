import { useRef, useCallback } from 'react';
import { DocumentUpdate } from '../useWebSocket';
import { logger } from '../../lib/logger';
import { toast } from 'sonner';

const BATCH_DELAY_MS = 100;

export interface BatchedUpdateHandlers {
  handleVote: (update: DocumentUpdate) => void;
  handleComment: (update: DocumentUpdate) => void;
  handleProposal: (update: DocumentUpdate) => void;
  handleParagraph: (update: DocumentUpdate) => void;
  handleStructure: (update: DocumentUpdate) => void;
  handleLifecycle: (update: DocumentUpdate) => void;
}

export function useBatchedUpdates(
  handlers: BatchedUpdateHandlers,
  reloadDocument: (force?: boolean) => Promise<void>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const updateQueueRef = useRef<DocumentUpdate[]>([]);
  const processingRef = useRef(false);
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getUpdatePriority = useCallback((update: DocumentUpdate): 'high' | 'normal' | 'low' => {
    if (
      update.eventType === 'vote' ||
      update.eventType === 'comment' ||
      update.eventType === 'comment-upvote' ||
      update.eventType === 'proposal' ||
      update.eventType === 'paragraph-created' ||
      update.eventType === 'paragraph-updated' ||
      update.eventType === 'document-status-changed' ||
      update.eventType === 'document-vote'
    ) {
      return 'high';
    }
    return 'low';
  }, []);

  const processUpdateInternal = useCallback(
    (update: DocumentUpdate) => {
      try {
        if (update.eventType === 'vote') {
          handlers.handleVote(update);
          return;
        }
        if (update.eventType === 'comment' || update.eventType === 'comment-upvote') {
          handlers.handleComment(update);
          return;
        }
        if (update.eventType === 'proposal') {
          handlers.handleProposal(update);
          return;
        }
        if (
          update.eventType === 'paragraph' ||
          update.eventType === 'paragraph-created' ||
          update.eventType === 'paragraph-updated'
        ) {
          handlers.handleParagraph(update);
          return;
        }
        if (
          update.eventType === 'document-status-changed' ||
          update.eventType === 'document-vote' ||
          update.eventType === 'document-updated'
        ) {
          handlers.handleLifecycle(update);
          return;
        }
        if (
          [
            'structure-proposal-created',
            'tree-proposal-created',
            'structure-proposal-vote',
            'tree-proposal-vote',
            'deletion-vote',
            'structure-proposal-completed',
            'document-tree-proposal-completed',
            'deletion-vote-completed',
          ].includes(update.eventType as string)
        ) {
          handlers.handleStructure(update);
          return;
        }
      } catch (error) {
        logger.error('Error processing WebSocket update, falling back to document reload:', {
          error,
          eventType: update.eventType,
          documentId: update.documentId,
          hasData: !!update.data,
        });
        reloadDocument(true).catch((reloadErr) => {
          logger.error('Failed to reload document after WebSocket update error:', reloadErr);
          toast.error(t('toasts.syncFailed'));
        });
      }
    },
    [
      handlers.handleVote,
      handlers.handleComment,
      handlers.handleProposal,
      handlers.handleParagraph,
      handlers.handleStructure,
      handlers.handleLifecycle,
      reloadDocument,
      t,
    ]
  );

  /** Build entity-scoped deduplication key so multiple events for different entities are not collapsed. */
  const getDeduplicationKey = useCallback((update: DocumentUpdate): string => {
    const base = `${update.documentId}-${update.eventType}`;
    const data = update.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== 'object') return base;
    switch (update.eventType) {
      case 'paragraph-created':
      case 'paragraph-updated':
        return data.paragraphId != null ? `${base}-${data.paragraphId}` : base;
      case 'proposal':
        return data.paragraphId != null && data.proposal != null && typeof data.proposal === 'object' && (data.proposal as { id?: string }).id != null
          ? `${base}-${data.paragraphId}-${(data.proposal as { id: string }).id}`
          : base;
      case 'vote':
        return data.proposalId != null ? `${base}-${data.proposalId}` : base;
      case 'comment':
      case 'comment-upvote':
        return data.proposalId != null && data.comment != null && typeof data.comment === 'object' && (data.comment as { id?: string }).id != null
          ? `${base}-${data.proposalId}-${(data.comment as { id: string }).id}`
          : data.proposalId != null
            ? `${base}-${data.proposalId}`
            : base;
      default:
        return base;
    }
  }, []);

  const processBatchedUpdates = useCallback(() => {
    if (processingRef.current || updateQueueRef.current.length === 0) return;

    processingRef.current = true;
    const deduplicated = new Map<string, DocumentUpdate>();
    updateQueueRef.current.forEach((update) => {
      const key = getDeduplicationKey(update);
      const existing = deduplicated.get(key);
      if (!existing || new Date(update.timestamp) > new Date(existing.timestamp)) {
        deduplicated.set(key, update);
      }
    });
    const updatesToProcess = Array.from(deduplicated.values());
    updateQueueRef.current = [];

    requestAnimationFrame(() => {
      updatesToProcess.forEach((update) => processUpdateInternal(update));
      processingRef.current = false;
      if (updateQueueRef.current.length > 0) {
        setTimeout(processBatchedUpdates, BATCH_DELAY_MS);
      }
    });
  }, [processUpdateInternal, getDeduplicationKey]);

  return {
    processUpdateInternal,
    processBatchedUpdates,
    getUpdatePriority,
    updateQueueRef,
    batchTimeoutRef,
    BATCH_DELAY_MS,
  };
}
