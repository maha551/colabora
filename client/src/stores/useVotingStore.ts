import { create } from 'zustand';

type SetStateAction<T> = T | ((prev: T) => T);

export interface VotingState {
  votingState: Set<string>;
  setVotingState: (updater: SetStateAction<Set<string>>) => void;
}

export const useVotingStore = create<VotingState>((set) => ({
  votingState: new Set<string>(),
  setVotingState: (updater) =>
    set((s) => ({
      votingState:
        typeof updater === 'function' ? updater(s.votingState) : updater,
    })),
}));
