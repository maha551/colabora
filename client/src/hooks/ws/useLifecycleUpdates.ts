import { useCallback } from 'react';
import { toast } from 'sonner';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext } from './types';
import { logger } from '../../lib/logger';

const LIFECYCLE_EVENTS = new Set([
  'document-status-changed',
  'document-updated',
  'document-vote',
]);

/**
 * Handles document lifecycle WebSocket events (status transitions, amendment window changes).
 */
export function useLifecycleUpdates(ctx: WebSocketUpdatesContext) {
  const { reloadDocument, onAgreedViewRefresh, t } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (!LIFECYCLE_EVENTS.has(update.eventType)) {
        return;
      }

      logger.log('Lifecycle update received:', {
        eventType: update.eventType,
        documentId: update.documentId,
      });

      if (
        update.eventType === 'document-updated' &&
        update.data &&
        typeof update.data === 'object' &&
        'amendmentsOpen' in update.data
      ) {
        const data = update.data as { amendmentsOpen?: boolean; adoptionVoteCreated?: boolean };
        onAgreedViewRefresh?.();
        if (data.adoptionVoteCreated) {
          toast.info(t('toasts.amendmentAdoptionVoteCreated', { defaultValue: 'Amendment adoption vote created' }));
        } else if (data.amendmentsOpen === false) {
          toast.info(t('toasts.amendmentsClosed'));
        } else if (data.amendmentsOpen === true) {
          toast.success(t('toasts.documentOpenForAmendments'));
        }
      } else {
        onAgreedViewRefresh?.();
      }

      reloadDocument(true).catch((err) => {
        logger.error('Failed to reload document after lifecycle update:', err);
      });
    },
    [reloadDocument, onAgreedViewRefresh, t]
  );
}
