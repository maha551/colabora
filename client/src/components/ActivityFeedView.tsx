import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation, Trans } from "react-i18next";
import { User, Document, Comment, Vote, Organization, RepresentativeElection } from "../types";
import { DocumentUpdate } from "../hooks/useWebSocket";
import { Badge } from "./ui/badge";
import { Icon } from "./ui/Icon";
import { cn } from "./ui/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { toast } from "sonner";
import { activityApi, ApiError, governanceApi, documentsApi } from "../lib/api";
import { ActivityFeedProposalCard } from "./ActivityFeedProposalCard";
import { DocumentCardSkeleton } from "./ui/LoadingSkeleton";
import { LoadingState } from "./ui/LoadingState";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingHint } from "./OnboardingHint";
import { 
  adaptProposalToSuggestion, 
  extractDocumentContext, 
  getOriginalText,
  ActivityFeedProposal
} from "../utils/proposalAdapter";
import type { DecisionEntry, PendingDecisionEntry } from "../types/decisions";
import { TimelineHistoryView } from "./ActivityFeed/TimelineHistoryView";
import { GroupedHistoryView } from "./ActivityFeed/GroupedHistoryView";
import { HistoryViewToggle } from "./ActivityFeed/HistoryViewToggle";
import { logger } from '../lib/logger';
import { SPACING, COLORS, NAVIGATION, PANEL } from '../lib/designSystem';
import { TabPanelFilters } from './layout/TabPanelFilters';
import { ActivityFeedTabEmptyState } from './shared/ActivityFeedTabEmptyState';
import { LoadMoreButton } from './shared/LoadMoreButton';
import { normalizeComment } from '../utils/optimisticUpdates';
import { handleProposalDelete } from '../utils/proposalOperations';
import { getVotingEligibleCollaborators } from '../utils/documentHelpers';
import { PendingDecisionCard } from './ActivityFeed/PendingDecisionCard';
import { useOptimisticVote, type VoteSnapshot } from '../hooks/useOptimisticVote';
import { useHydratePendingProposals } from '../hooks/proposals/useHydratePendingProposals';
import { useDeletionStatuses } from '../hooks/useDeletionStatuses';
import { useActivityFeedOrganizationUpdates } from '../hooks/useActivityFeedOrganizationUpdates';
import { useAuth } from '../hooks/useAuth';
import { ElectionResults } from './governance/ElectionResults';
import { ElectionVotingInterface } from './governance/ElectionVotingInterface';
import { Button } from './ui/button';

/** Standard governance docs only — meeting minutes bypass proposal/voting workflow. */
function isActivityFeedDocument(doc: Document): boolean {
  return doc.documentKind !== 'meeting_minutes';
}

// Throttle delay for WebSocket updates (200ms)
const THROTTLE_DELAY_MS = 200;

/** Vote acceptance broadcasts eventType `paragraph` (not `paragraph-updated`) with proposal/history payload. */
function isParagraphAcceptanceUpdate(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.reverted === true) return false;
  return (
    d.proposalId != null
    || d.approvalPercentage != null
    || (Array.isArray(d.history) && d.history.length > 0)
  );
}

interface ActivityFeedViewProps {
  documents: Document[];
  currentUser: User;
  onNavigateToDocument: (documentId: string) => void;
  onAddComment?: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => Promise<{ comment: Comment } | void>;
  onWebSocketUpdate?: (handler: (update: DocumentUpdate) => void) => void;
  organizations: Organization[];
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  votingState?: Set<string>;
  setVotingState?: React.Dispatch<React.SetStateAction<Set<string>>>;
  filterOrganizationId?: string | null;
  onClearOrganizationFilter?: () => void;
}

function ActivityFeedViewComponent({ documents, currentUser, onNavigateToDocument, onAddComment, onWebSocketUpdate, organizations, onNavigateToOrganization, onNavigateToHash, votingState: votingStateProp, setVotingState: setVotingStateProp, filterOrganizationId = null, onClearOrganizationFilter }: ActivityFeedViewProps) {
  const { t } = useTranslation('activity');
  const { t: tCommon } = useTranslation('common');
  const { t: tDoc } = useTranslation('documents');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { isFirstTime, markWelcomeAsShown, hasSeenHint } = useOnboarding();
  const [localVotingState, setLocalVotingState] = useState<Set<string>>(new Set());
  const votingState = votingStateProp ?? localVotingState;
  const setVotingState = setVotingStateProp ?? setLocalVotingState;
  const [activePanel, setActivePanel] = useState<'decisions' | 'pending' | 'debated'>('decisions');
  const [decisionEntries, setDecisionEntries] = useState<DecisionEntry[]>([]);
  const [viewMode, setViewMode] = useState<'timeline' | 'grouped'>('timeline');
  const [decisionsPagination, setDecisionsPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debatedProposals, setDebatedProposals] = useState<ActivityFeedProposal[]>([]);
  const [loadingDebated, setLoadingDebated] = useState(false);
  const [pendingDecisions, setPendingDecisions] = useState<PendingDecisionEntry[]>([]);
  const [pendingPagination, setPendingPagination] = useState({ total: 0, limit: 20, offset: 0, hasMore: false });
  const [loadingPending, setLoadingPending] = useState(false);
  const [electionResultsTarget, setElectionResultsTarget] = useState<{
    election: RepresentativeElection;
    organization: Organization;
  } | null>(null);
  const [electionVotingTarget, setElectionVotingTarget] = useState<{
    election: RepresentativeElection;
    organization: Organization;
  } | null>(null);

  const { authToken } = useAuth();
  const {
    ruleProposalsById,
    structureProposalsById,
    treeProposalsById,
    electionVoteStatusById,
    orgVoteBallotById,
    loading: hydrationLoading,
    refreshHydration,
  } = useHydratePendingProposals(pendingDecisions);
  const { deletionStatuses: documentVotingDeletionStatuses, refreshDeletionStatuses } = useDeletionStatuses(documents);

  const pendingOrgIds = useMemo(
    () =>
      [...new Set(
        pendingDecisions
          .filter((e) => e.organizationId && ['rule_proposal', 'election', 'organization_vote'].includes(e.kind))
          .map((e) => e.organizationId as string)
      )],
    [pendingDecisions]
  );

  const refreshPendingRef = useRef<() => Promise<void>>(async () => {});
  
  const activityFeedDocuments = useMemo(
    () => documents.filter(isActivityFeedDocument),
    [documents],
  );

  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('all');
  const [pageSize] = useState(20);
  const [displayedCounts, setDisplayedCounts] = useState({
    decisions: 20,
    debated: 20,
    pending: 20,
  });

  // Ref to track debounced refresh timeout
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref to track throttled WebSocket update handler timeout
  const updateHandlerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref for history refresh timeout
  const historyRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs to prevent duplicate simultaneous requests
  const fetchingDecisionsRef = useRef(false);
  const fetchingDebatedRef = useRef(false);
  const fetchingPendingRef = useRef(false);

  // Skip decisions tab fetch on initial mount; refreshAllTabs() loads all three on mount
  const skipDecisionsFetchOnMountRef = useRef(true);

  // Fetch unified decisions (paragraph changes, rule proposals, elections, org votes, etc.)
  const fetchDecisions = useCallback(async (offset: number = 0, replace: boolean = false) => {
    if (fetchingDecisionsRef.current) return;
    fetchingDecisionsRef.current = true;

    if (replace) {
      setLoadingDecisions(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const limit = 20;
      const params: { limit: number; offset: number; documentId?: string; organizationId?: string } = { limit, offset };
      if (selectedDocumentId !== 'all') params.documentId = selectedDocumentId;
      if (filterOrganizationId) params.organizationId = filterOrganizationId;

      const data = await activityApi.getDecisions(params);
      const entries: DecisionEntry[] = data.entries || [];

      if (replace) {
        setDecisionEntries(entries);
      } else {
        setDecisionEntries(prev => [...prev, ...entries]);
      }

      setDecisionsPagination({
        total: data.pagination.total,
        limit: data.pagination.limit,
        offset: data.pagination.offset,
        hasMore: data.pagination.hasMore,
      });
    } catch (error) {
      logger.error('Failed to fetch decisions:', error);
      if (replace) setDecisionEntries([]);
      toast.error(tDoc('failedToLoadDecisions'));
    } finally {
      setLoadingDecisions(false);
      setLoadingMore(false);
      fetchingDecisionsRef.current = false;
    }
  }, [selectedDocumentId, filterOrganizationId, tDoc]);

  const debouncedRefreshDecisions = useCallback(() => {
    if (historyRefreshTimeoutRef.current) {
      clearTimeout(historyRefreshTimeoutRef.current);
    }
    historyRefreshTimeoutRef.current = setTimeout(() => {
      setDecisionsPagination(prev => ({ ...prev, offset: 0 }));
      fetchDecisions(0, true);
      historyRefreshTimeoutRef.current = null;
    }, 500);
  }, [fetchDecisions]);


  const fetchDebatedProposals = async () => {
    // Prevent duplicate simultaneous requests
    if (fetchingDebatedRef.current) {
      return;
    }
    fetchingDebatedRef.current = true;
    setLoadingDebated(true);
    try {
      // Use API client for proper deduplication and caching
      const data = await activityApi.getDebatedProposals();
      setDebatedProposals(data.proposals || []);
    } catch (error) {
      logger.error('Failed to fetch debated proposals:', error);
      setDebatedProposals([]);
    } finally {
      setLoadingDebated(false);
      fetchingDebatedRef.current = false;
    }
  };

  const fetchPendingDecisions = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (fetchingPendingRef.current) return;
    fetchingPendingRef.current = true;
    setLoadingPending(true);
    try {
      const limit = 20;
      const params: { limit: number; offset: number; documentId?: string; organizationId?: string } = { limit, offset };
      if (selectedDocumentId !== 'all') params.documentId = selectedDocumentId;
      if (filterOrganizationId) params.organizationId = filterOrganizationId;
      const data = await activityApi.getPendingDecisions(params);
      const entries = data.entries || [];
      if (append) {
        setPendingDecisions(prev => [...prev, ...entries]);
      } else {
        setPendingDecisions(entries);
      }
      setPendingPagination({
        total: data.pagination.total,
        limit: data.pagination.limit,
        offset: data.pagination.offset,
        hasMore: data.pagination.hasMore,
      });
    } catch (error) {
      logger.error('Failed to fetch pending decisions:', error);
      if (!append) setPendingDecisions([]);
      toast.error(tDoc('failedToLoadPendingDecisions'));
    } finally {
      setLoadingPending(false);
      fetchingPendingRef.current = false;
    }
  }, [selectedDocumentId, filterOrganizationId, tDoc]);

  const refreshPendingDecisions = useCallback(async () => {
    await fetchPendingDecisions(0, false);
    await Promise.all([refreshHydration(), refreshDeletionStatuses()]);
  }, [fetchPendingDecisions, refreshHydration, refreshDeletionStatuses]);

  refreshPendingRef.current = refreshPendingDecisions;

  useActivityFeedOrganizationUpdates({
    organizationIds: pendingOrgIds,
    userId: currentUser?.id ?? null,
    authToken: authToken ?? localStorage.getItem('authToken'),
    onPendingRefresh: () => {
      refreshPendingRef.current();
    },
  });

  // Derive documentId/paragraphId from proposal (supports contextId/contextType for structure/rule proposals)
  const getDocumentParagraphFromProposal = useCallback(
    (proposal: ActivityFeedProposal & { contextId?: string; contextType?: 'paragraph' | 'document' | 'organization' }): { documentId: string; paragraphId: string } | null => {
      const documentId = proposal.documentId ?? (proposal.contextType === 'document' ? proposal.contextId : undefined);
      const paragraphId = proposal.paragraphId ?? '';
      if (!documentId) return null;
      return { documentId, paragraphId };
    },
    []
  );

  // Shared optimistic vote (unified with document view)
  const getVoteContext = useCallback(
    (proposalId: string): { documentId: string; paragraphId: string } | null => {
      const fromPending = pendingDecisions.find(
        (e) => e.kind === 'paragraph_proposal' && (e.payload as unknown as ActivityFeedProposal).id === proposalId
      );
      const proposal = (fromPending?.payload as unknown as ActivityFeedProposal) ?? debatedProposals.find((p) => p.id === proposalId);
      if (!proposal) return null;
      return getDocumentParagraphFromProposal(proposal as ActivityFeedProposal & { contextId?: string; contextType?: 'paragraph' | 'document' | 'organization' });
    },
    [pendingDecisions, debatedProposals, getDocumentParagraphFromProposal]
  );

  const getProposalSnapshot = useCallback(
    (proposalId: string): VoteSnapshot | null => {
      const fromPending = pendingDecisions.find(
        (e) => e.kind === 'paragraph_proposal' && (e.payload as unknown as ActivityFeedProposal).id === proposalId
      );
      const proposal = (fromPending?.payload as unknown as ActivityFeedProposal) ?? debatedProposals.find((p) => p.id === proposalId);
      if (!proposal) return null;
      const votesArray = Array.isArray(proposal.votes) ? proposal.votes : [];
      const currentUserVote = votesArray.find((v: Vote) => v.userId === currentUser.id) as Vote | undefined;
      const partialVoteCounts = proposal.partialVoteCounts ?? {
        pro: votesArray.filter((v: Vote) => v.vote === 'PRO').length,
        contra: votesArray.filter((v: Vote) => v.vote === 'CONTRA').length,
        neutral: votesArray.filter((v: Vote) => v.vote === 'NEUTRAL').length,
        total: votesArray.length,
      };
      return { votes: votesArray, partialVoteCounts, currentUserVote };
    },
    [pendingDecisions, debatedProposals, currentUser.id]
  );

  const applyOptimistic = useCallback(
    (
      proposalId: string,
      _documentId: string,
      _paragraphId: string,
      voteType: 'PRO' | 'NEUTRAL' | 'CONTRA',
      payload: { optimisticVote: Vote; newCounts: { pro: number; contra: number; neutral: number; total: number } }
    ) => {
      const { optimisticVote, newCounts } = payload;
      setPendingDecisions((prev) =>
        prev.map((entry) => {
          if (entry.kind !== 'paragraph_proposal' || (entry.payload as unknown as ActivityFeedProposal).id !== proposalId) return entry;
          const p = entry.payload as unknown as ActivityFeedProposal;
          const votesArr = Array.isArray(p.votes) ? p.votes : [];
          const filteredVotes = votesArr.filter((v: Vote) => v.userId !== currentUser.id);
          return {
            ...entry,
            payload: {
              ...p,
              votes: [...filteredVotes, optimisticVote],
              partialVoteCounts: newCounts,
              userVote: voteType,
            } as Record<string, unknown>,
          };
        })
      );
      setDebatedProposals((prev) =>
        prev.map((p) => {
          if (p.id !== proposalId) return p;
          const votesArr = Array.isArray(p.votes) ? p.votes : [];
          const filteredVotes = votesArr.filter((v: Vote) => v.userId !== currentUser.id);
          return { ...p, votes: [...filteredVotes, optimisticVote], partialVoteCounts: newCounts, userVote: voteType };
        })
      );
    },
    [currentUser.id]
  );

  const rollback = useCallback((proposalId: string, snapshot: VoteSnapshot) => {
    const { partialVoteCounts: originalCounts, currentUserVote } = snapshot;
    setPendingDecisions((prev) =>
      prev.map((entry) => {
        if (entry.kind !== 'paragraph_proposal' || (entry.payload as unknown as ActivityFeedProposal).id !== proposalId) return entry;
        const p = entry.payload as unknown as ActivityFeedProposal;
        const pVotesArr = Array.isArray(p.votes) ? p.votes : [];
        const restoredVotes = pVotesArr.filter((v: Vote) => !v.id.startsWith('optimistic-'));
        if (currentUserVote) restoredVotes.push(currentUserVote);
        return {
          ...entry,
          payload: {
            ...p,
            votes: restoredVotes,
            partialVoteCounts: originalCounts,
            userVote: (currentUserVote as Vote)?.vote,
          } as Record<string, unknown>,
        };
      })
    );
    setDebatedProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        const pVotesArr = Array.isArray(p.votes) ? p.votes : [];
        const restoredVotes = pVotesArr.filter((v: Vote) => !v.id.startsWith('optimistic-'));
        if (currentUserVote) restoredVotes.push(currentUserVote);
        return { ...p, votes: restoredVotes, partialVoteCounts: originalCounts, userVote: (currentUserVote as Vote)?.vote };
      })
    );
  }, []);

  // Refetch feed after vote so UI shows server state even if WebSocket didn't arrive
  // (Activity feed may not be subscribed to the document room when voting from feed)
  const refreshFeedAfterVote = useCallback(async () => {
    await Promise.all([
      refreshPendingDecisions(),
      fetchDebatedProposals(),
    ]);
  }, [refreshPendingDecisions, fetchDebatedProposals]);

  const { vote } = useOptimisticVote({
    votingState,
    setVotingState,
    currentUser,
    getVoteContext,
    getProposalSnapshot,
    applyOptimistic,
    rollback,
    reloadDocument: refreshFeedAfterVote,
  });

  // Handle voting from Activity Feed (unified signature: delegates to shared hook)
  const handleVote = useCallback(
    async (proposalId: string, _documentId: string, _paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
      await vote(proposalId, voteType);
    },
    [vote]
  );

  // Handle adding a comment/reply
  const handleAddComment = async (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => {
    if (!onAddComment) {
      // Fallback: navigate to document
      onNavigateToDocument(documentId);
      return;
    }

    try {
      const response = await onAddComment(proposalId, documentId, paragraphId, text, parentId);
      
      // Update local state immediately with API response (WebSocket will update if it arrives)
      if (response?.comment) {
        logger.log('📝 Activity feed: HTTP response received, adding comment:', {
          commentId: response.comment.id,
          proposalId,
          parentId: response.comment.parentId
        });
        
        const normalizedComment = normalizeComment(response.comment);
        
        // Update function for proposals
        const updateProposalWithComment = (proposals: ActivityFeedProposal[]) => {
          return proposals.map(prop => {
            if (prop.id === proposalId) {
              const existingComments = prop.comments || [];
              // Check if comment already exists (WebSocket might have added it)
              const commentExists = existingComments.some(c => c.id === normalizedComment.id);
              if (commentExists) {
                logger.log('✅ Activity feed: Comment already exists from WebSocket, skipping HTTP add');
                return prop;
              }
              
              logger.log('➕ Activity feed: Adding comment from HTTP response:', {
                commentId: normalizedComment.id,
                parentId: normalizedComment.parentId,
                currentCount: existingComments.length
              });
              
              return {
                ...prop,
                comments: [...existingComments, normalizedComment]
              };
            }
            return prop;
          });
        };
        
        // Update pending decisions (paragraph_proposal entries)
        setPendingDecisions(prev => {
          return prev.map(entry => {
            if (entry.kind !== 'paragraph_proposal' || (entry.payload as unknown as ActivityFeedProposal).id !== proposalId) return entry;
            const proposal = entry.payload as unknown as ActivityFeedProposal;
            const updated = updateProposalWithComment([proposal])[0];
            return updated ? { ...entry, payload: updated as unknown as Record<string, unknown> } : entry;
          });
        });
        
        setDebatedProposals(prev => {
          const hasProposal = prev.some(p => p.id === proposalId);
          if (!hasProposal) return prev;
          const updated = updateProposalWithComment(prev);
          return updated !== prev ? updated : [...updated];
        });
      }
    } catch (error) {
      logger.error('Failed to add comment:', error);
      // Handle 404 errors specifically for accepted proposals
      if (error instanceof ApiError && error.status === 404) {
        toast.error(tCommon('toasts.unableToComment'));
      } else {
        toast.error(tCommon('toasts.failedToAddComment'));
      }
    }
  };


  // Handle voting from Activity Feed
  // Handle proposal deletion from Activity Feed.
  // Only paragraph proposals use this path: onDeleteProposal is passed only to ActivityFeedProposalCard
  // (paragraph_proposal case in PendingDecisionCard). Structure and rule proposals use separate
  // delete mechanisms (StructureProposalCardWrapper, RuleProposalCardWrapper) and their own APIs,
  // so ctx.paragraphId is always set for this handler and the paragraph proposal DELETE endpoint is used.
  const handleDeleteProposal = async (proposalId: string) => {
    const fromPending = pendingDecisions.find(e =>
      e.kind === 'paragraph_proposal' && (e.payload as unknown as ActivityFeedProposal).id === proposalId
    );
    const proposal = fromPending
      ? (fromPending.payload as unknown as ActivityFeedProposal)
      : debatedProposals.find(p => p.id === proposalId);
    if (!proposal) {
      logger.error('Proposal not found for deletion', { proposalId });
      toast.error(tCommon('toasts.proposalNotFound'));
      return;
    }
    try {
      const ctx = getDocumentParagraphFromProposal(proposal as ActivityFeedProposal & { contextId?: string; contextType?: 'paragraph' | 'document' | 'organization' });
      if (!ctx) {
        toast.error(tCommon('toasts.proposalNotFound'));
        return;
      }
      await handleProposalDelete(proposalId, ctx.documentId, ctx.paragraphId);
      setPendingDecisions(prev => prev.filter(e =>
        !(e.kind === 'paragraph_proposal' && (e.payload as unknown as ActivityFeedProposal).id === proposalId)
      ));
      setDebatedProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (error) {
      logger.error('Failed to delete proposal:', error);
    }
  };
  
  const refreshAllTabs = useCallback(async () => {
    Promise.all([
      fetchDecisions(0, true),
      fetchDebatedProposals(),
      refreshPendingDecisions(),
    ]).catch(err => {
      logger.error('Error refreshing all tabs:', err);
    });
  }, [fetchDecisions, refreshPendingDecisions]);

  // Debounced refresh function to prevent excessive API calls from rapid WebSocket updates
  const debouncedRefreshAllTabs = useCallback(() => {
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    // Set new debounced refresh (500ms delay)
    refreshTimeoutRef.current = setTimeout(() => {
      refreshAllTabs();
      refreshTimeoutRef.current = null;
    }, 500);
  }, [refreshAllTabs]);

  // Handle WebSocket updates for activity feed
  // The parent (App.tsx) will call onWebSocketUpdate when updates arrive
  useEffect(() => {
    if (!onWebSocketUpdate) return;

    // Internal function to process the update
    const processUpdate = (update: DocumentUpdate) => {
      let shouldRefreshTabs = false;

      // Handle vote updates (paragraph proposals)
      if (update.eventType === 'vote' && update.data && typeof update.data === 'object' && 'proposalId' in update.data) {
        const { proposalId, vote: voteData } = update.data as { 
          proposalId: string; 
          vote?: { 
            allVotes?: Vote[];
            voteCounts?: { pro: number; contra: number; neutral: number; total: number };
          } 
        };
        
        // Handle single-phase update with both voteCounts and allVotes
        if (voteData?.allVotes && voteData?.voteCounts) {
          // Validate that vote counts match votes array
          const voteCount = voteData.allVotes.length;
          const totalFromCounts = voteData.voteCounts.total || 0;
          
          if (voteCount !== totalFromCounts) {
            console.warn('Vote counts mismatch in ActivityFeedView', {
              proposalId,
              voteCount,
              totalFromCounts,
              voteCounts: voteData.voteCounts
            });
          }
          
          const updateProposalVotes = (proposals: ActivityFeedProposal[]) => {
            // Always create a new array to ensure React detects the change
            return proposals.map(prop => {
              if (prop.id === proposalId) {
                // Create new votes array with new references
                const newVotes: Vote[] = voteData.allVotes!.map((v: Vote) => ({
                  id: v.id,
                  proposalId: v.proposalId,
                  userId: v.userId,
                  vote: v.vote,
                  createdAt: v.createdAt,
                  user: v.user || undefined
                }));
                
                // Return new proposal object with both votes and vote counts
                return {
                  ...prop,
                  votes: newVotes, // New array reference
                  partialVoteCounts: voteData.voteCounts // Include vote counts for instant UI updates
                };
              }
              return prop;
            });
          };

          setPendingDecisions(prev => prev.map(entry => {
            if (entry.kind !== 'paragraph_proposal' || (entry.payload as unknown as ActivityFeedProposal).id !== proposalId) return entry;
            const updated = updateProposalVotes([entry.payload as unknown as ActivityFeedProposal]);
            return updated[0] ? { ...entry, payload: updated[0] as unknown as Record<string, unknown> } : entry;
          }));

          setDebatedProposals(prev => {
            const hasProposal = prev.some(p => p.id === proposalId);
            if (!hasProposal) return prev; // No change needed
            const updated = updateProposalVotes(prev);
            // Ensure we return a new array reference even if contents are the same
            return updated !== prev ? updated : [...updated];
          });
        }

        // Unified: clear voting state and show success (same as document view WebSocket handler)
        setVotingState(prev => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
        toast.dismiss(`vote-${proposalId}`);
        toast.success(tCommon('toasts.voteRecorded'), { duration: 2000 });

        // Votes might cause proposals to move between tabs (e.g., pending -> agreed)
        // Refresh all tabs to ensure accurate counts
        shouldRefreshTabs = true;
      }
      // Handle comment updates
      else if (update.eventType === 'comment' && update.data && typeof update.data === 'object' && 'proposalId' in update.data) {
        const { proposalId, comment } = update.data as { proposalId: string; comment?: Comment };
        
        if (comment) {
          // normalizeComment now returns parentId as string | undefined (matching Comment type)
          const normalized = normalizeComment(comment);
          
          const updateProposalComments = (proposals: ActivityFeedProposal[]) => {
            // Always create a new array to ensure React detects the change
            return proposals.map(prop => {
              if (prop.id === proposalId) {
                const existingComments = prop.comments || [];
                const commentExists = existingComments.some(c => c.id === normalized.id);
                
                // Create new comments array
                let newComments: Comment[];
                if (commentExists) {
                  // Update existing comment
                  newComments = existingComments.map(c => 
                    c.id === normalized.id ? normalized : c
                  );
                } else {
                  // Add new comment
                  newComments = [...existingComments, normalized];
                }
                
                // Return new proposal object with new comments array
                return {
                  ...prop,
                  comments: newComments // New array reference
                };
              }
              return prop;
            });
          };

          setPendingDecisions(prev => prev.map(entry => {
            if (entry.kind !== 'paragraph_proposal' || (entry.payload as unknown as ActivityFeedProposal).id !== proposalId) return entry;
            const updated = updateProposalComments([entry.payload as unknown as ActivityFeedProposal]);
            return updated[0] ? { ...entry, payload: updated[0] as unknown as Record<string, unknown> } : entry;
          }));

          setDebatedProposals(prev => {
            const hasProposal = prev.some(p => p.id === proposalId);
            if (!hasProposal) return prev; // No change needed
            const updated = updateProposalComments(prev);
            // Ensure we return a new array reference
            return updated !== prev ? updated : [...updated];
          });

          // Comments might affect debated proposals ranking
          // Refresh debated tab to ensure accurate ordering
          shouldRefreshTabs = true;
        }
      }
      // Handle new proposal updates
      else if (update.eventType === 'proposal' && update.data && typeof update.data === 'object' && 'proposal' in update.data) {
        // New proposals from WebSocket are in Proposal format, but we need ActivityFeedProposal format
        // Trigger a refresh instead of trying to add directly, as we don't have all required fields
        // (documentId, documentTitle, proposedText, currentText, etc.)
        shouldRefreshTabs = true;
      }
      // Handle proposal acceptance (proposal moved from pending/debated to agreed)
      else if (
        update.data
        && (
          update.eventType === 'paragraph-updated'
          || (update.eventType === 'paragraph' && isParagraphAcceptanceUpdate(update.data))
        )
      ) {
        // When a proposal is accepted, refresh the decisions list
        // Use debounced refresh to avoid excessive API calls
        debouncedRefreshDecisions();

        // Also refresh other tabs to ensure accurate state
        shouldRefreshTabs = true;
      }
      // Structure/tree/deletion votes use hydrated proposal cards — refresh pending + hydration
      else if (
        (update.eventType === 'structure-proposal-vote' && update.data && typeof update.data === 'object' && 'type' in update.data && update.data.type === 'structure-proposal-vote')
        || (update.eventType === 'tree-proposal-vote' && update.data && typeof update.data === 'object' && 'type' in update.data && update.data.type === 'tree-proposal-vote')
        || (update.eventType === 'deletion-vote' && update.data && typeof update.data === 'object' && 'type' in update.data && update.data.type === 'deletion-vote')
      ) {
        shouldRefreshTabs = true;
      }

      // Refresh all tabs if needed to ensure counters are accurate
      if (shouldRefreshTabs) {
        // Use debounced refresh to batch multiple rapid updates
        debouncedRefreshAllTabs();
      }
    };

    // Throttled handler that processes WebSocket updates
    const handleUpdate = (update: DocumentUpdate) => {
      // Clear existing timeout
      if (updateHandlerTimeoutRef.current) {
        clearTimeout(updateHandlerTimeoutRef.current);
      }
      
      // Throttle to max 1 update per 200ms
      updateHandlerTimeoutRef.current = setTimeout(() => {
        processUpdate(update);
        updateHandlerTimeoutRef.current = null;
      }, THROTTLE_DELAY_MS);
    };

    // Expose handler to parent via callback prop
    // The parent will call this handler when WebSocket updates arrive
    if (onWebSocketUpdate) {
      onWebSocketUpdate(handleUpdate);
    }

    // Cleanup timeout on unmount
    return () => {
      if (updateHandlerTimeoutRef.current) {
        clearTimeout(updateHandlerTimeoutRef.current);
        updateHandlerTimeoutRef.current = null;
      }
    };
  }, [onWebSocketUpdate, debouncedRefreshAllTabs, debouncedRefreshDecisions, setVotingState, tCommon]);

  // Cleanup debounce timeouts on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (historyRefreshTimeoutRef.current) {
        clearTimeout(historyRefreshTimeoutRef.current);
        historyRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  // Get all collaborators for a document
  // Returns empty array if document not found in documents prop (graceful degradation)
  // Memoized to prevent unnecessary recalculations
  const getAllCollaborators = useCallback((documentId: string): User[] => {
    const doc = documents.find(d => d.id === documentId);
    if (!doc) {
      // Document not in documents prop - return empty array instead of failing
      // This can happen when proposals reference documents not loaded in the current view
      return [];
    }
    return getVotingEligibleCollaborators(doc);
  }, [documents]);

  // Get organization for a document
  // Show indicators for multi-org users and single-org users (to distinguish personal vs org content)
  // Memoized to prevent unnecessary recalculations
  const getOrganizationForDocument = useCallback((documentId: string): Organization | null => {
    const doc = documents.find(d => d.id === documentId);
    if (!doc?.organizationId) {
      return null;
    }
    
    return organizations.find(o => o.id === doc.organizationId) || null;
  }, [documents, organizations]);

  // Get document options for a document (for vote progress bar calculations)
  const getDocumentOptions = useCallback((documentId: string) => {
    const doc = documents.find(d => d.id === documentId);
    return doc?.options || undefined;
  }, [documents]);

  const isRepForOrg = useCallback((organizationId: string) => {
    const org = organizations.find(o => o.id === organizationId);
    return !!org?.representatives?.includes(currentUser.id);
  }, [organizations, currentUser.id]);

  const isActiveMemberOfOrg = useCallback((organizationId: string) => {
    const org = organizations.find(o => o.id === organizationId);
    return !!org?.members?.some(m => m.userId === currentUser.id && m.status === 'active');
  }, [organizations, currentUser.id]);

  // Helper function to prepare proposal card data - eliminates code duplication
  function prepareProposalCardData(
    item: ActivityFeedProposal,
    tabType: 'debated' | 'pending',
    debatedProposals?: ActivityFeedProposal[] // Only needed for debated tab to calculate ranking
  ) {
    // Validate required fields for proposals
    const proposal = item as ActivityFeedProposal;
    if (!proposal.documentId || !proposal.documentTitle || !proposal.proposedText) {
      logger.error(`Missing required fields in ${tabType} proposal`, { proposalId: proposal.id });
      return null;
    }

    // Handle ActivityFeedProposal (debated/pending tabs)
    const adaptedSuggestion = adaptProposalToSuggestion(proposal);
    const documentContext = extractDocumentContext(proposal);
    const originalText = getOriginalText(proposal);
    const allCollaborators = getAllCollaborators(proposal.documentId);
    const organization = getOrganizationForDocument(proposal.documentId);
    
    // Adapt other proposals to Suggestions (consistent syntax)
    const otherProposals = (proposal.otherProposals || []).map(p => adaptProposalToSuggestion(p));
    
    // Extract agreed version info (already in correct format from API)
    const agreedVersionInfo = proposal.agreedVersion;

    // Calculate ranking for debated tab
    let ranking = undefined;
    if (tabType === 'debated' && debatedProposals) {
      const filtered = filterProposalsByDocument(debatedProposals);
      const actualIndex = filtered.indexOf(proposal);
      ranking = {
        index: actualIndex + 1,
        score: proposal.debateScore || 0,
        isControversial: (proposal.engagement?.proPercentage ?? 0) > 30 && 
                        (proposal.engagement?.contraPercentage ?? 0) > 30,
      };
    }

    return {
      adaptedSuggestion,
      documentContext,
      originalText,
      allCollaborators,
      organization,
      history: undefined,
      otherProposals,
      agreedVersionInfo,
      totalUsers: proposal.totalUsers || allCollaborators.length, // Consistent: prefer API value
      ranking,
      documentOptions: getDocumentOptions(proposal.documentId),
    };
  }

  // Filter proposals by documentId (ActivityFeedProposal has documentId directly)
  const filterProposalsByDocument = useCallback((proposals: ActivityFeedProposal[]): ActivityFeedProposal[] => {
    if (selectedDocumentId === 'all') return proposals;
    return proposals.filter(proposal => proposal.documentId === selectedDocumentId);
  }, [selectedDocumentId]);

  // Filter pending decisions by document (entries with documentId) or show all when 'all'
  const filterPendingDecisionsByDocument = useCallback((entries: PendingDecisionEntry[]): PendingDecisionEntry[] => {
    if (selectedDocumentId === 'all') return entries;
    return entries.filter(e => e.documentId === selectedDocumentId || !e.documentId);
  }, [selectedDocumentId]);

  const getDecisionsCount = (): number => {
    if (selectedDocumentId === 'all') {
      return decisionsPagination.total;
    }
    return decisionEntries.filter(e => e.documentId === selectedDocumentId).length;
  };

  const getDebatedCount = (): number => {
    return filterProposalsByDocument(debatedProposals).length;
  };

  const getPendingCount = (): number => {
    return filterPendingDecisionsByDocument(pendingDecisions).length;
  };

  const getDisplayedItems = useCallback(<T,>(items: T[], tab: 'decisions' | 'debated' | 'pending'): T[] => {
    if (tab === 'decisions') {
      const filtered = selectedDocumentId === 'all'
        ? (items as DecisionEntry[])
        : (items as DecisionEntry[]).filter((e: DecisionEntry) => (e as { documentId?: string }).documentId === selectedDocumentId);
      return filtered as T[];
    }
    if (tab === 'pending') {
      const filtered = filterPendingDecisionsByDocument(items as PendingDecisionEntry[]);
      return filtered.slice(0, displayedCounts[tab]) as T[];
    }
    const filtered = filterProposalsByDocument(items as ActivityFeedProposal[]);
    return filtered.slice(0, displayedCounts[tab]) as T[];
  }, [filterProposalsByDocument, filterPendingDecisionsByDocument, displayedCounts, selectedDocumentId]);

  const displayedDecisionItems = useMemo((): DecisionEntry[] => {
    return getDisplayedItems(decisionEntries, 'decisions') as DecisionEntry[];
  }, [getDisplayedItems, decisionEntries]);

  const displayedDebatedItems = useMemo(() => {
    return getDisplayedItems(debatedProposals, 'debated');
  }, [getDisplayedItems, debatedProposals]);

  const displayedPendingItems = useMemo((): PendingDecisionEntry[] => {
    return getDisplayedItems(pendingDecisions, 'pending') as PendingDecisionEntry[];
  }, [getDisplayedItems, pendingDecisions]);

  const hasMore = (items: (ActivityFeedProposal | DecisionEntry | PendingDecisionEntry)[], tab: 'decisions' | 'debated' | 'pending'): boolean => {
    if (tab === 'decisions') return decisionsPagination.hasMore;
    if (tab === 'pending') {
      const filtered = filterPendingDecisionsByDocument(items as PendingDecisionEntry[]);
      return pendingPagination.hasMore || filtered.length > displayedCounts[tab];
    }
    const filtered = filterProposalsByDocument(items as ActivityFeedProposal[]);
    return filtered.length > displayedCounts[tab];
  };

  const loadMore = (tab: 'decisions' | 'debated' | 'pending') => {
    if (tab === 'decisions') {
      const nextOffset = decisionsPagination.offset + decisionsPagination.limit;
      fetchDecisions(nextOffset, false);
    } else if (tab === 'pending') {
      if (pendingPagination.hasMore) {
        fetchPendingDecisions(pendingPagination.offset + pendingPagination.limit, true);
      }
      setDisplayedCounts(prev => ({ ...prev, [tab]: prev[tab] + pageSize }));
    } else {
      setDisplayedCounts(prev => ({ ...prev, [tab]: prev[tab] + pageSize }));
    }
  };

  useEffect(() => {
    if (
      selectedDocumentId !== 'all'
      && !activityFeedDocuments.some((doc) => doc.id === selectedDocumentId)
    ) {
      setSelectedDocumentId('all');
    }
  }, [activityFeedDocuments, selectedDocumentId]);

  // Load all tab data on mount so badge counters are correct before clicking tabs
  useEffect(() => {
    refreshAllTabs();
  }, [refreshAllTabs]);

  useEffect(() => {
    if (activePanel === 'decisions') {
      if (skipDecisionsFetchOnMountRef.current) {
        skipDecisionsFetchOnMountRef.current = false;
        return;
      }
      setDecisionsPagination(prev => ({ ...prev, offset: 0 }));
      fetchDecisions(0, true);
    }
  }, [activePanel, selectedDocumentId, filterOrganizationId, fetchDecisions]);

  useEffect(() => {
    if (activePanel === 'debated') {
      fetchDebatedProposals();
    }
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === 'pending') {
      fetchPendingDecisions(0, false);
    }
  }, [activePanel, filterOrganizationId, fetchPendingDecisions]);

  // Periodic refresh as fallback to ensure counters stay accurate
  // Refresh all tabs every 180 seconds (increased from 90s to reduce rate limiting)
  // Only poll when component is mounted (user is on activity feed view)
  // If WebSocket is available (onWebSocketUpdate provided), rely on real-time updates
  useEffect(() => {
    // If WebSocket is available, reduce polling frequency significantly
    // WebSocket updates should handle most real-time updates
    if (onWebSocketUpdate) {
      // WebSocket available - only poll as a safety net
      const interval = setInterval(() => {
        refreshAllTabs();
      }, 360000); // 360 seconds - only as fallback when WebSocket might be slow
      return () => clearInterval(interval);
    } else {
      // No WebSocket - poll more frequently as primary update mechanism
      const interval = setInterval(() => {
        refreshAllTabs();
      }, 180000); // 180 seconds
      return () => clearInterval(interval);
    }
  }, [refreshAllTabs, onWebSocketUpdate]);

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.layout.shrinkContent, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        {/* Welcome banner for first-time users */}
        {isFirstTime && !hasSeenHint('activity-welcome') && documents.length === 0 && (
          <div className={SPACING.section.margin}>
            <OnboardingHint
              hintKey="activity-welcome"
              message={tOnboarding('activityWelcome')}
              variant="info"
              position="inline"
              showOnce={true}
              delay={500}
              actionLabel={tOnboarding('gotIt')}
              onAction={() => markWelcomeAsShown()}
            />
          </div>
        )}
        <Tabs value={activePanel} onValueChange={(value) => {
          setActivePanel(value as 'decisions' | 'pending' | 'debated');
          setDisplayedCounts({
            decisions: pageSize,
            debated: pageSize,
            pending: pageSize,
          });
        }}>
          {/* Toolbar: tabs + document filter in one block; below header in flow (same on mobile and desktop) */}
          <div className={cn(PANEL.header.marginBottom, 'space-y-2')}>
          <div className={cn(NAVIGATION.tabs.wrapper, NAVIGATION.tabs.wrapperInner)}>
              <TabsList className={cn('w-full md:w-auto', NAVIGATION.tabs.listCompact)}>
                <TabsTrigger
                  value="decisions"
                  className={NAVIGATION.tabs.triggerCompact}
                  aria-label={t('tabAria.decisions', { count: getDecisionsCount() })}
                >
                  <Icon name="CheckCircle" className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span aria-hidden="true">{t('decisions')}</span>
                  <Badge variant="default" className="ml-0.5 px-1.5 py-0 bg-[var(--vote-pro)] text-xs" aria-label={t('tabAria.decisions', { count: getDecisionsCount() })}>
                    {getDecisionsCount()}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="debated"
                  className={NAVIGATION.tabs.triggerCompact}
                  aria-label={t('tabAria.discussed', { count: getDebatedCount() })}
                >
                  <Icon name="TrendingUp" className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span aria-hidden="true">{t('discussed')}</span>
                  <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs" aria-label={t('tabAria.discussed', { count: getDebatedCount() })}>
                    {getDebatedCount()}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="pending"
                  className={cn(
                    NAVIGATION.tabs.triggerCompact,
                    getPendingCount() > 0 && "font-semibold"
                  )}
                  aria-label={t('tabAria.pending', { count: getPendingCount() })}
                >
                  <Icon name="Clock" className={cn(
                    "h-3 w-3 sm:h-4 sm:w-4",
                    getPendingCount() > 0 && "animate-pulse text-[var(--vote-neutral)]"
                  )} aria-hidden="true" />
                  <span aria-hidden="true">{t('pending')}</span>
                  <Badge 
                    className={cn(
                      "ml-0.5 px-1.5 py-0 text-xs border font-medium",
                      getPendingCount() > 0 
                        ? "!bg-[var(--vote-neutral)] !text-white border-transparent animate-pulse" 
                        : `${COLORS.bg.muted} !text-foreground border-border`
                    )}
                    aria-label={t('tabAria.pending', { count: getPendingCount() })}
                  >
                    {getPendingCount()}
                  </Badge>
                </TabsTrigger>
              </TabsList>
          </div>

          {/* View toggle (Timeline / Grouped) - only on Decisions tab */}
          {activePanel === 'decisions' && (
            <div className="flex justify-center">
              <HistoryViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            </div>
          )}

          {/* Document Filter - lowest of the three toolbar rows */}
          <TabPanelFilters align="centered" withMarginBottom={false}>
            {filterOrganizationId && (
              <div className="flex items-center gap-2 mr-2">
                <Badge variant="secondary" className="gap-1">
                  <Icon name="Building2" className="h-3 w-3" />
                  {organizations.find((o) => o.id === filterOrganizationId)?.name ?? t('item.organization')}
                </Badge>
                {onClearOrganizationFilter && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearOrganizationFilter}>
                    {t('clearOrgFilter')}
                  </Button>
                )}
              </div>
            )}
            <Icon name="Filter" className={cn('h-3.5 w-3.5', COLORS.text.secondary)} />
            <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
              <SelectTrigger className="w-[200px] h-8 py-1 px-2 bg-card text-sm">
                <SelectValue placeholder={t('filterByDocument')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allDocuments')}</SelectItem>
                {activityFeedDocuments.map(doc => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabPanelFilters>
          </div>

          {/* Content */}

          <TabsContent value="decisions" className={NAVIGATION.tabs.contentMargin}>
            {loadingDecisions ? (
              <div className={SPACING.container.vertical}>
                <LoadingState isLoading={true} mode="skeleton" skeletonVariant="card" skeletonCount={3}>
                  <div />
                </LoadingState>
              </div>
            ) : decisionEntries.length === 0 ? (
              <ActivityFeedTabEmptyState
                icon={<Icon name="CheckCircle" className="h-12 w-12 mx-auto text-[var(--color-green-400)]" />}
                title={t('emptyDecisionsTitle')}
                description={t('emptyDecisionsDescription')}
                tip={{
                  message: <Trans i18nKey="activity:emptyDecisionsTip" components={{ strong: <strong /> }} />,
                  subMessage: t('emptyDecisionsSubMessage'),
                  bgColor: 'bg-[var(--badge-warning-bg)]',
                  textColor: 'text-[var(--badge-warning-text)]',
                  borderColor: 'border-[var(--color-amber-200)]',
                }}
                showTip={documents.length > 0 || (organizations?.length ?? 0) > 0}
              />
            ) : (
              <div className={SPACING.container.vertical}>
                {viewMode === 'timeline' ? (
                  <TimelineHistoryView
                    entries={displayedDecisionItems}
                    onNavigateToDocument={onNavigateToDocument}
                    onNavigateToOrganization={onNavigateToOrganization}
                    onNavigateToHash={onNavigateToHash}
                    hasMore={hasMore(decisionEntries, 'decisions')}
                    onLoadMore={() => loadMore('decisions')}
                    loadingMore={loadingMore}
                    remainingCount={decisionsPagination.total - decisionEntries.length}
                    documents={documents}
                    organizations={organizations}
                  />
                ) : (
                  <GroupedHistoryView
                    entries={displayedDecisionItems}
                    onNavigateToDocument={onNavigateToDocument}
                    onNavigateToOrganization={onNavigateToOrganization}
                    onNavigateToHash={onNavigateToHash}
                    hasMore={hasMore(decisionEntries, 'decisions')}
                    onLoadMore={() => loadMore('decisions')}
                    loadingMore={loadingMore}
                    remainingCount={decisionsPagination.total - decisionEntries.length}
                    documents={documents}
                    organizations={organizations}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="debated" className={NAVIGATION.tabs.contentMargin}>
            {loadingDebated ? (
              <div className={SPACING.container.vertical}>
                <DocumentCardSkeleton count={3} />
              </div>
            ) : debatedProposals.length === 0 ? (
              <ActivityFeedTabEmptyState
                icon={<Icon name="TrendingUp" className="h-12 w-12 mx-auto text-[var(--badge-purple-text)]" />}
                title={t('emptyDebatedTitle')}
                description={t('emptyDebatedDescription')}
                tip={{
                  message: <Trans i18nKey="activity:emptyDebatedTip" components={{ strong: <strong /> }} />,
                  subMessage: t('emptyDebatedSubMessage'),
                  bgColor: 'bg-[var(--badge-purple-bg)]',
                  textColor: 'text-[var(--badge-purple-text)]',
                  borderColor: 'border-[var(--badge-purple-text)]',
                }}
                showTip={documents.length > 0}
              />
            ) : (
              <div className={SPACING.container.vertical}>
                {displayedDebatedItems.map((proposal: ActivityFeedProposal) => {
                  const cardData = prepareProposalCardData(proposal, 'debated', debatedProposals);
                  if (!cardData) return null;

                  return (
                    <ActivityFeedProposalCard
                      key={proposal.id}
                      proposal={cardData.adaptedSuggestion}
                      documentContext={cardData.documentContext}
                      currentUser={currentUser}
                      totalUsers={cardData.totalUsers}
                      allCollaborators={cardData.allCollaborators}
                      originalText={cardData.originalText}
                      tabType="debated"
                      organization={cardData.organization}
                      ranking={cardData.ranking}
                      otherProposals={cardData.otherProposals}
                      agreedVersion={cardData.agreedVersionInfo}
                      documentOptions={cardData.documentOptions}
                      onVote={(proposalId, documentId, paragraphId, voteType) => 
                        handleVote(proposalId, documentId, paragraphId, voteType)
                      }
                      onComment={(proposalId, documentId, paragraphId, text, parentId) => 
                        handleAddComment(proposalId, documentId, paragraphId, text, parentId)
                      }
                      onDeleteProposal={handleDeleteProposal}
                      onNavigateToDocument={onNavigateToDocument}
                    />
                  );
                })}
                {hasMore(debatedProposals, 'debated') && (
                  <LoadMoreButton
                    remainingCount={filterProposalsByDocument(debatedProposals).length - displayedCounts.debated}
                    onLoadMore={() => loadMore('debated')}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className={NAVIGATION.tabs.contentMargin}>
            {loadingPending ? (
              <div className={SPACING.container.vertical}>
                <LoadingState isLoading={true} mode="skeleton" skeletonVariant="card" skeletonCount={3}>
                  <div />
                </LoadingState>
              </div>
            ) : pendingDecisions.length === 0 ? (
              <ActivityFeedTabEmptyState
                icon={<Icon name="Clock" className="h-12 w-12 mx-auto text-[var(--color-blue-400)]" />}
                title={t('emptyPendingTitle')}
                description={t('emptyPendingDescription')}
                tip={{
                  message: <Trans i18nKey="activity:emptyPendingTip" components={{ strong: <strong /> }} />,
                  subMessage: t('emptyPendingSubMessage'),
                  bgColor: 'bg-[var(--badge-info-bg)]',
                  textColor: 'text-[var(--badge-info-text)]',
                  borderColor: 'border-[var(--color-blue-200)]',
                }}
                showTip={documents.length === 0}
              />
            ) : (
              <div className={SPACING.container.vertical}>
                {displayedPendingItems.map((entry) => (
                  <PendingDecisionCard
                    key={entry.id}
                    entry={entry}
                    currentUser={currentUser}
                    organizations={organizations}
                    documents={documents}
                    onVoteParagraph={handleVote}
                    onCommentParagraph={handleAddComment}
                    onDeleteProposal={handleDeleteProposal}
                    onNavigateToDocument={onNavigateToDocument}
                    onNavigateToOrganization={onNavigateToOrganization}
                    prepareProposalCardData={prepareProposalCardData}
                    onRefreshPending={() => { void refreshPendingDecisions(); }}
                    onOpenElectionVote={(election, org) => setElectionVotingTarget({ election, org })}
                    onCompleteElection={(election, org) => setElectionResultsTarget({ election, org })}
                    onOpenOrgVote={onNavigateToOrganization ? (_vote, org) => onNavigateToOrganization(org.id) : undefined}
                    onCloseAmendments={async (documentId) => {
                      try {
                        await documentsApi.closeAmendments(documentId);
                        toast.success(tDoc('amendmentsClosedSuccess'));
                        await refreshPendingDecisions();
                      } catch (error) {
                        logger.error('Failed to close amendments:', error);
                        toast.error(error instanceof Error ? error.message : tDoc('failedToCloseAmendments'));
                      }
                    }}
                    isRepresentative={isRepForOrg}
                    isActiveMember={isActiveMemberOfOrg}
                    ruleProposalsById={ruleProposalsById}
                    structureProposalsById={structureProposalsById}
                    treeProposalsById={treeProposalsById}
                    electionVoteStatusById={electionVoteStatusById}
                    orgVoteBallotById={orgVoteBallotById}
                    hydrationLoading={hydrationLoading}
                    documentVotingDeletionStatuses={documentVotingDeletionStatuses}
                    onCancelElection={async (electionId, organizationId) => {
                      await governanceApi.cancelElection(organizationId, electionId);
                      toast.success(t('electionCancelled'));
                      await refreshPendingDecisions();
                    }}
                  />
                ))}
                {hasMore(pendingDecisions, 'pending') && (
                  <LoadMoreButton
                    remainingCount={Math.max(0, filterPendingDecisionsByDocument(pendingDecisions).length - displayedCounts.pending)}
                    onLoadMore={() => loadMore('pending')}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {electionResultsTarget && (
          <ElectionResults
            organization={electionResultsTarget.organization}
            election={electionResultsTarget.election}
            currentUser={currentUser}
            open={!!electionResultsTarget}
            onOpenChange={(open) => {
              if (!open) setElectionResultsTarget(null);
            }}
            onSuccess={async () => {
              await refreshPendingDecisions();
              debouncedRefreshDecisions();
            }}
          />
        )}

        {electionVotingTarget && (
          <ElectionVotingInterface
            organization={electionVotingTarget.organization}
            election={electionVotingTarget.election}
            currentUser={currentUser}
            open={!!electionVotingTarget}
            onOpenChange={(open) => {
              if (!open) setElectionVotingTarget(null);
            }}
            onSuccess={() => {
              void refreshPendingDecisions();
            }}
          />
        )}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
// Only re-render if props actually change
export const ActivityFeedView = React.memo(ActivityFeedViewComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Check if critical props have changed
  return (
    prevProps.documents === nextProps.documents &&
    prevProps.currentUser?.id === nextProps.currentUser?.id &&
    prevProps.organizations === nextProps.organizations &&
    prevProps.onNavigateToDocument === nextProps.onNavigateToDocument &&
    prevProps.onAddComment === nextProps.onAddComment &&
    prevProps.onWebSocketUpdate === nextProps.onWebSocketUpdate &&
    prevProps.onNavigateToOrganization === nextProps.onNavigateToOrganization &&
    prevProps.onNavigateToHash === nextProps.onNavigateToHash &&
    prevProps.filterOrganizationId === nextProps.filterOrganizationId &&
    prevProps.votingState === nextProps.votingState &&
    prevProps.setVotingState === nextProps.setVotingState
  );
});
