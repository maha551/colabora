/**
 * useAsyncOperation Hook
 * 
 * Standardizes async operation patterns with loading states, error handling, and toast notifications.
 * Reduces boilerplate code for try/catch/toast patterns across components.
 * 
 * Follows existing hook patterns from useDocumentOperations.ts
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

interface AsyncOperationOptions<T> {
  /** Success message to display via toast */
  successMessage?: string;
  /** Error message to display via toast (defaults to error.message) */
  errorMessage?: string;
  /** Callback on successful operation */
  onSuccess?: (result: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Whether to show toast notifications (default: true) */
  showToast?: boolean;
  /** Whether to log errors (default: true) */
  logErrors?: boolean;
}

interface UseAsyncOperationReturn<T> {
  /** Execute an async operation */
  execute: (
    operation: () => Promise<T>,
    options?: AsyncOperationOptions<T>
  ) => Promise<T | null>;
  /** Current loading state */
  isLoading: boolean;
  /** Current error state */
  error: string | null;
  /** Clear error state */
  clearError: () => void;
}

/**
 * useAsyncOperation Hook
 * 
 * Provides a standardized way to handle async operations with:
 * - Loading state management
 * - Error state management
 * - Toast notifications
 * - Error logging
 * - Success/error callbacks
 * 
 * @example
 * const { execute, isLoading, error } = useAsyncOperation();
 * 
 * const handleSave = async () => {
 *   await execute(
 *     async () => await api.saveDocument(data),
 *     {
 *       successMessage: 'Document saved successfully',
 *       errorMessage: 'Failed to save document',
 *       onSuccess: (result) => {
 *         console.log('Saved:', result);
 *       }
 *     }
 *   );
 * };
 */
export function useAsyncOperation<T = unknown>(): UseAsyncOperationReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (
      operation: () => Promise<T>,
      options: AsyncOperationOptions<T> = {}
    ): Promise<T | null> => {
      const {
        successMessage,
        errorMessage,
        onSuccess,
        onError,
        showToast = true,
        logErrors = true,
      } = options;

      setIsLoading(true);
      setError(null);

      try {
        const result = await operation();

        if (successMessage && showToast) {
          toast.success(successMessage);
        }

        onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const displayMessage = errorMessage || error.message || 'An error occurred';

        setError(displayMessage);

        if (showToast) {
          toast.error(displayMessage);
        }

        if (logErrors) {
          logger.error('Async operation failed:', error);
        }

        onError?.(error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    execute,
    isLoading,
    error,
    clearError,
  };
}

