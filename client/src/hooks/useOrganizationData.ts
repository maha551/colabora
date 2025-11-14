import { useState, useEffect, useCallback, useRef } from 'react';
import { Document, OrganizationGovernanceRules, RepresentativeElection, VotingAnalytics, DocumentProposal } from '../types';
import { organizationsApi, governanceApi } from '../lib/api';
import { toast } from 'sonner';

export interface OrganizationData {
  // Documents data
  documents: Document[];
  documentProposals: DocumentProposal[];
  policyVotes: any[];

  // Governance data
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];

  // Analytics data
  analytics: VotingAnalytics | null;

  // Loading states
  loading: {
    documents: boolean;
    documentProposals: boolean;
    governance: boolean;
    elections: boolean;
    analytics: boolean;
    policyVotes: boolean;
  };

  // Error states
  errors: {
    documents: string | null;
    documentProposals: string | null;
    governance: string | null;
    elections: string | null;
    analytics: string | null;
    policyVotes: string | null;
  };
}

export interface OrganizationActions {
  // Document actions
  refreshDocuments: () => Promise<void>;
  createDocumentProposal: (title: string, description?: string, contributors?: string[], options?: any) => Promise<void>;
  refreshDocumentProposals: () => Promise<void>;
  voteOnDocumentProposal: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
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
  const [documentProposals, setDocumentProposals] = useState<DocumentProposal[]>([]);
  const [policyVotes, setPolicyVotes] = useState<any[]>([]);
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
    documentProposals: false,
    governance: false,
    elections: false,
    analytics: false,
    policyVotes: false,
  });

  // Error states
  const [errors, setErrors] = useState({
    documents: null as string | null,
    documentProposals: null as string | null,
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
      let docs = response.documents || [];
      
      // Add example hierarchical documents for demonstration if no documents exist
      if (docs.length === 0) {
        const now = new Date().toISOString();
        const exampleOwner = { id: 'example', name: 'System', email: 'system@example.com' };
        
        docs = [
          {
            id: 'doc-1',
            title: 'Organization Charter',
            description: 'The foundational document defining our organization',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: undefined,
          },
          {
            id: 'doc-1-1',
            title: 'Mission Statement',
            description: 'Our core mission and values',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: 'doc-1',
          },
          {
            id: 'doc-1-2',
            title: 'Code of Conduct',
            description: 'Expected behavior and ethical guidelines',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: 'doc-1',
          },
          {
            id: 'doc-2',
            title: 'Governance Policies',
            description: 'Policies governing organizational decision-making',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: undefined,
          },
          {
            id: 'doc-2-1',
            title: 'Voting Procedures',
            description: 'How votes are conducted and counted',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: 'doc-2',
          },
          {
            id: 'doc-2-1-1',
            title: 'Election Rules',
            description: 'Specific rules for representative elections',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: 'doc-2-1',
          },
          {
            id: 'doc-3',
            title: 'Financial Guidelines',
            description: 'Budget and financial management policies',
            ownerId: 'example',
            createdAt: now,
            updatedAt: now,
            owner: exampleOwner,
            collaborators: [],
            paragraphs: [],
            parentId: undefined,
          },
        ] as Document[];
      }
      
      setDocuments(docs);
      documentsLoadedRef.current = true; // Mark as loaded
    } catch (error: any) {
      console.error('Failed to load organization documents:', error);

      // Handle rate limiting specifically
      if (error.name === 'RateLimitError') {
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

  const loadDocumentProposals = useCallback(async () => {
    if (loading.documentProposals) return;

    setLoadingState('documentProposals', true);
    setErrorState('documentProposals', null);

    try {
      const response = await organizationsApi.getDocumentProposals(organizationId);
      setDocumentProposals(response.documentProposals || []);
    } catch (error: any) {
      console.error('Failed to load document proposals:', error);
      // Handle rate limiting specifically
      if (error.name === 'RateLimitError') {
        setErrorState('documentProposals', error.message);
        return;
      }
      setErrorState('documentProposals', 'Failed to load document proposals');
    } finally {
      setLoadingState('documentProposals', false);
    }
  }, [organizationId, loading.documentProposals, setLoadingState, setErrorState]);

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
    if (loading.elections || electionsLoadedRef.current) return; // Prevent duplicate calls if already loaded

    setLoadingState('elections', true);
    setErrorState('elections', null);

    try {
      const response = await governanceApi.getElections(organizationId);
      setElections(response.elections || []);
      electionsLoadedRef.current = true; // Mark as loaded
      // Note: Empty elections array is normal for new organizations
    } catch (error: any) {
      console.error('Failed to load elections:', error);
      // For rate limiting, don't set error state - let rate limiting handle it
      if (error.name !== 'RateLimitError') {
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
          loadDocumentProposals();
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
    loadDocumentProposals,
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
    createDocumentProposal: async (title: string, description?: string, contributors?: string[], options?: any) => {
      try {
        await organizationsApi.createDocumentProposal(organizationId, {
          title,
          description,
          contributors,
          documentOptions: options
        });
        // Refresh document proposals after creation
        await loadDocumentProposals();
      } catch (error) {
        console.error('Failed to create document proposal:', error);
        throw error;
      }
    },
    refreshDocumentProposals: loadDocumentProposals,
    voteOnDocumentProposal: async (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
      try {
        await organizationsApi.voteOnDocumentProposal(organizationId, proposalId, vote);
        // Refresh both proposals and documents after voting (voting could result in approval)
        await loadDocumentProposals();
        await loadDocuments();
      } catch (error) {
        console.error('Failed to vote on document proposal:', error);
        throw error;
      }
    },
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
        loadAnalytics(),
        loadPolicyVotes(),
        // Note: Elections are loaded per-tab, not in refreshAll
        // This prevents unnecessary API calls for organizations without elections
      ]);
    },
  };

  const data: OrganizationData = {
    documents,
    documentProposals,
    policyVotes,
    governanceRules,
    elections,
    analytics,
    loading,
    errors,
  };

  return { data, actions };
}
