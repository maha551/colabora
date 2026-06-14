/**
 * App Logo Component
 *
 * Theme-aware logo using separate light/dark PNG assets from /public.
 */

import React, { useState } from 'react';
import { cn } from '../ui/utils';
import { APP_LOGO_LIGHT_PATH, APP_LOGO_DARK_PATH, APP_NAME } from '../../lib/constants';
import { COLORS } from '../../lib/designSystem';
import { logger } from '../../lib/logger';

interface AppLogoProps {
  /** Logo size: sm (24px), md (40px), lg (64px), xl (128px) */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes */
  className?: string;
  /** @deprecated Both variants use the same theme-aware PNG assets */
  variant?: 'default' | 'monochrome';
  /** Alt text for accessibility */
  alt?: string;
  /** ARIA label for screen readers */
  'aria-label'?: string;
}

const SIZE_CLASSES = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-16 w-16',
  xl: 'h-32 w-32',
} as const;

export function AppLogo({
  size = 'md',
  className,
  alt = `${APP_NAME} logo`,
  'aria-label': ariaLabel,
}: AppLogoProps) {
  const [lightError, setLightError] = useState(false);
  const [darkError, setDarkError] = useState(false);

  const sizeClass = SIZE_CLASSES[size];
  const finalAriaLabel = ariaLabel || alt;

  const handleLightError = () => {
    if (import.meta.env.DEV) {
      logger.warn('Light logo failed to load');
    }
    setLightError(true);
  };

  const handleDarkError = () => {
    if (import.meta.env.DEV) {
      logger.warn('Dark logo failed to load');
    }
    setDarkError(true);
  };

  if (lightError && darkError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center',
          sizeClass,
          COLORS.text.primary,
          'rounded font-semibold text-center',
          className
        )}
        role="img"
        aria-label={finalAriaLabel}
      >
        <span className="text-xs md:text-sm">{APP_NAME}</span>
      </div>
    );
  }

  return (
    <span
      className={cn('inline-block shrink-0', sizeClass, className)}
      role="img"
      aria-label={finalAriaLabel}
    >
      {!lightError && (
        <img
          src={APP_LOGO_LIGHT_PATH}
          alt=""
          className="h-full w-full object-contain dark:hidden"
          onError={handleLightError}
        />
      )}
      {!darkError && (
        <img
          src={APP_LOGO_DARK_PATH}
          alt=""
          className="hidden h-full w-full object-contain dark:block"
          onError={handleDarkError}
        />
      )}
    </span>
  );
}
