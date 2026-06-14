import { useCallback } from 'react';
import type { AppView } from '../types';

export interface NavigationState {
  view: AppView;
  documentId?: string;
  organizationId?: string;
}

/**
 * Navigation is now URL (hash) + browser history driven.
 * This hook only provides clear() for logout; canGoBack and Back are handled in useAppNavigation.
 */
interface UseNavigationHistoryReturn {
  history: NavigationState[];
  canGoBack: boolean;
  push: (state: NavigationState) => void;
  pop: () => NavigationState | null;
  goBack: () => NavigationState | null;
  clear: () => void;
}

const noop = () => {};
const noopPop = (): NavigationState | null => null;

export function useNavigationHistory(): UseNavigationHistoryReturn {
  const clear = useCallback(() => {
    // No-op: history is browser-driven. Clearing on logout is a no-op; URL will reset on next load.
  }, []);

  return {
    history: [],
    canGoBack: false,
    push: noop,
    pop: noopPop,
    goBack: noopPop,
    clear,
  };
}
