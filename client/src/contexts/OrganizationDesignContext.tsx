/**
 * Organization Design Context
 * 
 * Provides organization design settings (icon set, font family, branding) globally
 * to all components. Updates automatically when organization changes or design is updated.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Organization, User, Document, AppView } from '../types';
import { preloadIconSet } from '../lib/iconLoader';
import { isInOrganizationTerritory, createTerritoryContext, resetOrganizationFonts, isPersonalView } from '../utils/organizationTerritory';

interface OrganizationDesignSettings {
  iconSet: 'lucide' | 'tabler' | 'heroicons';
  fontFamily: 'inter' | 'work-sans' | 'poppins' | 'merriweather' | 'system';
  brandingColor?: string;
  brandingLogoUrl?: string;
  brandingTitle?: string;
  brandingBannerUrl?: string;
}

interface OrganizationDesignContextType {
  settings: OrganizationDesignSettings;
  organization: Organization | null;
  currentView?: AppView;
  isSingleOrg?: boolean;
  /** True when in org view or viewing an org document that matches context org; design (icons, fonts) applies. */
  inOrganizationTerritory: boolean;
  /** Icon set to use in the current view; Lucide in personal territory, org icon set in org territory. */
  effectiveIconSet: 'lucide' | 'tabler' | 'heroicons';
  updateSettings: (organization: Organization | null) => void;
}

const defaultSettings: OrganizationDesignSettings = {
  iconSet: 'lucide',
  fontFamily: 'system',
};

const OrganizationDesignContext = createContext<OrganizationDesignContextType>({
  settings: defaultSettings,
  organization: null,
  currentView: undefined,
  isSingleOrg: false,
  inOrganizationTerritory: false,
  effectiveIconSet: 'lucide',
  updateSettings: () => {},
});

export function useOrganizationDesign() {
  return useContext(OrganizationDesignContext);
}

interface OrganizationDesignProviderProps {
  children: ReactNode;
  organization: Organization | null;
  currentView?: AppView;
  isSingleOrg?: boolean;
  user?: User | null;
  currentDocument?: Document | null;
}

export function OrganizationDesignProvider({
  children,
  organization,
  currentView,
  isSingleOrg = false,
  user = null,
  currentDocument = null,
}: OrganizationDesignProviderProps) {
  const [settings, setSettings] = useState<OrganizationDesignSettings>(defaultSettings);

  const updateSettings = (org: Organization | null) => {
    if (!org) {
      setSettings(defaultSettings);
      // Reset font to system
      resetOrganizationFonts();
      return;
    }

    const newSettings: OrganizationDesignSettings = {
      iconSet: (org.iconSet as 'lucide' | 'tabler' | 'heroicons') || 'lucide',
      fontFamily: (org.fontFamily as 'inter' | 'work-sans' | 'poppins' | 'merriweather') || 'system',
      brandingColor: org.brandingColor,
      brandingLogoUrl: org.brandingLogoUrl,
      brandingTitle: org.brandingTitle,
      brandingBannerUrl: org.brandingBannerUrl,
    };

    setSettings(newSettings);

    // Apply font family to document only when in organization territory
    // This matches the icon territory logic: icons check organizationId prop,
    // fonts check if we're in organization territory via currentView
    // Note: We use createTerritoryContext helper here instead of useTerritoryContext
    // because this is the provider itself and would create a circular dependency
    const territoryContext = createTerritoryContext(
      (currentView || 'activity') as AppView,
      isSingleOrg,
      currentDocument,
      org
    );
    const shouldApplyFont = isInOrganizationTerritory(territoryContext);
    
    if (shouldApplyFont && newSettings.fontFamily !== 'system') {
      // Remove all font classes
      document.documentElement.classList.remove('org-font-inter', 'org-font-work-sans', 'org-font-poppins', 'org-font-merriweather');
      // Add new font class
      document.documentElement.classList.add(`org-font-${newSettings.fontFamily}`);
      
      // Also set CSS variable
      const fontMap: Record<string, string> = {
        'inter': 'var(--font-inter)',
        'work-sans': 'var(--font-work-sans)',
        'poppins': 'var(--font-poppins)',
        'merriweather': 'var(--font-merriweather)',
      };
      document.documentElement.style.fontFamily = fontMap[newSettings.fontFamily] || '';
    } else {
      // Reset font to system when not in organization territory
      document.documentElement.style.fontFamily = '';
      document.documentElement.classList.remove('org-font-inter', 'org-font-work-sans', 'org-font-poppins', 'org-font-merriweather');
    }
  };

  // Update settings when organization or view changes
  useEffect(() => {
    /**
     * Font Application Priority:
     * 1. Organization font (when in organization territory)
     * 2. User font (for personal content when no organization is active)
     * 3. System default
     * 
     * Personal content includes:
     * - Activity feed
     * - Documents list
     * - Profile view
     * - Personal documents (ownershipType === 'personal' and no organizationId)
     */
    // Priority: Organization font > User font (for personal docs) > System default
    let fontToApply: 'inter' | 'work-sans' | 'poppins' | 'merriweather' | 'system' = 'system';
    let shouldApplyFont = false;

    if (organization) {
      const newSettings: OrganizationDesignSettings = {
        iconSet: (organization.iconSet as 'lucide' | 'tabler' | 'heroicons') || 'lucide',
        fontFamily: (organization.fontFamily as 'inter' | 'work-sans' | 'poppins' | 'merriweather') || 'system',
        brandingColor: organization.brandingColor,
        brandingLogoUrl: organization.brandingLogoUrl,
        brandingTitle: organization.brandingTitle,
        brandingBannerUrl: organization.brandingBannerUrl,
      };

      setSettings(newSettings);

      // Territory for this effect: preload and font only when in org territory
      const effectTerritoryContext = createTerritoryContext(
        (currentView || 'activity') as AppView,
        isSingleOrg,
        currentDocument,
        organization
      );
      shouldApplyFont = isInOrganizationTerritory(effectTerritoryContext);
      if (shouldApplyFont && (newSettings.iconSet === 'tabler' || newSettings.iconSet === 'heroicons')) {
        preloadIconSet(newSettings.iconSet);
      }

      // Apply organization font when in organization territory
      
      if (shouldApplyFont && newSettings.fontFamily !== 'system') {
        fontToApply = newSettings.fontFamily;
      }
    } else {
      // No organization - check if we should apply user font for personal content
      // For single-org users, this applies to: activity feed, personal documents, documents list, profile
      // For multi-org users, this applies to: personal documents only
      const isPersonalContent = 
        // Personal document
        (currentView === 'document' && 
         currentDocument?.ownershipType === 'personal' &&
         currentDocument?.organizationId == null) ||
        // Activity feed (personal view)
        (currentView === 'activity') ||
        // Documents list (personal view)
        (currentView === 'documents') ||
        // Profile view
        (currentView === 'profile');
      
      if (isPersonalContent && user?.preferences?.fontFamily) {
        fontToApply = user.preferences.fontFamily;
        shouldApplyFont = true;
        // Update settings with user font (but no organization branding)
        setSettings({
          ...defaultSettings,
          fontFamily: fontToApply,
        });
      } else {
        setSettings(defaultSettings);
      }
    }

    // Apply or reset font
    if (shouldApplyFont && fontToApply !== 'system') {
      // Remove all font classes
      document.documentElement.classList.remove('org-font-inter', 'org-font-work-sans', 'org-font-poppins', 'org-font-merriweather');
      // Add new font class
      document.documentElement.classList.add(`org-font-${fontToApply}`);
      
      // Also set CSS variable
      const fontMap: Record<string, string> = {
        'inter': 'var(--font-inter)',
        'work-sans': 'var(--font-work-sans)',
        'poppins': 'var(--font-poppins)',
        'merriweather': 'var(--font-merriweather)',
      };
      document.documentElement.style.fontFamily = fontMap[fontToApply] || '';
    } else {
      // Reset font to system
      resetOrganizationFonts();
    }
  }, [organization?.id, organization?.iconSet, organization?.fontFamily, organization?.brandingColor, organization?.brandingLogoUrl, organization?.brandingTitle, organization?.brandingBannerUrl, currentView, isSingleOrg, user?.preferences?.fontFamily, currentDocument?.ownershipType, currentDocument?.organizationId]);

  // Territory-aware effective values: only apply org design when in organization territory
  const view = (currentView || 'activity') as AppView;
  const territoryContext = createTerritoryContext(view, isSingleOrg, currentDocument, organization);
  const inOrganizationTerritory = isInOrganizationTerritory(territoryContext);
  // Personal views always use Lucide (no org icon set), regardless of organization/territory
  const effectiveIconSet = isPersonalView(view) ? 'lucide' : (inOrganizationTerritory ? settings.iconSet : 'lucide');

  return (
    <OrganizationDesignContext.Provider
      value={{
        settings,
        organization,
        currentView: currentView as AppView | undefined,
        isSingleOrg,
        inOrganizationTerritory,
        effectiveIconSet,
        updateSettings,
      }}
    >
      {children}
    </OrganizationDesignContext.Provider>
  );
}
