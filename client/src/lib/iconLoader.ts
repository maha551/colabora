/**
 * Dynamic Icon Loader
 * 
 * Loads icons from different icon libraries based on organization's iconSet preference.
 * Falls back to Lucide if no preference is set or if the selected library is unavailable.
 */

import { getIconNameForSet } from './iconMappings';
import { LUCIDE_ICONS } from './lucideIcons';
import { logger } from './logger';

export type IconSet = 'lucide' | 'tabler' | 'heroicons';

// Type for icon library modules with dynamic property access
type IconLibrary = Record<string, React.ComponentType<{ className?: string }>>;

/**
 * Returns true for both plain function components and forwardRef/memo objects.
 * Lucide icons in v0.4+ use React.forwardRef(), which produces an object
 * (typeof === 'object') with a .render function — NOT typeof === 'function'.
 * Tabler icons are plain function components (typeof === 'function').
 */
function isReactComponent(v: unknown): v is React.ComponentType {
  if (v == null) return false;
  if (typeof v === 'function') return true;
  if (typeof v === 'object' && typeof (v as { render?: unknown }).render === 'function') return true;
  return false;
}

// Helper function to safely get icon from library
function getIconFromLibrary(
  library: IconLibrary | Record<string, unknown>,
  iconName: string
): React.ComponentType<{ className?: string }> | null {
  const icon = library[iconName];
  if (isReactComponent(icon)) {
    return icon as React.ComponentType<{ className?: string }>;
  }
  return null;
}

// Cache for loaded icon libraries - Lucide uses static registry so it is always available
const LucideIcons = LUCIDE_ICONS;
let TablerIcons: Record<string, React.ComponentType<{ className?: string }>> | null = null;
let HeroiconsOutline: Record<string, React.ComponentType<{ className?: string }>> | null = null;

// Lucide icons are from static registry; return immediately for API compatibility
const loadLucideIcons = async () => Promise.resolve(LucideIcons);

// Lazy load Tabler icons
const loadTablerIcons = async () => {
  if (!TablerIcons) {
    try {
      TablerIcons = await import('@tabler/icons-react');
    } catch (error) {
      logger.error('Failed to load Tabler icons:', error);
      TablerIcons = {}; // Empty object to prevent repeated import attempts
    }
  }
  return TablerIcons;
};

// Lazy load Heroicons outline (default variant)
const loadHeroiconsOutline = async () => {
  if (!HeroiconsOutline) {
    try {
      HeroiconsOutline = await import('@heroicons/react/24/outline');
    } catch (error) {
      logger.error('Failed to load Heroicons outline:', error);
      HeroiconsOutline = {}; // Empty object to prevent repeated import attempts
    }
  }
  return HeroiconsOutline;
};


/**
 * Get an icon component from the specified icon set (async)
 * @param iconName - Name of the icon (e.g., 'Users', 'FileText')
 * @param iconSet - Which icon library to use
 * @returns React component for the icon, or null if not found
 */
export async function getIcon(
  iconName: string,
  iconSet: IconSet = 'lucide'
): Promise<React.ComponentType<{ className?: string }> | null> {
  try {
    switch (iconSet) {
      case 'lucide': {
        const lucide = await loadLucideIcons();
        return getIconFromLibrary(lucide as IconLibrary, iconName) ?? null;
      }

      case 'tabler': {
        // Tabler icons use Icon prefix (e.g., IconUsers)
        // Use mapping if available, otherwise try Icon{Name} format
        const tabler = await loadTablerIcons();
        const mappedTablerName = getIconNameForSet(iconName, 'tabler');
        const TablerIcon = tabler[mappedTablerName];
        if (TablerIcon) {
          return TablerIcon;
        }
        // Fallback to Lucide if not found
        const lucideFallback = await loadLucideIcons();
        return getIconFromLibrary(lucideFallback as IconLibrary, iconName) ?? null;
      }

      case 'heroicons': {
        // Heroicons use {Name}Icon format and are in outline/solid variants
        // Default to outline variant (matches Lucide style)
        // Use mapping if available, otherwise try {Name}Icon format
        const heroiconsOutline = await loadHeroiconsOutline();
        const mappedHeroiconName = getIconNameForSet(iconName, 'heroicons');
        const Heroicon = heroiconsOutline[mappedHeroiconName];
        if (Heroicon) {
          return Heroicon;
        }
        // Fallback to Lucide if not found
        const lucideFallback2 = await loadLucideIcons();
        return getIconFromLibrary(lucideFallback2 as IconLibrary, iconName) ?? null;
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error(`Error loading icon ${iconName} from ${iconSet}:`, error);
    // Fallback to Lucide
    if (iconSet !== 'lucide') {
      try {
        const lucideErrorFallback = await loadLucideIcons();
        return getIconFromLibrary(lucideErrorFallback as IconLibrary, iconName) ?? null;
      } catch (e) {
        return null;
      }
    }
    return getIconFromLibrary(LucideIcons as IconLibrary, iconName) ?? null;
  }
}

/**
 * Synchronous icon getter for immediate use.
 * Only works for Lucide — Tabler and Heroicons are async-only (lazy loaded).
 * Use getIcon() for non-Lucide sets.
 */
export function getIconSync(iconName: string, iconSet: IconSet = 'lucide'): React.ComponentType<{ className?: string }> | null {
  if (iconSet === 'lucide') {
    return getIconFromLibrary(LucideIcons as IconLibrary, iconName) ?? null;
  }
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    console.warn(`[getIconSync] iconSet="${iconSet}" is async-only. Use getIcon() instead.`);
  }
  return null;
}

/**
 * Preload icon libraries for better performance
 * Call this when an organization with custom iconSet is detected
 */
export async function preloadIconSet(iconSet: IconSet): Promise<void> {
  switch (iconSet) {
    case 'tabler':
      await loadTablerIcons();
      break;
    case 'heroicons':
      await loadHeroiconsOutline();
      break;
    case 'lucide':
      // Preload Lucide icons
      await loadLucideIcons();
      break;
  }
}
