import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi, RateLimitError } from '../lib/api';
import { toast } from 'sonner';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check authentication on mount
  const checkAuth = useCallback(async () => {
    try {
      setError(null);
      const response = await authApi.getCurrentUser();
      setCurrentUser(response.user);
    } catch (error: unknown) {
      // Check if it's a rate limit error
      if (error instanceof RateLimitError) {
        console.warn('Rate limited during auth check, showing login');
        setError('Too many requests. Please wait a moment before trying again.');
      } else {
        // Not authenticated, show login
        setCurrentUser(null);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Login handler
  const handleLogin = useCallback((user: User) => {
    setCurrentUser(user);
    setError(null);
  }, []);

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
      // Clear token from localStorage
      localStorage.removeItem('authToken');
      setCurrentUser(null);
      toast.success('Logged out successfully');
    } catch (error) {
      // Even if logout request fails, clear local data
      localStorage.removeItem('authToken');
      setCurrentUser(null);
      toast.error('Logout failed, but you have been logged out locally');
    }
  }, []);

  // Profile update handler
  const handleProfileUpdate = useCallback((updatedUser: User) => {
    setCurrentUser(updatedUser);
  }, []);

  // Initialize auth check on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    currentUser,
    authLoading,
    error,
    checkAuth,
    handleLogin,
    handleLogout,
    handleProfileUpdate,
    isAuthenticated: !!currentUser,
  };
}
