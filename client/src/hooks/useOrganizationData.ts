import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, OrganizationGovernanceRules, RepresentativeElection, VotingAnalytics } from '../types';
import { organizationsApi, governanceApi, documentsApi, RateLimitError, AuthError, ApiError } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

export interface OrganizationData {
  // Documents data
  documents: Document[];

  // Governance data
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];

  // Analytics data
  analytics: VotingAnalytics | null;

  // Loading states
  loading: {
    documents: boolean;
    governance: boolean;
    elections: boolean;
    analytics: boolean;
  };

  // Error states
  errors: {
    documents: string | null;
    governance: string | null;
    elections: string | null;
    analytics: string | null;
  };
}

/** Options for creating an organizational document (position in tree). */
export interface CreateDocumentOptions {
  parentId?: string;
  positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling';
  referenceDocumentId?: string;
}

export interface OrganizationActions {
  // Document actions
  refreshDocuments: () => Promise<void>;
  createDocument: (title: string, description?: string, options?: CreateDocumentOptions) => Promise<void>;

  // Governance actions
  refreshGovernance: () => Promise<void>;
  refreshElections: () => Promise<void>;
    createElection: (electionData: {
      title: string;
      description?: string;
      votingStartsAt: string;
      votingEndsAt: string;
      candidates: string[];
    }) => Promise<void>;

  // Analytics actions
  refreshAnalytics: () => Promise<void>;

  // General actions
  refreshAll: () => Promise<void>;
}

/**
 * Custom hook for managing all organization data with lazy loading
 * Only loads data when needed based on active tab to improve performance
 */
export function useOrganizationData(organizationId: string, activeTab: string): {
  data: OrganizationData;
  actions: OrganizationActions;
} {
  const { t } = useTranslation('organization');
  // Data state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const [elections, setElections] = useState<RepresentativeElection[]>([]);
  const [analytics, setAnalytics] = useState<VotingAnalytics | null>(null);

  // Refs to track loading state to prevent infinite loops
  const electionsLoadedRef = useRef(false);
  const documentsLoadedRef = useRef(false);
  const documentsRateLimitedRef = useRef(false);
  const authErrorRef = useRef(false);
  
  // Refs for request batching and cancellation
  const pendingTabRef = useRef<string | null>(null);
  const lastRequestedTabRef = useRef<string>(activeTab);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs for debouncing refresh functions (called from WebSocket events)
  const refreshDocumentsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshGovernanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshElectionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshAllTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to ignore stale responses when organization changes (and to clear state only on org change)
  const currentOrganizationIdRef = useRef<string>(organizationId);
  const previousOrganizationIdRef = useRef<string | undefined>(undefined);

  // Helper to check if user is authenticated
  const isAuthenticated = useCallback(() => {
    return !!localStorage.getItem('authToken');
  }, []);

  // Loading states
  const [loading, setLoading] = useState({
    documents: false,
    governance: false,
    elections: false,
    analytics: false,
  });

  // Error states
  const [errors, setErrors] = useState({
    documents: null as string | null,
    governance: null as string | null,
    elections: null as string | null,
    analytics: null as string | null,
  });

  // Reset refs and clear org-scoped state when organization (or tab) changes
  useEffect(() => {
    const orgChanged =
      previousOrganizationIdRef.current !== undefined &&
      previousOrganizationIdRef.current !== organizationId;

    if (orgChanged) {
      setDocuments([]);
      setGovernanceRules(null);
      setElections([]);
      setAnalytics(null);
      setLoading({
        documents: false,
        governance: false,
        elections: false,
        analytics: false,
      });
      setErrors({
        documents: null,
        governance: null,
        elections: null,
        analytics: null,
      });
    }

    currentOrganizationIdRef.current = organizationId;
    previousOrganizationIdRef.current = organizationId;

    electionsLoadedRef.current = false;
    documentsLoadedRef.current = false;
    documentsRateLimitedRef.current = false;
    authErrorRef.current = false;
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (refreshDocumentsTimeoutRef.current) {
      clearTimeout(refreshDocumentsTimeoutRef.current);
      refreshDocumentsTimeoutRef.current = null;
    }
    if (refreshGovernanceTimeoutRef.current) {
      clearTimeout(refreshGovernanceTimeoutRef.current);
      refreshGovernanceTimeoutRef.current = null;
    }
    if (refreshElectionsTimeoutRef.current) {
      clearTimeout(refreshElectionsTimeoutRef.current);
      refreshElectionsTimeoutRef.current = null;
    }
    if (refreshAllTimeoutRef.current) {
      clearTimeout(refreshAllTimeoutRef.current);
      refreshAllTimeoutRef.current = null;
    }
    pendingTabRef.current = null;
    lastRequestedTabRef.current = activeTab;
  }, [organizationId, activeTab]);

  // Helper to update loading state
  const setLoadingState = useCallback((key: keyof typeof loading, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  }, []);

  // Helper to update error state
  const setErrorState = useCallback((key: keyof typeof errors, value: string | null) => {
    setErrors(prev => ({ ...prev, [key]: value }));
  }, []);

  // Document actions
  const loadDocuments = useCallback(async (force: boolean = false) => {
    // Check if we're loading for a different tab
    if (pendingTabRef.current && pendingTabRef.current !== activeTab) {
      return;
    }
    // Allow forced reload even if already loaded
    if (loading.documents || (!force && documentsLoadedRef.current) || documentsRateLimitedRef.current || authErrorRef.current) return; // Prevent duplicate calls
    if (!isAuthenticated()) {
      authErrorRef.current = true;
      return; // Don't make requests if not authenticated
    }

    setLoadingState('documents', true);
    setErrorState('documents', null);

    try {
      const response = await organizationsApi.getOrganizationDocuments(organizationId, { includeMinutes: true });
      if (organizationId !== currentOrganizationIdRef.current) return;
      const docs = response.documents || [];
      setDocuments(docs);
      documentsLoadedRef.current = true;
      authErrorRef.current = false;
    } catch (error: unknown) {
      logger.error('Failed to load organization documents:', error);

      // Handle authentication errors - don't retry
      if (error instanceof AuthError) {
        authErrorRef.current = true;
        setErrorState('documents', 'Authentication required');
        return;
      }

      // Handle rate limiting specifically
      if (error instanceof RateLimitError) {
        documentsRateLimitedRef.current = true;
        setErrorState('documents', error.message);
        // Reset rate limited state after 30 seconds so user can try again
        setTimeout(() => {
          documentsRateLimitedRef.current = false;
        }, 30000);
        // Don't show toast for rate limiting - the API client handles retries
        return;
      }

      // Extract specific error messages based on error codes
      let errorMessage = 'Failed to load organization documents';
      let userFriendlyMessage = errorMessage;

      if (error instanceof ApiError) {
        const errorCode = error.code;
        const errorDetails = error.details as { message?: string } | undefined;
        
        // Map error codes to user-friendly messages
        switch (errorCode) {
          case 'ORGANIZATION_NOT_FOUND':
            errorMessage = 'Organization not found';
            userFriendlyMessage = 'The organization you are trying to access does not exist. Please check the organization ID.';
            break;
          case 'ORGANIZATION_INACTIVE':
            errorMessage = errorDetails?.message || 'Organization is inactive';
            userFriendlyMessage = errorDetails?.message || 'This organization is currently inactive. Please contact an administrator.';
            break;
          case 'MEMBERSHIP_REQUIRED':
            errorMessage = errorDetails?.message || 'Membership required';
            userFriendlyMessage = errorDetails?.message || 'You are not a member of this organization. Please request access from an administrator.';
            break;
          case 'MEMBERSHIP_INACTIVE':
            errorMessage = errorDetails?.message || 'Membership is inactive';
            userFriendlyMessage = errorDetails?.message || 'Your membership in this organization is not active. Please contact an administrator.';
            break;
          case 'DATABASE_ERROR':
            errorMessage = 'Database error occurred';
            userFriendlyMessage = 'A database error occurred while loading documents. Please try again later.';
            break;
          default:
            // Use the error message from the API if available
            if (error.message) {
              errorMessage = error.message;
              userFriendlyMessage = error.message;
            }
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        userFriendlyMessage = error.message;
      }

      setErrorState('documents', errorMessage);
      toast.error(userFriendlyMessage, {
        duration: 5000
      });
    } finally {
      setLoadingState('documents', false);
    }
  }, [organizationId, activeTab, loading.documents, setLoadingState, setErrorState, isAuthenticated]);


  // Governance actions
  const loadGovernanceRules = useCallback(async () => {
    // Check if we're loading for a different tab
    if (pendingTabRef.current && pendingTabRef.current !== activeTab) {
      return;
    }
    if (loading.governance || authErrorRef.current) return;
    if (!isAuthenticated()) {
      authErrorRef.current = true;
      return; // Don't make requests if not authenticated
    }

    setLoadingState('governance', true);
    setErrorState('governance', null);

    try {
      const response = await governanceApi.getGovernanceRules(organizationId);
      if (organizationId !== currentOrganizationIdRef.current) return;
      setGovernanceRules(response.governanceRules);
      authErrorRef.current = false;
    } catch (error) {
      logger.error('Failed to load governance rules:', error);
      // Handle authentication errors
      if (error instanceof AuthError) {
        authErrorRef.current = true;
        return;
      }
      // Governance rules might not exist yet, don't show error
      setGovernanceRules(null);
    } finally {
      setLoadingState('governance', false);
    }
  }, [organizationId, activeTab, loading.governance, setLoadingState, setErrorState, isAuthenticated]);

  const loadElections = useCallback(async () => {
    // Check if we're loading for a different tab
    if (pendingTabRef.current && pendingTabRef.current !== activeTab) {
      return;
    }
    if (loading.elections || electionsLoadedRef.current || authErrorRef.current) return; // Prevent duplicate calls if already loaded
    if (!isAuthenticated()) {
      authErrorRef.current = true;
      return; // Don't make requests if not authenticated
    }

    setLoadingState('elections', true);
    setErrorState('elections', null);

    try {
      const response = await governanceApi.getElections(organizationId);
      if (organizationId !== currentOrganizationIdRef.current) return;
      setElections(response.elections || []);
      electionsLoadedRef.current = true;
      authErrorRef.current = false;
    } catch (error: unknown) {
      logger.error('Failed to load elections:', error);
      // Handle authentication errors - don't retry
      if (error instanceof AuthError) {
        authErrorRef.current = true;
        return;
      }
      // For rate limiting, don't set error state - let rate limiting handle it
      if (!(error instanceof RateLimitError)) {
        setErrorState('elections', t('failedToLoadElections'));
        toast.error(t('failedToLoadElections'));
      }
    } finally {
      setLoadingState('elections', false);
    }
  }, [organizationId, activeTab, loading.elections, setLoadingState, setErrorState, isAuthenticated]);

  // Analytics actions
  const loadAnalytics = useCallback(async (showErrorToast = true) => {
    // Check if we're loading for a different tab
    if (pendingTabRef.current && pendingTabRef.current !== activeTab) {
      return;
    }
    if (loading.analytics || authErrorRef.current) return;
    if (!isAuthenticated()) {
      authErrorRef.current = true;
      return; // Don't make requests if not authenticated
    }

    setLoadingState('analytics', true);
    setErrorState('analytics', null);

    try {
      const response = await governanceApi.getVotingAnalytics(organizationId);
      if (organizationId !== currentOrganizationIdRef.current) return;
      setAnalytics(response.analytics);
      authErrorRef.current = false;
    } catch (error) {
      logger.error('Failed to load analytics:', error);
      // Handle authentication errors
      if (error instanceof AuthError) {
        authErrorRef.current = true;
        return;
      }
      setErrorState('analytics', t('failedToLoadAnalytics'));
      // Only show toast if explicitly requested (e.g., when user manually refreshes)
      // Don't show for background refreshes to avoid noise
      if (showErrorToast) {
        toast.error(t('failedToLoadAnalytics'));
      }
    } finally {
      setLoadingState('analytics', false);
    }
  }, [organizationId, activeTab, loading.analytics, setLoadingState, setErrorState, isAuthenticated]);

  // Lazy loading based on active tab - only if authenticated
  // Uses batching to prevent excessive requests from rapid tab switching
  useEffect(() => {
    // Don't load data if not authenticated
    if (!isAuthenticated() || authErrorRef.current) {
      return;
    }

    // Cancel any pending load
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // Track pending tab
    pendingTabRef.current = activeTab;

    // Small delay to batch rapid tab switches
    loadTimeoutRef.current = setTimeout(() => {
      // Check if tab changed during delay
      if (pendingTabRef.current !== activeTab) {
        return; // Tab changed, skip this load
      }

      lastRequestedTabRef.current = activeTab;
      pendingTabRef.current = null;

      // Load data based on active tab
      switch (activeTab) {
        case 'documents':
        case 'minutes': {
          const documentsPromises: Promise<void>[] = [];
          if (documents.length === 0 && !loading.documents && !documentsLoadedRef.current && !documentsRateLimitedRef.current) {
            documentsPromises.push(loadDocuments());
          }
          if (!governanceRules && !loading.governance) {
            documentsPromises.push(loadGovernanceRules());
          }
          if (documentsPromises.length > 0) {
            Promise.all(documentsPromises).catch(err => {
              logger.error('Failed to load documents tab data:', err);
            });
          }
          break;
        }
        case 'governance': {
          // Load governance rules and elections in parallel (they're independent)
          const governancePromises: Promise<void>[] = [];
          if (!governanceRules && !loading.governance) {
            governancePromises.push(loadGovernanceRules());
          }
          if (!electionsLoadedRef.current && !loading.elections) {
            governancePromises.push(loadElections());
          }
          if (governancePromises.length > 0) {
            Promise.all(governancePromises).catch(err => {
              logger.error('Failed to load governance data in parallel:', err);
            });
          }
          break;
        }
        case 'transparency': {
          // Load analytics and elections in parallel (they're independent)
          const transparencyPromises: Promise<void>[] = [];
          if (!analytics && !loading.analytics) {
            transparencyPromises.push(loadAnalytics());
          }
          // Transparency may need elections data for fallback counts
          if (!electionsLoadedRef.current && !loading.elections) {
            transparencyPromises.push(loadElections());
          }
          if (transparencyPromises.length > 0) {
            Promise.all(transparencyPromises).catch(err => {
              logger.error('Failed to load transparency data in parallel:', err);
            });
          }
          break;
        }
        case 'dashboard': {
          // Dashboard needs elections, documents, and governance rules - load in parallel
          const dashboardPromises: Promise<void>[] = [];
          if (!electionsLoadedRef.current && !loading.elections) {
            dashboardPromises.push(loadElections());
          }
          if (documents.length === 0 && !loading.documents && !documentsLoadedRef.current && !documentsRateLimitedRef.current) {
            dashboardPromises.push(loadDocuments());
          }
          if (!governanceRules && !loading.governance) {
            dashboardPromises.push(loadGovernanceRules());
          }
          if (dashboardPromises.length > 0) {
            Promise.all(dashboardPromises).catch(err => {
              logger.error('Failed to load dashboard data in parallel:', err);
            });
          }
          break;
        }
        case 'representatives': {
          // Representatives tab needs documents and governance for dialogs
          const repsPromises: Promise<void>[] = [];
          if (documents.length === 0 && !loading.documents && !documentsLoadedRef.current && !documentsRateLimitedRef.current) {
            repsPromises.push(loadDocuments());
          }
          if (!governanceRules && !loading.governance) {
            repsPromises.push(loadGovernanceRules());
          }
          if (repsPromises.length > 0) {
            Promise.all(repsPromises).catch(err => {
              logger.error('Failed to load representatives tab data:', err);
            });
          }
          break;
        }
        default:
          break;
      }
    }, 100); // 100ms batching window

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [
    activeTab, 
    documents.length, 
    governanceRules, 
    analytics, 
    loading.documents, 
    loading.governance, 
    loading.elections, 
    loading.analytics,
    loadDocuments,
    loadGovernanceRules,
    loadElections,
    loadAnalytics,
    isAuthenticated
  ]);

  // Load elections for dashboard - only when needed
  // Note: Elections may not exist for new organizations where reps are appointed
  useEffect(() => {
    // Don't auto-load elections - let tabs/components load them when needed
    // This prevents unnecessary API calls for organizations without elections
  }, [organizationId]);

  // Debounced refresh functions to prevent excessive API calls from rapid WebSocket updates
  const debouncedRefreshDocuments = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (refreshDocumentsTimeoutRef.current) {
        clearTimeout(refreshDocumentsTimeoutRef.current);
      }
      refreshDocumentsTimeoutRef.current = setTimeout(async () => {
        // Force reload to ensure new documents appear (e.g., after creation)
        await loadDocuments(true);
        refreshDocumentsTimeoutRef.current = null;
        resolve();
      }, 300); // 300ms debounce for WebSocket-triggered refreshes
    });
  }, [loadDocuments]);

  const debouncedRefreshGovernance = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (refreshGovernanceTimeoutRef.current) {
        clearTimeout(refreshGovernanceTimeoutRef.current);
      }
      refreshGovernanceTimeoutRef.current = setTimeout(async () => {
        await loadGovernanceRules();
        refreshGovernanceTimeoutRef.current = null;
        resolve();
      }, 300);
    });
  }, [loadGovernanceRules]);

  const debouncedRefreshElections = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (refreshElectionsTimeoutRef.current) {
        clearTimeout(refreshElectionsTimeoutRef.current);
      }
      refreshElectionsTimeoutRef.current = setTimeout(async () => {
        await loadElections();
        refreshElectionsTimeoutRef.current = null;
        resolve();
      }, 300);
    });
  }, [loadElections]);

  // Action functions
  const actions: OrganizationActions = {
    refreshDocuments: debouncedRefreshDocuments,
    createDocument: async (title: string, description?: string, options?: CreateDocumentOptions) => {
      try {
        // For organizational documents, governance rules are applied server-side; only send position/parent.
        const apiOptions = options
          ? {
              ...(options.positionType && { positionType: options.positionType }),
              ...(options.referenceDocumentId && { referenceDocumentId: options.referenceDocumentId }),
              ...(options.parentId && { parentId: options.parentId }),
            }
          : undefined;
        await documentsApi.createDocument(
          title,
          description,
          undefined, // contributors - org members are auto-included
          apiOptions,
          'organizational',
          organizationId
        );
        await loadDocuments(true);
        toast.success(t('documentCreatedSuccess'));
      } catch (error) {
        logger.error('Failed to create document:', error);
        toast.error(t('failedToCreateDocument'));
        throw error;
      }
    },

    refreshGovernance: debouncedRefreshGovernance,
    refreshElections: debouncedRefreshElections,
    createElection: async (electionData: {
      title: string;
      description?: string;
      votingStartsAt: string;
      votingEndsAt: string;
      candidates: string[];
    }) => {
      try {
        setErrorState('elections', null);
        // Convert to API format (positionsAvailable from candidates length, termMonths optional)
        await governanceApi.createElection(organizationId, {
          title: electionData.title,
          description: electionData.description,
          positionsAvailable: electionData.candidates.length,
        });
        toast.success(t('electionCreated'));
        // Refresh elections list
        await loadElections();
      } catch (error: unknown) {
        logger.error('Failed to create election:', error);
        const errorMessage = error instanceof Error ? error.message : t('failedToCreateElection');
        setErrorState('elections', errorMessage);
        toast.error(errorMessage);
        throw error;
      }
    },

    refreshAnalytics: loadAnalytics,

    refreshAll: () => {
      // Debounce refreshAll to prevent excessive calls from rapid WebSocket updates
      return new Promise<void>((resolve) => {
        if (refreshAllTimeoutRef.current) {
          clearTimeout(refreshAllTimeoutRef.current);
        }
        refreshAllTimeoutRef.current = setTimeout(async () => {
          // Use Promise.allSettled to prevent analytics failures from blocking other refreshes
          // Pass false to loadAnalytics to suppress toast errors during background refresh
          const results = await Promise.allSettled([
            loadDocuments(),
            loadGovernanceRules(),
            loadAnalytics(false), // Don't show toast errors for background refreshes
            // Note: Elections are loaded per-tab, not in refreshAll
            // This prevents unnecessary API calls for organizations without elections
          ]);
          
          // Log any failures for debugging (but don't throw)
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              const names = ['documents', 'governance', 'analytics'];
              logger.warn(`Failed to refresh ${names[index]}:`, result.reason);
            }
          });
          refreshAllTimeoutRef.current = null;
          resolve();
        }, 300); // 300ms debounce
      });
    },
  };

  const data: OrganizationData = {
    documents,
    governanceRules,
    elections,
    analytics,
    loading,
    errors,
  };

  return { data, actions };
}
