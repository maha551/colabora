import { useState, useEffect, useCallback } from 'react';
import {
  getOnboardingState,
  hasHintBeenShown,
  markHintAsShown,
  ExperienceLevel,
  trackDocumentCreated,
  trackSuggestionMade,
  trackVoteCast,
  isFirstTimeUser,
  markWelcomeShown,
} from '../utils/onboarding';

export interface UseOnboardingReturn {
  experienceLevel: ExperienceLevel;
  hasSeenHint: (hintKey: string) => boolean;
  showHint: (hintKey: string) => void;
  isFirstTime: boolean;
  markWelcomeAsShown: () => void;
  trackDocument: () => void;
  trackSuggestion: () => void;
  trackVote: () => void;
}

/**
 * Hook for managing onboarding state and hints
 */
export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useState(getOnboardingState);

  // Sync with localStorage on mount
  useEffect(() => {
    setState(getOnboardingState());
  }, []);

  const hasSeenHint = useCallback((hintKey: string): boolean => {
    return hasHintBeenShown(hintKey);
  }, []);

  const showHint = useCallback((hintKey: string): void => {
    markHintAsShown(hintKey);
    setState(getOnboardingState());
  }, []);

  const markWelcomeAsShown = useCallback(() => {
    markWelcomeShown();
    setState(getOnboardingState());
  }, []);

  const trackDocument = useCallback(() => {
    trackDocumentCreated();
    setState(getOnboardingState());
  }, []);

  const trackSuggestion = useCallback(() => {
    trackSuggestionMade();
    setState(getOnboardingState());
  }, []);

  const trackVote = useCallback(() => {
    trackVoteCast();
    setState(getOnboardingState());
  }, []);

  return {
    experienceLevel: state.experienceLevel,
    hasSeenHint,
    showHint,
    isFirstTime: isFirstTimeUser(),
    markWelcomeAsShown,
    trackDocument,
    trackSuggestion,
    trackVote,
  };
}
