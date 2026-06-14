import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'colabora-theme';

/**
 * Get system preference for color scheme
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get stored theme from localStorage or default to 'system'
 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/**
 * Swap PNG favicons to match resolved theme
 */
function applyFavicon(resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') return;

  const isDark = resolvedTheme === 'dark';
  const el16 = document.getElementById('favicon-16') as HTMLLinkElement | null;
  const el32 = document.getElementById('favicon-32') as HTMLLinkElement | null;
  if (el16) el16.href = isDark ? '/favicon-dark-16x16.png' : '/favicon-16x16.png';
  if (el32) el32.href = isDark ? '/favicon-dark-32x32.png' : '/favicon-32x32.png';
}

/**
 * Apply theme class to document element
 */
function applyTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  applyFavicon(resolvedTheme);
}

/**
 * Calculate resolved theme based on theme preference
 */
function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize from localStorage or use default
    return defaultTheme || getStoredTheme();
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    // Calculate initial resolved theme
    const initialTheme = defaultTheme || getStoredTheme();
    return resolveTheme(initialTheme);
  });

  // Apply theme class when resolved theme changes (for system theme changes)
  // Note: Manual theme changes via setTheme apply synchronously, so this mainly handles system preference changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen to system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolvedTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(newResolvedTheme);
      // applyTheme will be called by the useEffect above when resolvedTheme changes
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    // Only update if theme actually changed
    if (newTheme === theme) return;
    
    setThemeState(newTheme);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
    
    // Immediately resolve and apply the new theme to avoid race conditions
    const newResolvedTheme = resolveTheme(newTheme);
    setResolvedTheme(newResolvedTheme);
    // Apply immediately for instant feedback (useEffect will also apply, but classList operations are idempotent)
    applyTheme(newResolvedTheme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    // Toggle between light and dark (skip 'system')
    const newTheme: Theme = resolvedTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  // Note: Theme is already applied in index.html before React hydration to prevent flash
  // This effect ensures theme is applied if index.html script didn't run or if state differs
  useEffect(() => {
    const currentClass = document.documentElement.classList.contains('dark');
    const shouldBeDark = resolvedTheme === 'dark';
    if (currentClass !== shouldBeDark) {
      applyTheme(resolvedTheme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * @throws Error if used outside ThemeProvider
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

