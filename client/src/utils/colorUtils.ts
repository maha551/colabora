/**
 * Color utility functions for determining text contrast and color calculations
 */

/**
 * Calculate WCAG-standard relative luminance for a color
 * Returns a value between 0 (black) and 1 (white)
 * 
 * @param color - Hex color string (e.g., "#3B82F6") or CSS variable
 * @returns Relative luminance value (0-1)
 */
export function getRelativeLuminance(color: string): number {
  // Handle CSS variables - estimate based on theme
  if (color.startsWith('var(--')) {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    // Estimate based on common theme values
    if (color.includes('foreground')) {
      return isDark ? 0.92 : 0.15;
    }
    if (color.includes('background')) {
      return isDark ? 0.18 : 0.98;
    }
    if (color.includes('white')) {
      return 1.0;
    }
    // Default fallback
    return isDark ? 0.5 : 0.5;
  }
  
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    // WCAG standard luminance calculation
    const [rs, gs, bs] = [r, g, b].map(val => 
      val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  
  return 0.5; // Default fallback
}

/**
 * Calculate WCAG contrast ratio between two colors
 * Returns a value between 1 (no contrast) and 21 (maximum contrast)
 * 
 * @param color1 - First color (hex or CSS variable)
 * @param color2 - Second color (hex or CSS variable)
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculate optimal overlay gradient for header background
 * Ensures WCAG AA contrast (4.5:1) with theme foreground color
 * 
 * @param baseBackground - Brand color (hex) or undefined (for animated backgrounds)
 * @param textColor - Theme foreground color (var(--foreground) or var(--color-white))
 * @param targetContrast - Minimum contrast ratio (default: 4.5 for WCAG AA)
 * @returns CSS gradient string for overlay
 */
export function calculateOptimalOverlay(
  baseBackground: string | undefined,
  textColor: string = 'var(--foreground)',
  targetContrast: number = 4.5
): string {
  // Detect theme
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  
  // Get text color luminance
  const textLuminance = getRelativeLuminance(textColor);
  
  // Estimate base background luminance
  let baseLuminance: number;
  
  if (baseBackground && baseBackground.startsWith('#')) {
    // Brand color - calculate actual luminance
    baseLuminance = getRelativeLuminance(baseBackground);
  } else {
    // No brand color - estimate animated background
    // Animated backgrounds are colorful gradients, estimate average
    baseLuminance = isDark ? 0.25 : 0.75;
  }
  
  // Determine if we need dark or light overlay
  // If text is light (high luminance), we need dark overlay
  // If text is dark (low luminance), we need light overlay
  const needsDarkOverlay = textLuminance > 0.5;
  
  // Calculate required overlay opacity to achieve target contrast
  let overlayOpacity = 0.15; // Default subtle overlay
  
  if (needsDarkOverlay) {
    // Need to darken background for light text
    // Calculate target luminance: (textLum + 0.05) / contrast - 0.05
    const targetLum = (textLuminance + 0.05) / targetContrast - 0.05;
    if (targetLum < baseLuminance) {
      // Calculate opacity needed: (baseLum - targetLum) / baseLum
      overlayOpacity = Math.min(0.3, Math.max(0.1, (baseLuminance - targetLum) / baseLuminance));
    }
  } else {
    // Need to lighten background for dark text
    // Calculate target luminance: (textLum + 0.05) * contrast - 0.05
    const targetLum = (textLuminance + 0.05) * targetContrast - 0.05;
    if (targetLum > baseLuminance) {
      // Calculate opacity needed: (targetLum - baseLum) / (1 - baseLum)
      overlayOpacity = Math.min(0.3, Math.max(0.1, (targetLum - baseLuminance) / (1 - baseLuminance)));
    }
  }
  
  // Create gradient overlay with subtle variation
  if (needsDarkOverlay) {
    return `linear-gradient(to bottom, 
      rgba(0, 0, 0, ${(overlayOpacity * 1.2).toFixed(3)}), 
      rgba(0, 0, 0, ${(overlayOpacity * 0.4).toFixed(3)})
    )`;
  } else {
    return `linear-gradient(to bottom, 
      rgba(255, 255, 255, ${(overlayOpacity * 1.2).toFixed(3)}), 
      rgba(255, 255, 255, ${(overlayOpacity * 0.4).toFixed(3)})
    )`;
  }
}

/**
 * Calculate luminance of a color to determine if text should be light or dark
 * Returns true if text should be light (for dark backgrounds)
 * 
 * @param hexColor - Hex color string (e.g., "#3B82F6")
 * @returns true if light text should be used (background is dark)
 */
export function shouldUseLightText(hexColor: string): boolean {
  if (!hexColor || !hexColor.startsWith('#')) {
    return false;
  }

  // Remove # and convert to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Use light text if background is dark (luminance < 0.5)
  return luminance < 0.5;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse #RRGGBB hex; returns null for invalid input. */
export function parseHexColor(hexColor: string): Rgb | null {
  if (!hexColor?.startsWith('#') || hexColor.length !== 7) {
    return null;
  }
  const hex = hexColor.slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return { r, g, b };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Linear blend between two RGB colors (weight on `a`). */
function mixRgb(a: Rgb, b: Rgb, weightOnA: number): Rgb {
  const w = Math.max(0, Math.min(1, weightOnA));
  return {
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
  };
}

export interface OrgFolderTabColors {
  accent: string;
  tabInactive: string;
  tabInactiveBorder: string;
  tabHighlight: string;
  shelf: string;
}

/**
 * Derive inactive org-folder tab surfaces from brand color — desaturated via mix with neutral grey.
 */
export function getOrgFolderTabColors(brandHex: string, isDark: boolean): OrgFolderTabColors {
  const brand = parseHexColor(brandHex) ?? parseHexColor('#3B82F6')!;

  if (isDark) {
    const canvas = { r: 39, g: 39, b: 42 };
    const edge = { r: 52, g: 52, b: 56 };
    const tabInactive = mixRgb(brand, canvas, 0.2);
    const tabInactiveBorder = mixRgb(brand, edge, 0.32);
    const tabHighlight = mixRgb(brand, { r: 58, g: 58, b: 62 }, 0.12);
    return {
      accent: brandHex,
      tabInactive: rgbToHex(tabInactive),
      tabInactiveBorder: rgbToHex(tabInactiveBorder),
      tabHighlight: rgbToHex(tabHighlight),
      shelf: rgbToHex(tabInactiveBorder),
    };
  }

  const canvas = { r: 244, g: 244, b: 245 };
  const edge = { r: 228, g: 228, b: 231 };
  const tabInactive = mixRgb(brand, canvas, 0.14);
  const tabInactiveBorder = mixRgb(brand, edge, 0.26);
  const tabHighlight = mixRgb(brand, { r: 255, g: 255, b: 255 }, 0.06);
  return {
    accent: brandHex,
    tabInactive: rgbToHex(tabInactive),
    tabInactiveBorder: rgbToHex(tabInactiveBorder),
    tabHighlight: rgbToHex(tabHighlight),
    shelf: rgbToHex(tabInactiveBorder),
  };
}

