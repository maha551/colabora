import { useState, useEffect, useCallback } from 'react';
import { Document, OrganizationGovernanceRules, RepresentativeElection, VotingAnalytics } from '../types';
import { organizationsApi, governanceApi } from '../lib/api';
import { toast } from 'sonner';

export interface OrganizationData {
  // Documents data
  documents: Document[];
  policyVotes: any[];

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
  createDocument: (title: string, description?: string) => Promise<void>;

  // Governance actions
  refreshGovernance: () => Promise<void>;
  refreshElections: () => Promise<void>;
  createElection: (electionData: any) => Promise<void>;

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
  const [policyVotes, setPolicyVotes] = useState<any[]>([]);
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const [elections, setElections] = useState<RepresentativeElection[]>([]);
  const [analytics, setAnalytics] = useState<VotingAnalytics | null>(null);

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
    if (loading.documents) return; // Prevent duplicate calls

    setLoadingState('documents', true);
    setErrorState('documents', null);

    try {
      const response = await organizationsApi.getOrganizationDocuments(organizationId);
      setDocuments(response.documents || []);
    } catch (error) {
      console.error('Failed to load organization documents:', error);
      setErrorState('documents', 'Failed to load documents');
      toast.error('Failed to load organization documents');
    } finally {
      setLoadingState('documents', false);
    }
  }, [organizationId, loading.documents, setLoadingState, setErrorState]);

  const loadPolicyVotes = useCallback(async () => {
    if (loading.policyVotes) return;

    setLoadingState('policyVotes', true);
    setErrorState('policyVotes', null);

    try {
      // TODO: Implement policy votes API call
      // const response = await governanceApi.getPolicyVotes(organizationId);
      // setPolicyVotes(response.votes || []);
      setPolicyVotes([]); // Placeholder
    } catch (error) {
      console.error('Failed to load policy votes:', error);
      setErrorState('policyVotes', 'Failed to load policy votes');
    } finally {
      setLoadingState('policyVotes', false);
    }
  }, [organizationId, loading.policyVotes, setLoadingState, setErrorState]);

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
    if (loading.elections) return;

    setLoadingState('elections', true);
    setErrorState('elections', null);

    try {
      const response = await governanceApi.getElections(organizationId);
      setElections(response.elections || []);
    } catch (error) {
      console.error('Failed to load elections:', error);
      setErrorState('elections', 'Failed to load elections');
      toast.error('Failed to load elections');
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
      const response = await governanceApi.getAnalytics(organizationId);
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
        if (documents.length === 0 && !loading.documents) {
          loadDocuments();
          loadPolicyVotes();
        }
        break;
      case 'governance':
        if (!governanceRules && !loading.governance) {
          loadGovernanceRules();
        }
        // Elections are loaded separately for all tabs
        break;
      case 'analytics':
        if (!analytics && !loading.analytics) {
          loadAnalytics();
        }
        break;
      // Dashboard doesn't need special loading
      default:
        break;
    }
  }, [activeTab, documents.length, governanceRules, analytics, loading, loadDocuments, loadPolicyVotes, loadGovernanceRules, loadAnalytics]);

  // Load elections for dashboard (always needed)
  useEffect(() => {
    if (elections.length === 0 && !loading.elections) {
      loadElections();
    }
  }, [organizationId, elections.length, loading.elections, loadElections]);

  // Action functions
  const actions: OrganizationActions = {
    refreshDocuments: loadDocuments,
    createDocument: async (title: string, description?: string) => {
      // TODO: Implement document creation
      console.log('Creating document:', title, description);
    },

    refreshGovernance: loadGovernanceRules,
    refreshElections: loadElections,
    createElection: async (electionData: any) => {
      // TODO: Implement election creation
      console.log('Creating election:', electionData);
    },

    refreshAnalytics: loadAnalytics,

    refreshPolicyVotes: loadPolicyVotes,

    refreshAll: async () => {
      await Promise.all([
        loadDocuments(),
        loadGovernanceRules(),
        loadElections(),
        loadAnalytics(),
        loadPolicyVotes(),
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
