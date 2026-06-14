import { useEffect, useRef, type MutableRefObject } from 'react';
import { logger } from '../../lib/logger';

// Only poll when WebSocket has been disconnected for this long (5 min)
const STALE_THRESHOLD_MS = 300000;
// Check every 5 min whether we're stale (no fixed reload every N seconds)
const CHECK_INTERVAL_MS = 300000;

export function useFallbackPolling(
  currentView: string,
  currentDocumentId: string | undefined,
  connectionState: string,
  reloadDocument: (force?: boolean) => Promise<void>,
  lastUpdateTimeRef: MutableRefObject<number>
) {
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;

  useEffect(() => {
    if (currentView !== 'document' || !currentDocumentId) return;
    if (connectionState === 'connected') return;

    lastUpdateTimeRef.current = Date.now();

    const checkAndReload = () => {
      if (connectionStateRef.current === 'connected') return;
      const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
      const shouldReload = timeSinceLastUpdate > STALE_THRESHOLD_MS;
      if (shouldReload) {
        logger.log(
          '🔄 Fallback reload: No updates received in',
          Math.floor(timeSinceLastUpdate / 1000) + 's'
        );
        reloadDocument(true).catch((err) => {
          logger.error('Failed to reload document in fallback:', err);
        });
        lastUpdateTimeRef.current = Date.now();
      }
    };

    const interval = setInterval(checkAndReload, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentView, currentDocumentId, reloadDocument, connectionState]);
}
