/**
 * Branding Styles Hook
 * 
 * Provides shared branding styling logic for header, footer, and other components.
 * Calculates text colors, shadows, backgrounds, and other styling based on
 * organization branding and territory context.
 */

import { useMemo } from 'react';
import { Organization } from '../types';
import { shouldUseLightText, calculateOptimalOverlay } from '../utils/colorUtils';
import { DEFAULT_ORGANIZATION_COLOR } from '../lib/constants';

export interface BrandingStylesOptions {
  /** Default text color when not using branding (default: 'var(--foreground)') */
  defaultTextColor?: string;
  /** Backdrop blur value (default: 'blur(6px)') */
  backdropBlur?: string;
  /** Background opacity percentage (default: 90) */
  opacity?: number;
}

export interface BrandingStyles {
  /** Whether to use organization branding */
  useBranding: boolean;
  /** Background color (with fallback to default) */
  backgroundColor: string | undefined;
  /** Organization logo URL */
  logoUrl: string | undefined;
  /** Calculated text color with contrast */
  textColor: string;
  /** Text shadow for readability */
  textShadow: string;
  /** Border color (always transparent) */
  borderColor: string;
  /** Background style object for inline styles */
  backgroundStyle: {
    backgroundColor?: string;
    backdropFilter: string;
    backgroundImage?: string;
    backgroundBlendMode?: string;
  };
}

/**
 * Hook to calculate branding styles based on organization and territory context.
 * 
 * @param organization - The organization to use for branding (null for no branding)
 * @param inOrgTerritory - Whether we're currently in organization territory
 * @param options - Optional styling overrides
 * @returns Branding styles object
 */
export function useBrandingStyles(
  organization: Organization | null,
  inOrgTerritory: boolean,
  options: BrandingStylesOptions = {}
): BrandingStyles {
  const {
    defaultTextColor = 'var(--foreground)',
    backdropBlur = 'blur(6px)',
    opacity = 90,
  } = options;

  return useMemo(() => {
    // Determine branding values - only use branding when in organization territory
    const useBranding = !!organization && inOrgTerritory;
    const backgroundColor = useBranding 
      ? (organization.brandingColor || DEFAULT_ORGANIZATION_COLOR)
      : undefined;
    const logoUrl = organization?.brandingLogoUrl;

    // Calculate text color based on background
    const isLightText = useBranding && backgroundColor 
      ? shouldUseLightText(backgroundColor)
      : false; // Default to dark text for theme foreground
    
    const textColor = isLightText 
      ? 'var(--color-white)' 
      : defaultTextColor;

    // Calculate optimal overlay based on background and text color
    const overlayGradient = calculateOptimalOverlay(
      backgroundColor,
      textColor,
      4.5 // WCAG AA for normal text (header title is large, but use AA for safety)
    );

    // Border color: always transparent
    const borderColor = 'transparent';

    // Background style with opacity, blur, and adaptive overlay
    const backgroundStyle = {
      backgroundColor: backgroundColor 
        ? `color-mix(in srgb, ${backgroundColor} ${opacity}%, transparent)`
        : 'color-mix(in srgb, var(--background) 60%, transparent)', // Reduced from 70% to 60% for better visibility
      backdropFilter: `${backdropBlur} saturate(150%)`,
      backgroundImage: overlayGradient,
      backgroundBlendMode: 'overlay' as const,
    };

    return {
      useBranding,
      backgroundColor,
      logoUrl,
      textColor,
      textShadow: 'none', // Remove shadows - overlay handles contrast
      borderColor,
      backgroundStyle,
    };
  }, [organization, inOrgTerritory, defaultTextColor, backdropBlur, opacity]);
}

