/**
 * Application-wide constants
 */

/**
 * Default organization branding color (blue)
 * Used when an organization doesn't have a custom branding color set
 */
export const DEFAULT_ORGANIZATION_COLOR = '#3B82F6';

/**
 * App logo asset paths (theme-specific PNGs in /public)
 */
export const APP_LOGO_LIGHT_PATH = '/logo-light.png';
export const APP_LOGO_DARK_PATH = '/logo-dark.png';
export const APP_NAME = 'colabora';

/**
 * Vote-related constants
 */
export const VOTE_UPDATE_TIMEOUT = 60000; // ms - stop showing loading state; do not reload (WebSocket applies update; vote can take 30s+ under lock)
export const VOTE_COOLDOWN_MS = 2000; // milliseconds - cooldown between votes
export const VOTE_FALLBACK_TIMEOUT = 1000; // milliseconds - fallback timeout for clearing voting state