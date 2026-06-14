import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppView, User, Organization, Document, SearchResult } from '../types';
import { documentsApi } from '../lib/api';
import { logger } from '../lib/logger';
import {
  parseHash,
  buildHash,
  pushHash,
  replaceHash,
  getCurrentHash,
} from '../lib/hashRoutes';

interface UseAppNavigationOptions {
  currentUser: User | null;
  organizations: Organization[];
  isSingleOrg: boolean;
  primaryOrganization: Organization | null;
  organizationsLoading: boolean;
  isAuthenticated: boolean;
  currentDocument: Document | null;
  documentOrganization: Organization | null;
  loadDocumentById: (documentId: string, user: User) => Promise<void>;
  selectDocument: (document: Document) => Promise<void>;
  clearDocument: () => void;
  loadStructureProposals?: () => Promise<void>;
}

export function useAppNavigation({
  currentUser,
  organizations,
  isSingleOrg,
  primaryOrganization,
  organizationsLoading,
  isAuthenticated,
  currentDocument,
  documentOrganization,
  loadDocumentById,
  selectDocument,
  clearDocument,
  loadStructureProposals,
}: UseAppNavigationOptions) {
  const [currentView, setCurrentView] = useState<AppView>('activity');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMemberOrganizationId, setSelectedMemberOrganizationId] = useState<string | null>(null);
  const initialLoadCompleteRef = useRef(false);
  const previousUserIdRef = useRef<string | undefined>(currentUser?.id);
  const [canGoBack, setCanGoBack] = useState(
    () => typeof window !== 'undefined' && window.history.length > 1
  );
  /** Bumps on programmatic navigation and on popstate/hashchange so layout (e.g. meeting immersive) re-reads the URL. */
  const [navigationKey, setNavigationKey] = useState(0);

  /** Single-org users skip the organizations list and go straight to their org overview. */
  const getSingleOrgHash = useCallback((): string | null => {
    if (isSingleOrg && primaryOrganization) {
      return buildHash({
        view: 'organization',
        organizationId: primaryOrganization.id,
        orgTab: 'dashboard',
      });
    }
    return null;
  }, [isSingleOrg, primaryOrganization]);

  // Helper: default hash when none is set (used for initial load replaceState)
  const getDefaultHash = useCallback((): string => {
    const preferredView = currentUser?.defaultHomeView || 'activity';
    if (preferredView === 'organization' && organizations.length > 0) {
      const singleOrgHash = getSingleOrgHash();
      if (singleOrgHash) return singleOrgHash;
      return '#/organizations';
    }
    return '#/activity';
  }, [currentUser, organizations.length, getSingleOrgHash]);

  // Single source of truth: sync app state from current URL hash (and optionally load document).
  const applyStateFromHash = useCallback(async (): Promise<void> => {
    let hash = getCurrentHash();
    let parsed = parseHash(hash);

    if (parsed.view === 'organizations') {
      const singleOrgHash = getSingleOrgHash();
      if (singleOrgHash) {
        replaceHash(singleOrgHash);
        hash = singleOrgHash;
        parsed = parseHash(hash);
      }
    }

    setCurrentView(parsed.view);
    setSelectedMemberId(parsed.memberId ?? null);
    setSelectedMemberOrganizationId(parsed.memberOrganizationId ?? null);

    const org = parsed.organizationId
      ? organizations.find((o) => o.id === parsed.organizationId) ?? null
      : null;
    setSelectedOrganization(org);

    if (parsed.view !== 'document') {
      clearDocument();
    }

    if (parsed.view === 'document' && parsed.documentId && currentUser) {
      try {
        logger.log('Loading document from hash:', parsed.documentId);
        await loadDocumentById(parsed.documentId, currentUser);
        setCurrentView('document');
        if (loadStructureProposals) {
          loadStructureProposals().catch((err) => {
            logger.error('Failed to load structure proposals from hash:', err);
          });
        }
      } catch (err) {
        logger.error('Failed to load document from hash:', err);
        setCurrentView('activity');
      }
    }
  }, [
    organizations,
    currentUser,
    loadDocumentById,
    loadStructureProposals,
    clearDocument,
    getSingleOrgHash,
  ]);

  // Navigate to a hash (pushState + apply). Use for all in-app navigation.
  const navigateToHash = useCallback(
    (hash: string) => {
      pushHash(hash);
      setNavigationKey((k) => k + 1);
      setCanGoBack(true);
      void applyStateFromHash();
    },
    [applyStateFromHash]
  );

  // Sync state from URL on popstate (browser Back/Forward) and hashchange (external/deep links).
  useEffect(() => {
    if (!currentUser) return;

    const syncFromUrl = () => {
      setCanGoBack(typeof window !== 'undefined' && window.history.length > 1);
      setNavigationKey((k) => k + 1);
      void applyStateFromHash();
    };

    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, [currentUser, applyStateFromHash]);

  // Initial load: sync from URL; if hash is empty, replace with default then sync.
  useEffect(() => {
    if (!currentUser || !isAuthenticated || organizationsLoading) return;
    if (initialLoadCompleteRef.current) return;

    const hash = getCurrentHash();
    const parsed = parseHash(hash);
    const hasKnownView =
      hash === '#/activity' ||
      hash === '#/documents' ||
      hash === '#/profile' ||
      hash === '#/settings' ||
      hash === '#/organizations' ||
      hash === '#/admin' ||
      hash === '#/search' ||
      hash === '#/report-issue' ||
      hash.startsWith('#document/') ||
      hash.startsWith('#/organization/') ||
      hash.startsWith('#/member-profile/');

    if (!hash || !hasKnownView) {
      const defaultHash = getDefaultHash();
      replaceHash(defaultHash);
    }

    void applyStateFromHash().then(() => {
      initialLoadCompleteRef.current = true;
    });
  }, [
    currentUser,
    isAuthenticated,
    organizationsLoading,
    getDefaultHash,
    applyStateFromHash,
  ]);

  // Reset state when user changes (e.g., after logout/login)
  useEffect(() => {
    const currentUserId = currentUser?.id;
    const previousUserId = previousUserIdRef.current;

    if (currentUserId !== previousUserId) {
      initialLoadCompleteRef.current = false;
      setSelectedOrganization(null);
      clearDocument();

      if (!currentUser) {
        setCurrentView('activity');
      }

      previousUserIdRef.current = currentUserId;
    }
  }, [currentUser?.id, currentUser, clearDocument]);

  // Back: use browser history so URL and state stay in sync.
  const handleBack = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.back();
  }, []);

  // Navigation handlers: pushState + apply (no in-memory stack).
  const handleShowDocuments = useCallback(() => {
    clearDocument();
    navigateToHash('#/documents');
  }, [clearDocument, navigateToHash]);

  const handleShowActivity = useCallback(() => {
    clearDocument();
    navigateToHash('#/activity');
  }, [clearDocument, navigateToHash]);

  const handleShowProfile = useCallback(() => {
    clearDocument();
    navigateToHash('#/profile');
  }, [clearDocument, navigateToHash]);

  const handleShowSettings = useCallback(() => {
    clearDocument();
    navigateToHash('#/settings');
  }, [clearDocument, navigateToHash]);

  const handleShowOrganizations = useCallback(() => {
    clearDocument();
    navigateToHash(getSingleOrgHash() ?? '#/organizations');
  }, [clearDocument, navigateToHash, getSingleOrgHash]);

  const handleShowAdmin = useCallback(() => {
    clearDocument();
    navigateToHash('#/admin');
  }, [clearDocument, navigateToHash]);

  const handleShowSearch = useCallback(() => {
    clearDocument();
    navigateToHash('#/search');
  }, [clearDocument, navigateToHash]);

  const handleShowReportIssue = useCallback(() => {
    navigateToHash('#/report-issue');
  }, [navigateToHash]);

  const handleNavigateToMemberProfile = useCallback(
    (userId: string, organizationId?: string) => {
      const hash = organizationId
        ? `#/member-profile/${userId}/${organizationId}`
        : `#/member-profile/${userId}`;
      navigateToHash(hash);
    },
    [navigateToHash]
  );

  const handleDocumentSelect = useCallback(
    async (document: Document, searchQuery?: string, paragraphId?: string) => {
      await selectDocument(document);
      pushHash(`#document/${document.id}`);
      setCurrentView('document');
      setCanGoBack(true);
      if (paragraphId) {
        sessionStorage.setItem('documentSearchParagraphId', paragraphId);
      } else {
        sessionStorage.removeItem('documentSearchParagraphId');
      }
      if (searchQuery) {
        sessionStorage.setItem('documentSearchQuery', searchQuery);
      } else {
        sessionStorage.removeItem('documentSearchQuery');
      }
      sessionStorage.removeItem('meetingSearchBlockId');
    },
    [selectDocument]
  );

  const handleSearchResultSelect = useCallback(
    async (result: SearchResult, searchQuery?: string) => {
      if (result.entityType === 'meeting') {
        clearDocument();
        sessionStorage.removeItem('documentSearchQuery');
        sessionStorage.removeItem('documentSearchParagraphId');
        sessionStorage.removeItem('meetingSearchBlockId');
        navigateToHash(`#/organization/${result.organizationId}/meetings/${result.meetingId}`);
        setCurrentView('organization');
        setCanGoBack(true);
        return;
      }

      if (result.entityType === 'paragraph') {
        if (
          result.documentKind === 'meeting_minutes' &&
          result.meetingId &&
          result.organizationId
        ) {
          clearDocument();
          sessionStorage.setItem('meetingSearchBlockId', `paragraph:${result.paragraphId}`);
          sessionStorage.removeItem('documentSearchQuery');
          sessionStorage.removeItem('documentSearchParagraphId');
          navigateToHash(`#/organization/${result.organizationId}/meetings/${result.meetingId}`);
          setCurrentView('organization');
          setCanGoBack(true);
          return;
        }

        if (!currentUser) return;
        try {
          const response = await documentsApi.getDocument(result.documentId);
          await handleDocumentSelect(response.document, searchQuery, result.paragraphId);
        } catch (error) {
          logger.error('Failed to load document from paragraph search result:', error);
          throw error;
        }
        return;
      }

      if (!currentUser) return;
      try {
        const response = await documentsApi.getDocument(result.id);
        await handleDocumentSelect(response.document, searchQuery);
      } catch (error) {
        logger.error('Failed to load document from search result:', error);
        throw error;
      }
    },
    [clearDocument, navigateToHash, currentUser, handleDocumentSelect]
  );

  const handleNavigateToDocument = useCallback(
    async (documentId: string) => {
      if (!currentUser) return;
      pushHash(`#document/${documentId}`);
      setCanGoBack(true);
      try {
        await loadDocumentById(documentId, currentUser);
        setCurrentView('document');
        if (loadStructureProposals) {
          await loadStructureProposals();
        }
      } catch (error) {
        logger.error('Failed to load document:', error);
        throw error;
      }
    },
    [currentUser, loadDocumentById, loadStructureProposals]
  );

  return {
    navigationKey,
    currentView,
    setCurrentView,
    selectedOrganization,
    setSelectedOrganization,
    selectedMemberId,
    setSelectedMemberId,
    selectedMemberOrganizationId,
    history: [] as { view: AppView; documentId?: string; organizationId?: string }[],
    canGoBack,
    handleShowDocuments,
    handleShowActivity,
    handleShowProfile,
    handleShowSettings,
    handleShowOrganizations,
    handleShowAdmin,
    handleShowSearch,
    handleShowReportIssue,
    handleNavigateToMemberProfile,
    handleDocumentSelect,
    handleSearchResultSelect,
    handleNavigateToDocument,
    handleBack,
    navigateToHash,
  };
}
