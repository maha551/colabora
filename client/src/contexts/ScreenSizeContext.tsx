import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

// Breakpoints aligned with Tailwind defaults: sm:640px, md:768px, lg:1024px
const MOBILE_BREAKPOINT = 640;  // < 640px = mobile
const TABLET_BREAKPOINT = 768;  // 640-767px = tablet (sm:)
const DESKTOP_BREAKPOINT = 1024; // 768-1023px = desktop (md:), ≥ 1024px = largeDesktop (lg:)

export type ScreenSize = 'mobile' | 'tablet' | 'desktop' | 'largeDesktop';

export interface UseScreenSizeReturn {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
  screenSize: ScreenSize;
  width: number;
}

type ScreenSizeContextType = UseScreenSizeReturn;

const ScreenSizeContext = createContext<ScreenSizeContextType | undefined>(undefined);

/**
 * Calculate screen size from width
 */
function calculateScreenSize(width: number): ScreenSize {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < TABLET_BREAKPOINT) return 'tablet';
  if (width < DESKTOP_BREAKPOINT) return 'desktop';
  return 'largeDesktop';
}

/**
 * Get initial screen size (SSR-safe)
 */
function getInitialScreenSize(): ScreenSize {
  if (typeof window === 'undefined') return 'desktop';
  return calculateScreenSize(window.innerWidth);
}

/**
 * Get initial width (SSR-safe)
 */
function getInitialWidth(): number {
  if (typeof window === 'undefined') return 1024;
  return window.innerWidth;
}

interface ScreenSizeProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that manages screen size state and event listeners
 * Single source of truth for screen size across the entire app
 */
export function ScreenSizeProvider({ children }: ScreenSizeProviderProps) {
  const [screenSize, setScreenSize] = useState<ScreenSize>(getInitialScreenSize);
  const [width, setWidth] = useState<number>(getInitialWidth);
  
  // Refs for throttling
  const rafIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateScreenSize = () => {
      const currentWidth = window.innerWidth;
      
      // Skip if already scheduled
      if (rafIdRef.current !== null) return;
      
      // Use requestAnimationFrame for smooth updates
      rafIdRef.current = requestAnimationFrame(() => {
        // Calculate new screen size
        const newScreenSize = calculateScreenSize(currentWidth);
        
        // Throttle state update to prevent excessive re-renders
        timeoutIdRef.current = setTimeout(() => {
          setWidth(currentWidth);
          setScreenSize(newScreenSize);
          rafIdRef.current = null;
          timeoutIdRef.current = null;
        }, 100);
      });
    };

    // Set initial value
    updateScreenSize();

    // Listen for resize events
    window.addEventListener('resize', updateScreenSize);
    
    // Use matchMedia for more efficient breakpoint detection
    const mobileMql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const tabletMql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const desktopMql = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT}px) and (max-width: ${DESKTOP_BREAKPOINT - 1}px)`);
    const largeDesktopMql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    const handleMobileChange = () => mobileMql.matches && updateScreenSize();
    const handleTabletChange = () => tabletMql.matches && updateScreenSize();
    const handleDesktopChange = () => desktopMql.matches && updateScreenSize();
    const handleLargeDesktopChange = () => largeDesktopMql.matches && updateScreenSize();

    mobileMql.addEventListener('change', handleMobileChange);
    tabletMql.addEventListener('change', handleTabletChange);
    desktopMql.addEventListener('change', handleDesktopChange);
    largeDesktopMql.addEventListener('change', handleLargeDesktopChange);

    return () => {
      // Cleanup resize listener
      window.removeEventListener('resize', updateScreenSize);
      
      // Cleanup matchMedia listeners
      mobileMql.removeEventListener('change', handleMobileChange);
      tabletMql.removeEventListener('change', handleTabletChange);
      desktopMql.removeEventListener('change', handleDesktopChange);
      largeDesktopMql.removeEventListener('change', handleLargeDesktopChange);
      
      // Cleanup pending animations/timeouts
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, []);

  const value: UseScreenSizeReturn = {
    isMobile: screenSize === 'mobile',
    isTablet: screenSize === 'tablet',
    isDesktop: screenSize === 'desktop',
    isLargeDesktop: screenSize === 'largeDesktop',
    screenSize,
    width,
  };

  return (
    <ScreenSizeContext.Provider value={value}>
      {children}
    </ScreenSizeContext.Provider>
  );
}

/**
 * Hook to access screen size context
 * @throws Error if used outside ScreenSizeProvider
 */
export function useScreenSize(): UseScreenSizeReturn {
  const context = useContext(ScreenSizeContext);
  if (context === undefined) {
    throw new Error('useScreenSize must be used within a ScreenSizeProvider');
  }
  return context;
}

/**
 * Hook to check if screen is mobile (backward compatibility)
 * @throws Error if used outside ScreenSizeProvider
 */
export function useIsMobile(): boolean {
  const { isMobile } = useScreenSize();
  return isMobile;
}
