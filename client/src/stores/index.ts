export { useAuthStore } from './useAuthStore';
export { useDocumentStore } from './useDocumentStore';
export { useVotingStore } from './useVotingStore';
export { useRealTimeStore } from './useRealTimeStore';

import { useDocumentStore } from './useDocumentStore';
import { useVotingStore } from './useVotingStore';
import { useRealTimeStore } from './useRealTimeStore';

/**
 * Reset transient, document/session-scoped global stores back to their initial state.
 *
 * These stores are module-level singletons, so they survive an in-app logout/login
 * (which does not reload the JS bundle) and would otherwise leak the previous
 * session's data until a manual page refresh. Call this on logout and login.
 * Note: the auth store is intentionally NOT reset here; auth transitions own that.
 */
export function resetTransientStores(): void {
  useDocumentStore.setState({
    document: null,
    agreedDocument: null,
    agreedDocumentId: null,
    loading: false,
    error: null,
  });
  useVotingStore.getState().setVotingState(new Set<string>());
  const realTime = useRealTimeStore.getState();
  realTime.clearQueuedUpdates();
  realTime.setRealTimeUpdatesEnabled(true);
}
