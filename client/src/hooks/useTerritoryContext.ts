/**
 * Territory Context Hook
 * 
 * Provides territory information to components that need to know
 * if they're in organization territory or personal territory.
 */

import { useMemo } from 'react';
import { useOrganizationDesign } from '../contexts/OrganizationDesignContext';
import { useDocumentView } from './useDocumentView';
import { useUserOrganizations } from './useUserOrganizations';
import { isInOrganizationTerritory, createTerritoryContext, AppView } from '../utils/organizationTerritory';
import { useAuthStore } from '../stores/useAuthStore';

export function useTerritoryContext(view?: AppView) {
  const { organization, currentView: contextView } = useOrganizationDesign();
  const { currentDocument } = useDocumentView();
  const currentUser = useAuthStore((s) => s.currentUser);
  const { isSingleOrg } = useUserOrganizations(currentUser);
  
  // Use provided view, or get from context, or fallback to 'activity'
  // If we have a document and organization, and document is organizational, treat as 'document' view
  const resolvedView = useMemo(() => {
    if (view) return view;
    if (contextView) return contextView;
    // If we have an organizational document and matching organization, treat as document view
    // This ensures branding shows even if view isn't explicitly set yet
    if (currentDocument?.ownershipType === 'organizational' && 
        currentDocument?.organizationId && 
        organization?.id === currentDocument.organizationId) {
      return 'document';
    }
    return 'activity';
  }, [view, contextView, currentDocument, organization]);
  
  const territoryContext = useMemo(() => 
    createTerritoryContext(resolvedView, isSingleOrg, currentDocument, organization),
    [resolvedView, isSingleOrg, currentDocument, organization]
  );
  
  const inOrgTerritory = useMemo(() => {
    // First check standard territory logic
    const standardResult = isInOrganizationTerritory(territoryContext);
    if (standardResult) return true;
    
    // Additional check: if we have an organizational document and matching organization,
    // we should be in org territory regardless of view (handles edge cases where view might not be set correctly)
    if (currentDocument?.ownershipType === 'organizational' && 
        currentDocument?.organizationId && 
        organization?.id === currentDocument.organizationId) {
      return true;
    }
    
    return false;
  }, [territoryContext, currentDocument, organization]);
  
  return {
    territoryContext,
    inOrgTerritory,
    organization
  };
}

