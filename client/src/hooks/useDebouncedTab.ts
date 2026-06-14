import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook that debounces tab changes to prevent excessive API requests
 * when users rapidly switch tabs.
 *
 * @param initialTab - The initial tab value
 * @param debounceMs - Debounce delay in milliseconds (default: 200ms)
 * @returns Tuple of [activeTab, debouncedTab, setActiveTab, setActiveTabImmediate]
 *   - activeTab: Current tab value (updates immediately for UI)
 *   - debouncedTab: Debounced tab value (used for data loading)
 *   - setActiveTab: Function to change the tab (debounced)
 *   - setActiveTabImmediate: Function to set both activeTab and debouncedTab at once (e.g. when syncing from URL)
 */
export function useDebouncedTab(
  initialTab: string,
  debounceMs: number = 200
): [string, string, (tab: string) => void, (tab: string) => void] {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [debouncedTab, setDebouncedTab] = useState(initialTab);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab); // Update UI immediately

    // Clear any pending debounce
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the actual data loading
    timeoutRef.current = setTimeout(() => {
      setDebouncedTab(newTab);
    }, debounceMs);
  }, [debounceMs]);

  const setActiveTabImmediate = useCallback((newTab: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveTab(newTab);
    setDebouncedTab(newTab);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [activeTab, debouncedTab, handleTabChange, setActiveTabImmediate];
}

