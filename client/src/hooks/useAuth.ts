import { useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi, RateLimitError, isRateLimited, clearRateLimitState, clearRequestCache } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { useAuthStore } from '../stores/useAuthStore';
import { resetTransientStores } from '../stores';

export function useAuth() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const authLoading = useAuthStore((s) => s.authLoading);
  const error = useAuthStore((s) => s.error);
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const setError = useAuthStore((s) => s.setError);
  const getAuthToken = useAuthStore((s) => s.getAuthToken);
  const logoutStore = useAuthStore((s) => s.logout);

  // Check authentication on mount
  const checkAuth = useCallback(async () => {
    if (isRateLimited()) {
      setError('Too many requests. Please wait a moment before trying again.');
      setAuthLoading(false);
      setUser(null);
      return;
    }

    try {
      setError(null);
      const authCheckPromise = authApi.getCurrentUser();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Auth check timed out')), 10000);
      });

      const response = await Promise.race([authCheckPromise, timeoutPromise]);
      setUser(response.user);
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        logger.warn('Rate limited during auth check, showing login');
        setError('Too many requests. Please wait a moment before trying again.');
      } else {
        logger.debug('Auth check failed or timed out, showing login', {
          error: err instanceof Error ? err.message : 'unknown',
        });
        setUser(null);
      }
    } finally {
      setAuthLoading(false);
    }
  }, [setUser, setAuthLoading, setError]);

  const handleLogin = useCallback(
    async (user: User) => {
      // Reset transient/session-scoped stores so no state from the previous
      // session bleeds into the new one (these survive an in-app login).
      resetTransientStores();
      setUser(user);
      setError(null);

      // Reconcile against the authoritative /api/auth/me using the new token.
      // The login response is trusted optimistically above; this guarantees the
      // identity matches the stored token even if the login payload is stale.
      // Best-effort only: a transient failure here must NOT log the user out.
      try {
        const response = await authApi.getCurrentUser();
        setUser(response.user);
      } catch (err) {
        logger.debug('Post-login user reconcile failed; keeping login response user', {
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    },
    [setUser, setError]
  );

  const handleLogout = useCallback(async () => {
    clearRateLimitState();
    clearRequestCache();
    resetTransientStores();

    if (isRateLimited()) {
      localStorage.removeItem('authToken');
      logoutStore();
      toast.success('Logged out successfully');
      return;
    }

    localStorage.removeItem('authToken');
    logoutStore();

    try {
      await authApi.logout();
      toast.success('Logged out successfully');
    } catch (err) {
      if (!(err instanceof RateLimitError)) {
        toast.error('Logout request failed, but you have been logged out locally');
      }
    }
  }, [logoutStore]);

  const handleProfileUpdate = useCallback(
    (updatedUser: User) => {
      setUser(updatedUser);
    },
    [setUser]
  );

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleTokenCleared = () => {
      clearRequestCache();
      if (currentUser) {
        logger.debug('Auth token cleared event received, clearing user');
        setUser(null);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== 'authToken') return;

      clearRequestCache();

      if (e.oldValue && !e.newValue && currentUser) {
        logger.debug('Auth token removed from storage (cross-tab), clearing user');
        setUser(null);
        return;
      }

      if (e.newValue && e.newValue !== e.oldValue) {
        logger.debug('Auth token changed in storage (cross-tab), re-checking auth');
        void checkAuth();
      }
    };

    const checkTokenInterval = setInterval(() => {
      const token = localStorage.getItem('authToken');
      if (!token && currentUser) {
        logger.debug('Auth token missing but user still set, clearing user');
        setUser(null);
      }
    }, 2000);

    window.addEventListener('authTokenCleared', handleTokenCleared);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('authTokenCleared', handleTokenCleared);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkTokenInterval);
    };
  }, [currentUser, setUser, checkAuth]);

  return {
    currentUser,
    authLoading,
    error,
    checkAuth,
    handleLogin,
    handleLogout,
    handleProfileUpdate,
    isAuthenticated: !!currentUser,
    authToken: getAuthToken(),
  };
}
