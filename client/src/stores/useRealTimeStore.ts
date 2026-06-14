import { create } from 'zustand';
import type { DocumentUpdate } from '../hooks/useWebSocket';

type SetStateAction<T> = T | ((prev: T) => T);

export interface RealTimeState {
  realTimeUpdatesEnabled: boolean;
  queuedUpdates: DocumentUpdate[];
  setRealTimeUpdatesEnabled: (enabled: boolean) => void;
  setQueuedUpdates: (updates: SetStateAction<DocumentUpdate[]>) => void;
  clearQueuedUpdates: () => void;
}

export const useRealTimeStore = create<RealTimeState>((set) => ({
  realTimeUpdatesEnabled: true,
  queuedUpdates: [],
  setRealTimeUpdatesEnabled: (realTimeUpdatesEnabled) =>
    set({ realTimeUpdatesEnabled }),
  setQueuedUpdates: (updates) =>
    set((s) => ({
      queuedUpdates:
        typeof updates === 'function' ? updates(s.queuedUpdates) : updates,
    })),
  clearQueuedUpdates: () => set({ queuedUpdates: [] }),
}));
