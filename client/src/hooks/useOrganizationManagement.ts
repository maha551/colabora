// Custom hook for organization management
// Extracted from App.tsx to reduce complexity and improve modularity

import { useState, useEffect, useRef, useCallback } from 'react';
import { organizationsApi } from '../lib/api';
import { logger } from '../lib/logger';
import { determineActiveOrganization } from '../utils/organizationTerritory';
import type { Organization, Document, AppView, User } from '../types';

interface UseOrganizationManagementOptions {
  currentView: AppView;
  currentDocument: Document | null;
  currentUser: User | null;
  organizations: Organization[];
  isSingleOrg: boolean;
  primaryOrganization: Organization | null;
  selectedOrganization: Organization | null;
  setSelectedOrganization: (org: Organization | null) => void;
  setCurrentView: (view: AppView) => void;
  clearDocument: () => void;
  refreshOrganizations: () => Promise<Organization[]>;
  navigateToHash: (hash: string) => void;
}

export function useOrganizationManagement({
  currentView,
  currentDocument,
  currentUser,
  organizations,
  isSingleOrg,
  primaryOrganization,
  selectedOrganization,
  setSelectedOrganization,
  setCurrentView,
  clearDocument,
  refreshOrganizations,
  navigateToHash,
}: UseOrganizationManagementOptions) {
  const [documentOrganization, setDocumentOrganization] = useState<Organization | null>(null);
  const [documentOrganizationLoading, setDocumentOrganizationLoading] = useState(false);
  const failedOrganizationFetchRef = useRef<Set<string>>(new Set());

  // Fetch organization when viewing a document that belongs to an organization
  useEffect(() => {
    if (currentDocument?.organizationId) {
      // Check if organization is already in the loaded organizations list
      const existingOrg = organizations.find(org => org.id === currentDocument.organizationId);
      if (existingOrg) {
        setDocumentOrganization(existingOrg);
        setDocumentOrganizationLoading(false);
        // Clear failed fetch tracking for this org since we found it
        failedOrganizationFetchRef.current.delete(currentDocument.organizationId);
      } else {
        // Don't retry if we've already failed to fetch this organization
        if (failedOrganizationFetchRef.current.has(currentDocument.organizationId)) {
          setDocumentOrganization(null);
          setDocumentOrganizationLoading(false);
          return;
        }
        
        setDocumentOrganizationLoading(true);
        // Fetch organization if not in the list
        organizationsApi.getOrganization(currentDocument.organizationId)
          .then(response => {
            setDocumentOrganization(response.organization);
            setDocumentOrganizationLoading(false);
            // Clear failed fetch tracking on success
            failedOrganizationFetchRef.current.delete(currentDocument.organizationId);
          })
          .catch(error => {
            logger.error('Failed to load document organization:', error);
            setDocumentOrganization(null);
            setDocumentOrganizationLoading(false);
            // Mark this organization as failed to prevent repeated fetches
            failedOrganizationFetchRef.current.add(currentDocument.organizationId);
          });
      }
    } else {
      setDocumentOrganization(null);
      setDocumentOrganizationLoading(false);
      // Clear failed fetch tracking when document has no organization
      failedOrganizationFetchRef.current.clear();
    }
  }, [currentDocument?.organizationId, organizations]);

  // Unified organization determination logic - single source of truth
  // Priority: single-org primary > selectedOrganization > documentOrganization
  // Only returns organizations that the current user has access to
  // For single-org users: only return org when viewing organizational content
  const getActiveOrganization = useCallback((): Organization | null => {
    // Log warning if organizations array is empty but user exists
    if (organizations.length === 0 && currentUser) {
      logger.warn('getActiveOrganization: No organizations found for user', {
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.name,
      });
    }

    // For organizational documents, always try to find the organization
    // This ensures branding shows even during loading
    if (currentView === 'document' && currentDocument?.ownershipType === 'organizational' && currentDocument?.organizationId) {
      // First, check if selectedOrganization matches the document
      if (selectedOrganization) {
        const hasAccess = organizations.some(org => org.id === selectedOrganization.id);
        if (hasAccess && currentDocument.organizationId === selectedOrganization.id) {
          return selectedOrganization;
        }
      }
      
      // For single-org users, check if primaryOrganization matches
      if (isSingleOrg && primaryOrganization && currentDocument.organizationId === primaryOrganization.id) {
        return primaryOrganization;
      }
      
      // Try to find organization in organizations list (works even during loading)
      const foundOrg = organizations.find(org => org.id === currentDocument.organizationId);
      if (foundOrg) {
        return foundOrg;
      }
      
      // If documentOrganization is already loaded, use it
      if (documentOrganization && documentOrganization.id === currentDocument.organizationId) {
        return documentOrganization;
      }
      
      // If documentOrganization is loading, we still want to show branding
      // For single-org users, use primaryOrganization if it matches
      if (documentOrganizationLoading && isSingleOrg && primaryOrganization && currentDocument.organizationId === primaryOrganization.id) {
        return primaryOrganization;
      }
    }

    // Fall back to standard determination logic
    return determineActiveOrganization(
      currentView,
      isSingleOrg,
      primaryOrganization,
      selectedOrganization,
      documentOrganization,
      currentDocument,
      organizations
    );
  }, [currentView, isSingleOrg, primaryOrganization, selectedOrganization, documentOrganization, currentDocument, organizations, documentOrganizationLoading, currentUser]);

  // Organization handlers (navigation via URL)
  const handleSelectOrganization = useCallback((org: Organization) => {
    clearDocument();
    setDocumentOrganization(null);
    navigateToHash(`#/organization/${org.id}/dashboard`);
  }, [clearDocument, navigateToHash]);

  // Handler to refresh organization data after branding update
  const handleOrganizationBrandingUpdate = useCallback(async (organizationId: string) => {
    try {
      const response = await organizationsApi.getOrganization(organizationId);
      const updatedOrg = response.organization;
      
      // Update selectedOrganization if it matches
      if (selectedOrganization?.id === organizationId) {
        setSelectedOrganization(updatedOrg);
      }
      
      // Update documentOrganization if it matches
      if (documentOrganization?.id === organizationId) {
        setDocumentOrganization(updatedOrg);
      }
      
      // Refresh organizations list to update primaryOrganization
      // This will automatically update primaryOrganization since it's derived from the organizations array
      await refreshOrganizations();
    } catch (error) {
      logger.error('Failed to refresh organization:', error);
    }
  }, [selectedOrganization, documentOrganization, setSelectedOrganization, refreshOrganizations]);

  return {
    documentOrganization,
    documentOrganizationLoading,
    getActiveOrganization,
    handleSelectOrganization,
    handleOrganizationBrandingUpdate,
  };
}
