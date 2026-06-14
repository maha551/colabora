import { useEffect, useState, useMemo } from 'react';
import { getUserColor, getUserColorLight, getUserColorDark, getUserColorForText } from '../lib/userColors';

interface UseDiffColorsProps {
  suggestion1UserId?: string;
  suggestion2UserId?: string;
  highlightColor?: 'yellow' | 'green';
}

interface DiffColors {
  user1Color?: string;
  user1ColorLight?: string;
  user1ColorDark?: string;
  user1TextColor?: string;
  user1BgColor?: string;
  user2Color?: string;
  user2ColorLight?: string;
  user2ColorDark?: string;
  user2TextColor?: string;
  user2BgColor?: string;
  isDarkMode: boolean;
}

/**
 * Custom hook to manage diff view colors with dark mode support
 * Memoizes color calculations for performance
 */
export function useDiffColors({
  suggestion1UserId,
  suggestion2UserId,
  highlightColor = 'yellow',
}: UseDiffColorsProps): DiffColors {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect dark mode with debounced updates
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  // Memoize user colors to avoid recalculation
  const colors = useMemo(() => {
    // Get user colors if user IDs are provided
    const user1Color = suggestion1UserId ? getUserColor(suggestion1UserId) : undefined;
    const user1ColorLight = suggestion1UserId ? getUserColorLight(suggestion1UserId) : undefined;
    const user1ColorDark = suggestion1UserId ? getUserColorDark(suggestion1UserId) : undefined;
    const user1TextColor = suggestion1UserId ? getUserColorForText(suggestion1UserId, isDarkMode) : undefined;

    const user2Color = suggestion2UserId ? getUserColor(suggestion2UserId) : undefined;
    const user2ColorLight = suggestion2UserId ? getUserColorLight(suggestion2UserId) : undefined;
    const user2ColorDark = suggestion2UserId ? getUserColorDark(suggestion2UserId) : undefined;
    const user2TextColor = suggestion2UserId ? getUserColorForText(suggestion2UserId, isDarkMode) : undefined;

    // Choose appropriate color variant based on dark mode
    const user1BgColor = user1ColorLight && !isDarkMode 
      ? user1ColorLight 
      : (user1ColorDark && isDarkMode ? user1ColorDark : user1ColorLight || undefined);
    
    const user2BgColor = user2ColorLight && !isDarkMode 
      ? user2ColorLight 
      : (user2ColorDark && isDarkMode ? user2ColorDark : user2ColorLight || undefined);

    return {
      user1Color,
      user1ColorLight,
      user1ColorDark,
      user1TextColor,
      user1BgColor,
      user2Color,
      user2ColorLight,
      user2ColorDark,
      user2TextColor,
      user2BgColor,
      isDarkMode,
    };
  }, [suggestion1UserId, suggestion2UserId, isDarkMode]);

  return colors;
}

