import { logger } from '../lib/logger';

/**
 * Onboarding utilities for tracking user progress and showing contextual hints
 */

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface OnboardingState {
  welcomeShown: boolean;
  experienceLevel: ExperienceLevel;
  hintsShown: Set<string>;
  documentsCreated: number;
  suggestionsMade: number;
  votesCast: number;
}

const STORAGE_KEY = 'onboarding';

/**
 * Get the current onboarding state from localStorage
 */
export function getOnboardingState(): OnboardingState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        hintsShown: new Set(parsed.hintsShown || []),
      };
    }
  } catch (error) {
    logger.error('Error reading onboarding state:', error);
  }

  return {
    welcomeShown: false,
    experienceLevel: 'beginner',
    hintsShown: new Set<string>(),
    documentsCreated: 0,
    suggestionsMade: 0,
    votesCast: 0,
  };
}

/**
 * Save onboarding state to localStorage
 */
export function saveOnboardingState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      hintsShown: Array.from(state.hintsShown),
    }));
  } catch (error) {
    logger.error('Error saving onboarding state:', error);
  }
}

/**
 * Check if a specific hint has been shown
 */
export function hasHintBeenShown(hintKey: string): boolean {
  const state = getOnboardingState();
  return state.hintsShown.has(hintKey);
}

/**
 * Mark a hint as shown
 */
export function markHintAsShown(hintKey: string): void {
  const state = getOnboardingState();
  state.hintsShown.add(hintKey);
  saveOnboardingState(state);
}

/**
 * Get the user's experience level based on their activity
 */
export function getExperienceLevel(state: OnboardingState): ExperienceLevel {
  const totalActions = state.documentsCreated + state.suggestionsMade + state.votesCast;
  
  if (totalActions < 3) {
    return 'beginner';
  } else if (totalActions < 10) {
    return 'intermediate';
  } else {
    return 'advanced';
  }
}

/**
 * Update experience level based on current activity
 */
export function updateExperienceLevel(): ExperienceLevel {
  const state = getOnboardingState();
  const newLevel = getExperienceLevel(state);
  
  if (newLevel !== state.experienceLevel) {
    state.experienceLevel = newLevel;
    saveOnboardingState(state);
  }
  
  return newLevel;
}

/**
 * Track a document creation
 */
export function trackDocumentCreated(): void {
  const state = getOnboardingState();
  state.documentsCreated += 1;
  state.experienceLevel = getExperienceLevel(state);
  saveOnboardingState(state);
}

/**
 * Track a suggestion made
 */
export function trackSuggestionMade(): void {
  const state = getOnboardingState();
  state.suggestionsMade += 1;
  state.experienceLevel = getExperienceLevel(state);
  saveOnboardingState(state);
}

/**
 * Track a vote cast
 */
export function trackVoteCast(): void {
  const state = getOnboardingState();
  state.votesCast += 1;
  state.experienceLevel = getExperienceLevel(state);
  saveOnboardingState(state);
}

/**
 * Check if user is a first-time user
 */
export function isFirstTimeUser(): boolean {
  const state = getOnboardingState();
  return state.documentsCreated === 0 && !state.welcomeShown;
}

/**
 * Mark welcome as shown
 */
export function markWelcomeShown(): void {
  const state = getOnboardingState();
  state.welcomeShown = true;
  saveOnboardingState(state);
}
