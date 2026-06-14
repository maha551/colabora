import { create } from 'zustand';
import type { User } from '../types';

export interface AuthState {
  currentUser: User | null;
  authLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getAuthToken: () => string | null;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  authLoading: true,
  error: null,
  setUser: (user) => set({ currentUser: user, error: null }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setError: (error) => set({ error }),
  getAuthToken: () =>
    typeof window !== 'undefined' ? localStorage.getItem('authToken') : null,
  logout: () => set({ currentUser: null }),
}));
