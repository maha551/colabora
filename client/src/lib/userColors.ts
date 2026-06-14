/**
 * User Color Assignment Utility
 * 
 * Provides deterministic color assignment for users based on their ID.
 * Each user gets a consistent color across all documents and views.
 */

/**
 * Palette of 24 distinct, accessible colors in HSL format
 * Colors are chosen for good visual separation and WCAG AA compliance
 */
export const USER_COLOR_PALETTE = [
  // Warm colors
  { h: 0, s: 70, l: 50 },   // Red
  { h: 15, s: 75, l: 55 },  // Orange-red
  { h: 30, s: 80, l: 55 },  // Orange
  { h: 45, s: 75, l: 55 },  // Amber
  { h: 60, s: 70, l: 50 },  // Yellow
  
  // Green range
  { h: 120, s: 65, l: 50 }, // Green
  { h: 150, s: 60, l: 50 }, // Teal-green
  { h: 180, s: 65, l: 50 }, // Cyan
  
  // Blue range
  { h: 210, s: 70, l: 50 }, // Blue
  { h: 240, s: 70, l: 50 }, // Indigo
  { h: 270, s: 65, l: 50 }, // Purple
  
  // Pink/Magenta range
  { h: 300, s: 65, l: 50 }, // Magenta
  { h: 330, s: 70, l: 55 }, // Pink
  
  // Additional distinct colors
  { h: 20, s: 85, l: 50 },  // Deep orange
  { h: 90, s: 60, l: 50 },  // Yellow-green
  { h: 140, s: 55, l: 50 }, // Mint
  { h: 200, s: 65, l: 50 }, // Sky blue
  { h: 220, s: 70, l: 45 }, // Deep blue
  { h: 260, s: 60, l: 50 }, // Lavender
  { h: 280, s: 70, l: 50 }, // Violet
  { h: 310, s: 60, l: 55 }, // Rose
  { h: 340, s: 75, l: 55 }, // Coral
  { h: 10, s: 80, l: 50 },  // Vermillion
  { h: 50, s: 75, l: 55 },  // Gold
] as const;

/**
 * Simple hash function to convert user ID to a number
 * Uses a combination of character codes for deterministic hashing
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get the color index for a user ID
 */
function getUserColorIndex(userId: string): number {
  const hash = hashUserId(userId);
  return hash % USER_COLOR_PALETTE.length;
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Calculate relative luminance for contrast checking
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Get primary color for a user (for borders, badges, etc.)
 * Returns hex color string
 */
export function getUserColor(userId: string): string {
  const index = getUserColorIndex(userId);
  const color = USER_COLOR_PALETTE[index];
  return hslToHex(color.h, color.s, color.l);
}

/**
 * Get light variant of user color (for backgrounds, highlights)
 * Returns hex color string with higher lightness
 */
export function getUserColorLight(userId: string): string {
  const index = getUserColorIndex(userId);
  const color = USER_COLOR_PALETTE[index];
  // Increase lightness by 40% for light backgrounds
  const lightL = Math.min(95, color.l + 40);
  return hslToHex(color.h, Math.max(20, color.s - 30), lightL);
}

/**
 * Get dark variant of user color (for dark mode)
 * Returns hex color string with lower lightness
 */
export function getUserColorDark(userId: string): string {
  const index = getUserColorIndex(userId);
  const color = USER_COLOR_PALETTE[index];
  // Decrease lightness by 20% for dark mode
  const darkL = Math.max(30, color.l - 20);
  return hslToHex(color.h, Math.min(100, color.s + 10), darkL);
}

/**
 * Get appropriate text color for a user's color (ensures contrast)
 * Returns 'white' or 'black' based on luminance
 * 
 * For text on user-colored backgrounds:
 * - Light colors (high luminance) need dark text
 * - Dark colors (low luminance) need light text
 * 
 * Note: When using getUserColorDark in dark mode, consider using that color's luminance
 * for better contrast calculation if needed.
 */
export function getUserColorForText(userId: string, isDarkMode: boolean = false): string {
  // Use the appropriate color variant based on dark mode
  const color = isDarkMode ? getUserColorDark(userId) : getUserColor(userId);
  // Extract RGB from hex
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  const luminance = getLuminance(r, g, b);
  // For contrast: light backgrounds need dark text, dark backgrounds need light text
  // Threshold of 0.5 provides good contrast for WCAG AA compliance
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Get CSS variable-compatible color string for use in inline styles
 * Returns the color as a hex string that can be used directly
 */
export function getUserColorStyle(userId: string): string {
  return getUserColor(userId);
}

/**
 * Get CSS variable-compatible light color string
 */
export function getUserColorLightStyle(userId: string): string {
  return getUserColorLight(userId);
}

/**
 * Get CSS variable-compatible dark color string
 */
export function getUserColorDarkStyle(userId: string): string {
  return getUserColorDark(userId);
}

/**
 * Generate a CSS linear gradient string for horizontal rainbow stripes
 * Uses a subset of colors from the user color palette (6 colors)
 * Returns a gradient string suitable for CSS background
 * Creates distinct horizontal stripes (like a flag) with each color taking equal space
 */
export function getRainbowGradient(): string {
  // Select 6 colors that span the full spectrum: Red, Orange, Yellow, Green, Blue, Magenta
  const selectedIndices = [0, 2, 4, 5, 8, 11]; // Red, Orange, Yellow, Green, Blue, Magenta
  const selectedColors = selectedIndices.map(index => {
    const color = USER_COLOR_PALETTE[index];
    return hslToHex(color.h, color.s, color.l);
  });
  
  const colorCount = selectedColors.length;
  
  // Create gradient stops for distinct stripes
  // Each color gets an equal portion from top to bottom
  const stops: string[] = [];
  for (let i = 0; i < colorCount; i++) {
    const startPercent = (i / colorCount) * 100;
    const endPercent = ((i + 1) / colorCount) * 100;
    // Each color appears at both its start and end to create a solid stripe
    stops.push(`${selectedColors[i]} ${startPercent}%`);
    stops.push(`${selectedColors[i]} ${endPercent}%`);
  }
  
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/**
 * Calculate average luminance across all user colors
 * Used to determine appropriate text color for rainbow backgrounds
 * Returns a value between 0 (dark) and 1 (light)
 */
export function getAverageLuminance(): number {
  const colors = USER_COLOR_PALETTE.map(color => hslToHex(color.h, color.s, color.l));
  let totalLuminance = 0;
  
  for (const hex of colors) {
    const hexClean = hex.replace('#', '');
    const r = parseInt(hexClean.substring(0, 2), 16);
    const g = parseInt(hexClean.substring(2, 4), 16);
    const b = parseInt(hexClean.substring(4, 6), 16);
    totalLuminance += getLuminance(r, g, b);
  }
  
  return totalLuminance / colors.length;
}
