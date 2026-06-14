import { useCallback, type MutableRefObject } from 'react';
import { DocumentUpdate } from '../useWebSocket';
import { logger } from '../../lib/logger';

export function useUpdateQueue(
  processUpdateInternal: (update: DocumentUpdate) => void,
  queuedUpdatesRef: MutableRefObject<DocumentUpdate[]>,
  setQueuedUpdatesStore: (updates: DocumentUpdate[]) => void,
  setRealTimeUpdatesEnabledStore: (enabled: boolean) => void
) {
  const applyQueuedUpdates = useCallback(() => {
    const updates = [...queuedUpdatesRef.current];
    if (updates.length === 0) return;

    logger.log(`📦 Applying ${updates.length} queued updates`);
    updates.forEach((update, index) => {
      try {
        if (!update.eventType || !update.documentId) {
          logger.warn(`⚠️ Skipping invalid update at index ${index}:`, update);
          return;
        }
        processUpdateInternal(update);
      } catch (error) {
        logger.error(`❌ Error applying queued update at index ${index}:`, error);
      }
    });
    queuedUpdatesRef.current = [];
    setQueuedUpdatesStore([]);
  }, [processUpdateInternal, setQueuedUpdatesStore]);

  const handleRealTimeToggle = useCallback(
    (enabled: boolean) => {
      setRealTimeUpdatesEnabledStore(enabled);
      if (enabled && queuedUpdatesRef.current.length > 0) {
        setTimeout(() => applyQueuedUpdates(), 100);
      }
    },
    [applyQueuedUpdates, setRealTimeUpdatesEnabledStore]
  );

  return { applyQueuedUpdates, handleRealTimeToggle };
}
