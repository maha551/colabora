/**
 * Organization Territory Utilities
 * 
 * Single source of truth for determining organization vs personal territory.
 * Used by fonts, icons, branding colors, and active organization determination.
 */

import { Organization, Document } from '../types';

export type AppView = 'documents' | 'activity' | 'document' | 'profile' | 'settings' |
  'member-profile' | 'organizations' | 'organization' | 'admin' | 'search' | 'report-issue';

/**
 * Views that are always personal territory (no org icon set, no org fonts in UI).
 * Only 'organization' and 'document' can be org territory; all others are personal.
 * When adding a new AppView, add it here if it is personal, otherwise it is org-related.
 */
export const PERSONAL_VIEWS: ReadonlySet<AppView> = new Set([
  'activity',
  'documents',
  'profile',
  'settings',
  'organizations',
  'admin',
  'search',
  'report-issue',
  'member-profile',
]);

/**
 * True when the view is always personal territory (org design never applies).
 * For 'document' and 'organization', use isInOrganizationTerritory with full context instead.
 */
export function isPersonalView(view: AppView): boolean {
  return PERSONAL_VIEWS.has(view);
}

export interface TerritoryContext {
  view: AppView;
  isSingleOrg: boolean;
  document?: Document | null;
  organization?: Organization | null;
}

/**
 * Creates a TerritoryContext object with consistent structure.
 * This helper ensures all territory context construction follows the same pattern.
 * 
 * @param view - The current app view
 * @param isSingleOrg - Whether the user belongs to a single organization
 * @param document - The current document (if any)
 * @param organization - The organization (if any)
 * @returns A TerritoryContext object
 */
export function createTerritoryContext(
  view: AppView,
  isSingleOrg: boolean,
  document?: Document | null,
  organization?: Organization | null
): TerritoryContext {
  return {
    view,
    isSingleOrg,
    document,
    organization,
  };
}

/**
 * Determines if organization styling should be applied based on view and context.
 * This is the single source of truth for territory logic.
 * 
 * Rules:
 * - 'organization' view: always in org territory
 * - 'document' view: only in org territory if document is organizational and matches org
 * - All other views are personal territory (no org styling):
 *   - 'activity' - Personal activity feed
 *   - 'profile' - User profile
 *   - 'documents' - Documents list
 *   - 'organizations' - Organizations list
 *   - 'admin' - Admin dashboard
 *   - 'search' - Search view
 *   - 'member-profile' - Member profile view
 */
export function isInOrganizationTerritory(context: TerritoryContext): boolean {
  const { view, document, organization } = context;
  
  // No organization means no org territory
  if (!organization) {
    return false;
  }

  // Organization view: always in org territory
  if (view === 'organization') {
    return true;
  }

  // Document view: only in org territory if document is organizational
  if (view === 'document') {
    return document?.ownershipType === 'organizational' && 
           document?.organizationId != null &&
           document.organizationId === organization.id;
  }

  // All other views are personal territory (activity, profile, documents, organizations, admin, search, member-profile)
  return false;
}

/**
 * Determines which organization should be active based on view and user type.
 * Used by getActiveOrganization() in App.tsx
 * 
 * Priority for single-org users:
 * - Organization view: always return org
 * - Document view: return org only if document is organizational
 * - All other views: return null
 * 
 * Priority for multi-org users:
 * - selectedOrganization (if in user's orgs list)
 * - documentOrganization (if document view and document belongs to org)
 * - null otherwise
 */
export function determineActiveOrganization(
  view: AppView,
  isSingleOrg: boolean,
  primaryOrganization: Organization | null,
  selectedOrganization: Organization | null,
  documentOrganization: Organization | null,
  currentDocument: Document | null,
  organizations: Organization[]
): Organization | null {
  // For single-org users: only return org when viewing organizational content
  if (isSingleOrg && primaryOrganization) {
    // Personal views: no org
    if (view === 'activity' || view === 'profile' || view === 'documents') {
      return null;
    }
    
    // Document view: only if document is organizational
    if (view === 'document') {
      if (currentDocument?.ownershipType === 'organizational' && 
          currentDocument?.organizationId === primaryOrganization.id) {
        return primaryOrganization;
      }
      return null;
    }
    
    // Organization view: always return org
    if (view === 'organization') {
      return primaryOrganization;
    }
    
    // Other views: no org
    return null;
  }

  // Multi-org users: check selectedOrganization first
  if (selectedOrganization) {
    const hasAccess = organizations.some(org => org.id === selectedOrganization.id);
    if (hasAccess) {
      // Organization view: always return selected org
      if (view === 'organization') {
        return selectedOrganization;
      }
      
      // For document view, verify document belongs to selected org
      if (view === 'document' && currentDocument) {
        if (currentDocument.organizationId === selectedOrganization.id) {
          return selectedOrganization;
        }
        // Document belongs to different org, fall through to documentOrganization
      }
      
      // All other views (activity, profile, documents, organizations, admin, search, member-profile)
      // are personal territory and should not have an active organization
    }
  }

  // Fall back to documentOrganization for document view
  if (view === 'document' && documentOrganization) {
    const hasAccess = organizations.some(org => org.id === documentOrganization.id);
    if (hasAccess && currentDocument?.organizationId === documentOrganization.id) {
      return documentOrganization;
    }
  }

  // If documentOrganization is null but document has organizationId, try to find it in organizations list
  // This handles the case where documentOrganization is still loading but org is already available
  if (view === 'document' && !documentOrganization && currentDocument?.organizationId) {
    if (currentDocument.ownershipType === 'organizational') {
      const foundOrg = organizations.find(org => org.id === currentDocument.organizationId);
      if (foundOrg) {
        return foundOrg;
      }
    }
  }

  return null;
}

/**
 * Resets all organization fonts to system default
 * Removes font classes and inline styles from document element
 */
export function resetOrganizationFonts(): void {
  // Remove all font classes
  document.documentElement.classList.remove(
    'org-font-inter',
    'org-font-work-sans', 
    'org-font-poppins',
    'org-font-merriweather'
  );
  
  // Reset inline font style
  document.documentElement.style.fontFamily = '';
}

