import { useRef, useState, useCallback } from 'react';

export interface NavigationState {
  view: 'documents' | 'activity' | 'document' | 'profile' | 'organizations' | 'organization' | 'admin';
  documentId?: string;
  organizationId?: string;
}

interface UseNavigationHistoryReturn {
  history: NavigationState[];
  canGoBack: boolean;
  push: (state: NavigationState) => void;
  pop: () => NavigationState | null;
  goBack: () => NavigationState | null;
  clear: () => void;
}

const MAX_HISTORY_SIZE = 50;

export function useNavigationHistory(): UseNavigationHistoryReturn {
  // Use ref to store history to avoid unnecessary re-renders
  const historyRef = useRef<NavigationState[]>([]);
  const [history, setHistory] = useState<NavigationState[]>([]);

  // Update state when history changes (for canGoBack calculation)
  const updateHistory = useCallback((newHistory: NavigationState[]) => {
    historyRef.current = newHistory;
    setHistory([...newHistory]);
  }, []);

  const push = useCallback((state: NavigationState) => {
    const newHistory = [...historyRef.current, state];
    // Limit history size to prevent memory issues
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift(); // Remove oldest entry
    }
    updateHistory(newHistory);
  }, [updateHistory]);

  const pop = useCallback((): NavigationState | null => {
    const currentHistory = historyRef.current;
    if (currentHistory.length === 0) {
      return null;
    }
    const previousState = currentHistory[currentHistory.length - 1];
    const newHistory = currentHistory.slice(0, -1);
    updateHistory(newHistory);
    return previousState;
  }, [updateHistory]);

  const goBack = useCallback((): NavigationState | null => {
    const currentHistory = historyRef.current;
    if (currentHistory.length === 0) {
      return null;
    }
    return currentHistory[currentHistory.length - 1];
  }, []);

  const clear = useCallback(() => {
    updateHistory([]);
  }, [updateHistory]);

  const canGoBack = history.length > 0;

  return {
    history,
    canGoBack,
    push,
    pop,
    goBack,
    clear,
  };
}
