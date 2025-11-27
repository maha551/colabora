import { useState, useEffect, useCallback, useRef } from 'react';
import { Document, OrganizationGovernanceRules, RepresentativeElection, VotingAnalytics } from '../types';
import { organizationsApi, governanceApi, documentsApi, RateLimitError } from '../lib/api';
import { toast } from 'sonner';

// Policy votes are deprecated - kept for backwards compatibility
export interface PolicyVote {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  documentId?: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  thresholdPercentage: number;
  deadlineAt?: string;
  anonymousVoting: boolean;
  votesYes: number;
  votesNo: number;
  votesAbstain: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationData {
  // Documents data
  documents: Document[];
  policyVotes: PolicyVote[]; // Deprecated - always returns empty array

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
    policyVotes: boolean;
  };

  // Error states
  errors: {
    documents: string | null;
    governance: string | null;
    elections: string | null;
    analytics: string | null;
    policyVotes: string | null;
  };
}

export interface OrganizationActions {
  // Document actions
  refreshDocuments: () => Promise<void>;
  createDocument: (title: string, description?: string, parentId?: string) => Promise<void>;

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

  // Policy votes actions
  refreshPolicyVotes: () => Promise<void>;

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
  // Data state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [policyVotes, setPolicyVotes] = useState<PolicyVote[]>([]);
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const [elections, setElections] = useState<RepresentativeElection[]>([]);
  const [analytics, setAnalytics] = useState<VotingAnalytics | null>(null);

  // Refs to track loading state to prevent infinite loops
  const electionsLoadedRef = useRef(false);
  const documentsLoadedRef = useRef(false);
  const documentsRateLimitedRef = useRef(false);

  // Reset refs when organization changes
  useEffect(() => {
    electionsLoadedRef.current = false;
    documentsLoadedRef.current = false;
    documentsRateLimitedRef.current = false;
  }, [organizationId]);

  // Loading states
  const [loading, setLoading] = useState({
    documents: false,
    governance: false,
    elections: false,
    analytics: false,
    policyVotes: false,
  });

  // Error states
  const [errors, setErrors] = useState({
    documents: null as string | null,
    governance: null as string | null,
    elections: null as string | null,
    analytics: null as string | null,
    policyVotes: null as string | null,
  });

  // Helper to update loading state
  const setLoadingState = useCallback((key: keyof typeof loading, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  }, []);

  // Helper to update error state
  const setErrorState = useCallback((key: keyof typeof errors, value: string | null) => {
    setErrors(prev => ({ ...prev, [key]: value }));
  }, []);

  // Document actions
  const loadDocuments = useCallback(async () => {
    if (loading.documents || documentsLoadedRef.current || documentsRateLimitedRef.current) return; // Prevent duplicate calls

    setLoadingState('documents', true);
    setErrorState('documents', null);

    try {
      const response = await organizationsApi.getOrganizationDocuments(organizationId);
      const docs = response.documents || [];
      
      // No need for fallback mock documents - real documents are created in the database
      // The API will return the actual documents from the database
      
      setDocuments(docs);
      documentsLoadedRef.current = true; // Mark as loaded
    } catch (error: unknown) {
      console.error('Failed to load organization documents:', error);

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

      setErrorState('documents', 'Failed to load documents');
      toast.error('Failed to load organization documents');
    } finally {
      setLoadingState('documents', false);
    }
  }, [organizationId, loading.documents, setLoadingState, setErrorState]);


  const loadPolicyVotes = useCallback(async () => {
    // Policy votes have been deprecated - use rule proposals instead
    // This function is kept for backwards compatibility but does nothing
    setLoadingState('policyVotes', false);
    setErrorState('policyVotes', null);
    setPolicyVotes([]);
  }, [setLoadingState, setErrorState]);

  // Governance actions
  const loadGovernanceRules = useCallback(async () => {
    if (loading.governance) return;

    setLoadingState('governance', true);
    setErrorState('governance', null);

    try {
      const response = await governanceApi.getGovernanceRules(organizationId);
      setGovernanceRules(response.governanceRules);
    } catch (error) {
      console.error('Failed to load governance rules:', error);
      // Governance rules might not exist yet, don't show error
      setGovernanceRules(null);
    } finally {
      setLoadingState('governance', false);
    }
  }, [organizationId, loading.governance, setLoadingState, setErrorState]);

  const loadElections = useCallback(async () => {
    if (loading.elections || electionsLoadedRef.current) return; // Prevent duplicate calls if already loaded

    setLoadingState('elections', true);
    setErrorState('elections', null);

    try {
      const response = await governanceApi.getElections(organizationId);
      setElections(response.elections || []);
      electionsLoadedRef.current = true; // Mark as loaded
      // Note: Empty elections array is normal for new organizations
    } catch (error: unknown) {
      console.error('Failed to load elections:', error);
      // For rate limiting, don't set error state - let rate limiting handle it
      if (!(error instanceof RateLimitError)) {
        setErrorState('elections', 'Failed to load elections');
        toast.error('Failed to load elections');
      }
    } finally {
      setLoadingState('elections', false);
    }
  }, [organizationId, loading.elections, setLoadingState, setErrorState]);

  // Analytics actions
  const loadAnalytics = useCallback(async () => {
    if (loading.analytics) return;

    setLoadingState('analytics', true);
    setErrorState('analytics', null);

    try {
      const response = await governanceApi.getVotingAnalytics(organizationId);
      setAnalytics(response.analytics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setErrorState('analytics', 'Failed to load analytics');
      toast.error('Failed to load analytics');
    } finally {
      setLoadingState('analytics', false);
    }
  }, [organizationId, loading.analytics, setLoadingState, setErrorState]);

  // Lazy loading based on active tab
  useEffect(() => {
    switch (activeTab) {
      case 'documents':
        if (documents.length === 0 && !loading.documents && !documentsLoadedRef.current && !documentsRateLimitedRef.current) {
          loadDocuments();
          loadPolicyVotes();
        }
        break;
      case 'governance':
        if (!governanceRules && !loading.governance) {
          loadGovernanceRules();
        }
        if (!electionsLoadedRef.current && !loading.elections) {
          loadElections();
        }
        break;
      case 'analytics':
        if (!analytics && !loading.analytics) {
          loadAnalytics();
        }
        // Analytics may need elections data for fallback counts
        if (!electionsLoadedRef.current && !loading.elections) {
          loadElections();
        }
        break;
      case 'dashboard':
        // Dashboard needs elections for showing active elections and election warnings
        if (!electionsLoadedRef.current && !loading.elections) {
          loadElections();
        }
        break;
      default:
        break;
    }
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
    loadPolicyVotes,
    loadGovernanceRules,
    loadElections,
    loadAnalytics
  ]);

  // Load elections for dashboard - only when needed
  // Note: Elections may not exist for new organizations where reps are appointed
  useEffect(() => {
    // Don't auto-load elections - let tabs/components load them when needed
    // This prevents unnecessary API calls for organizations without elections
  }, [organizationId]);

  // Action functions
  const actions: OrganizationActions = {
    refreshDocuments: loadDocuments,
    createDocument: async (title: string, description?: string, parentId?: string) => {
      try {
        await documentsApi.createDocument(
          title,
          description,
          undefined, // contributors - org members are auto-included
          {
            acceptanceThreshold: 75,
            votingAnonymous: false,
            votingAnonymityLocked: false,
            voteChangeAllowed: true,
            structureProposalsEnabled: true,
            parentId: parentId
          },
          'organizational',
          organizationId
        );
        // Refresh documents after creation
        await loadDocuments();
        toast.success('Document created successfully');
      } catch (error) {
        console.error('Failed to create document:', error);
        toast.error('Failed to create document');
        throw error;
      }
    },

    refreshGovernance: loadGovernanceRules,
    refreshElections: loadElections,
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
        toast.success('Election created successfully');
        // Refresh elections list
        await loadElections();
      } catch (error: unknown) {
        console.error('Failed to create election:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create election';
        setErrorState('elections', errorMessage);
        toast.error(errorMessage);
        throw error;
      }
    },

    refreshAnalytics: loadAnalytics,

    refreshPolicyVotes: loadPolicyVotes,

    refreshAll: async () => {
      await Promise.all([
        loadDocuments(),
        loadGovernanceRules(),
        loadAnalytics(),
        loadPolicyVotes(),
        // Note: Elections are loaded per-tab, not in refreshAll
        // This prevents unnecessary API calls for organizations without elections
      ]);
    },
  };

  const data: OrganizationData = {
    documents,
    policyVotes,
    governanceRules,
    elections,
    analytics,
    loading,
    errors,
  };

  return { data, actions };
}
