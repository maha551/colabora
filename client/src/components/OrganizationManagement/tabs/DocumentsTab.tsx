import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Icon } from '../../ui/Icon';
import { OrganizationAvatar } from '../../shared/OrganizationAvatar';
import { EmptyState } from '../../ui/EmptyState';
import { LoadingState } from '../../ui/LoadingState';
import { Organization, User, Document, OrganizationGovernanceRules, DocumentTreeProposal, DocumentPositionContext } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { documentTreeProposalsApi, documentsApi, exportApi } from '../../../lib/api';
import { toast } from 'sonner';
import { DocumentCreationModal } from '../DocumentCreationModal';
import { DocumentTreeProposalDialog } from '../DocumentTreeProposalDialog';
import DocumentStatusDisplay from '../../DocumentStatusDisplay';
import { DocumentLifecycleStepper } from '../../DocumentLifecycleStepper';
import { DocumentLifecycleCompactRow } from '../../DocumentLifecycleCompactRow';
import { useTimezone } from '../../../hooks/useTimezone';
import { matchesStatusFilter, type DerivedStatusFilter } from '../../../lib/documentLifecycle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { useIsMobile } from '../../../contexts/ScreenSizeContext';
import { logger } from '../../../lib/logger';
import { SPACING, COLORS, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';
import { VoteButtonGroup } from '../../shared/VoteButtonGroup';
import { CompleteVoteButton } from '../../shared/CompleteVoteButton';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  documents: Document[];
  isLoading: boolean;
  error?: string | null;
  /** Which document subset to show (org secondary nav: Documents vs Minutes). */
  viewMode?: 'governance' | 'minutes';
  onCreateDocument: (title: string, description?: string, options?: { parentId?: string; positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling'; referenceDocumentId?: string }) => Promise<void>;
  onSelectDocument?: (document: Document) => void;
  onRefreshDocuments: () => Promise<void>;
}

export function DocumentsTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  documents,
  isLoading,
  error,
  onCreateDocument,
  onSelectDocument,
  onRefreshDocuments,
  viewMode = 'governance',
}: DocumentsTabProps) {
  const { t } = useTranslation('organization');
  const { t: tCommon } = useTranslation('common');
  const { t: tDoc } = useTranslation('documents');
  const { formatDate, formatRelativeTime } = useTimezone();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [treeProposals, setTreeProposals] = useState<Map<string, DocumentTreeProposal[]>>(new Map());
  const [showTreeProposalDialog, setShowTreeProposalDialog] = useState(false);
  const [selectedDocumentForProposal, setSelectedDocumentForProposal] = useState<Document | null>(null);
  const [positionContext, setPositionContext] = useState<DocumentPositionContext | null>(null);
  const [expandedStatusDocumentId, setExpandedStatusDocumentId] = useState<string | null>(null);
  const [startingVotingDocumentId, setStartingVotingDocumentId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const isMobile = useIsMobile();

  const governanceDocuments = useMemo(
    () => documents.filter((doc) => doc.documentKind !== 'meeting_minutes'),
    [documents]
  );
  const meetingMinutesDocuments = useMemo(
    () => documents.filter((doc) => doc.documentKind === 'meeting_minutes'),
    [documents]
  );

  // Progressive disclosure: Collapse all by default for better performance with many documents
  // Users can expand as needed
  React.useEffect(() => {
    // Only auto-expand if there are very few documents (5 or less)
    // For larger document sets, start collapsed for better performance
    if (governanceDocuments.length > 0 && governanceDocuments.length <= 5 && expandedNodes.size === 0) {
      const allIds = new Set<string>();
      governanceDocuments.forEach(doc => allIds.add(doc.id));
      setExpandedNodes(allIds);
    } else if (governanceDocuments.length > 5 && expandedNodes.size === 0) {
      // For larger sets, only expand root documents
      const rootIds = new Set<string>();
      governanceDocuments.forEach(doc => {
        if (!doc.parentId) {
          rootIds.add(doc.id);
        }
      });
      setExpandedNodes(rootIds);
    }
  }, [governanceDocuments, expandedNodes.size]); // Only trigger when governance docs change

  // Load tree proposals for documents only (skip meeting minutes)
  React.useEffect(() => {
    const loadTreeProposals = async () => {
      const docsToLoad = documents.filter(d => d.documentKind !== 'meeting_minutes');
      const proposalsMap = new Map<string, DocumentTreeProposal[]>();
      for (const doc of docsToLoad) {
        try {
          const response = await documentTreeProposalsApi.getProposals(doc.id);
          if (response.proposals && response.proposals.length > 0) {
            proposalsMap.set(doc.id, response.proposals);
          }
        } catch (error) {
          // Silently fail - proposals might not exist yet
          logger.debug('No tree proposals for document', doc.id);
        }
      }
      setTreeProposals(proposalsMap);
    };

    if (documents.length > 0) {
      loadTreeProposals();
    }
  }, [documents]);
  
  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'modified' | 'created' | 'title' | 'status' | 'deadline' | 'active'>('modified');
  const [statusFilterValue, setStatusFilterValue] = useState<'all' | DerivedStatusFilter>('all');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const overviewMode = viewMode;
  const activeDocuments = overviewMode === 'minutes' ? meetingMinutesDocuments : governanceDocuments;

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Filter documents by active overview mode, search query and status.
  // Tree-aware filtering is only used in governance mode.
  const filteredDocuments = useMemo(() => {
    let filtered = [...activeDocuments];

    // Build parent-child map (from full documents for tree awareness)
    const childrenMap = new Map<string, Document[]>();
    activeDocuments.forEach(doc => {
      childrenMap.set(doc.id, []);
    });
    activeDocuments.forEach(doc => {
      if (doc.parentId) {
        const parentChildren = childrenMap.get(doc.parentId);
        if (parentChildren) {
          parentChildren.push(doc);
        }
      }
    });

    // Helper to check if document or any descendant matches
    const hasMatchingDescendant = (doc: Document, searchQuery: string, statusFilter: 'all' | DerivedStatusFilter): boolean => {
      const children = childrenMap.get(doc.id) || [];
      for (const child of children) {
        if (matchesFilters(child, searchQuery, statusFilter) || hasMatchingDescendant(child, searchQuery, statusFilter)) {
          return true;
        }
      }
      return false;
    };

    // Helper to check if document matches filters (status filter applies to all documents including minutes)
    const matchesFilters = (doc: Document, searchQuery: string, statusFilter: 'all' | DerivedStatusFilter): boolean => {
      // Check search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesDescription = doc.description?.toLowerCase().includes(query) || false;
        const matchesOwner = doc.ownershipType === 'organizational'
          ? (doc.organizationId && organization.name.toLowerCase().includes(query))
          : (doc.owner?.name.toLowerCase().includes(query) || false);
        if (!matchesTitle && !matchesDescription && !matchesOwner) {
          return false;
        }
      }

      if (statusFilter !== 'all' && !matchesStatusFilter(doc, statusFilter)) {
        return false;
      }

      return true;
    };

    // In minutes mode, list filtering is flat and chronological.
    if (overviewMode === 'minutes') {
      if (debouncedSearchQuery.trim() || statusFilterValue !== 'all') {
        const query = debouncedSearchQuery.trim();
        filtered = filtered.filter((doc) => matchesFilters(doc, query, statusFilterValue));
      }
      return filtered;
    }

    // Apply search and status with tree awareness for governance docs.
    if (debouncedSearchQuery.trim() || statusFilterValue !== 'all') {
      const query = debouncedSearchQuery.trim();
      const statusFilter = statusFilterValue;
      const filteredIds = new Set(filtered.map(d => d.id));
      filtered = activeDocuments.filter(doc => {
        if (!filteredIds.has(doc.id)) return false;
        if (matchesFilters(doc, query, statusFilter)) return true;
        if (hasMatchingDescendant(doc, query, statusFilter)) return true;
        return false;
      });
    }

    return filtered;
  }, [activeDocuments, debouncedSearchQuery, organization.name, overviewMode, statusFilterValue]);

  const sortedMeetingMinutes = useMemo(() => {
    const dateForMinutes = (doc: Document) => doc.meetingScheduledAt || doc.minutesFinalizedAt || doc.updatedAt;
    return [...filteredDocuments].sort(
      (a, b) => new Date(dateForMinutes(b)).getTime() - new Date(dateForMinutes(a)).getTime()
    );
  }, [filteredDocuments]);

  // Tree building logic with filtering and sorting
  const documentTree = useMemo(() => {
    const docMap = new Map<string, Document>();
    const childrenMap = new Map<string, Document[]>();

    // Initialize maps with filtered documents
    filteredDocuments.forEach(doc => {
      docMap.set(doc.id, doc);
      childrenMap.set(doc.id, []);
    });

    // Build tree structure
    const rootDocuments: Document[] = [];
    filteredDocuments.forEach(doc => {
      if (doc.parentId && docMap.has(doc.parentId)) {
        // This is a child document and parent exists in filtered set
        const parentChildren = childrenMap.get(doc.parentId);
        if (parentChildren) {
          parentChildren.push(doc);
        }
      } else if (!doc.parentId) {
        // This is a root document
        rootDocuments.push(doc);
      }
    });

    // Status order for sorting
    const statusOrder: Record<string, number> = {
      'proposal': 1,
      'voting': 2,
      'agreed': 3,
      'rejected': 4,
      'expired': 5,
      'draft': 6
    };

    // Sort function based on sortBy. For minutes, use meetingScheduledAt/minutesFinalizedAt for date sorts.
    const sortDocuments = (docs: Document[]): Document[] => {
      const dateForModified = (doc: Document) =>
        doc.documentKind === 'meeting_minutes'
          ? (doc.minutesFinalizedAt || doc.meetingScheduledAt || doc.updatedAt)
          : doc.updatedAt;
      const dateForCreated = (doc: Document) =>
        doc.documentKind === 'meeting_minutes'
          ? (doc.meetingScheduledAt || doc.createdAt)
          : doc.createdAt;

      return [...docs].sort((a, b) => {
        // Primary sort: use sort_order if available (preserves tree structure from backend; minutes typically have none)
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          const sortOrderDiff = a.sortOrder - b.sortOrder;
          if (sortOrderDiff !== 0) {
            return sortOrderDiff;
          }
        } else if (a.sortOrder !== undefined) {
          return -1; // a has sort_order, b doesn't - a comes first
        } else if (b.sortOrder !== undefined) {
          return 1; // b has sort_order, a doesn't - b comes first
        }

        // Secondary sort: apply user's sortBy preference
        switch (sortBy) {
          case 'modified':
            return new Date(dateForModified(b)).getTime() - new Date(dateForModified(a)).getTime();
          case 'created':
            return new Date(dateForCreated(b)).getTime() - new Date(dateForCreated(a)).getTime();
          case 'title':
            return a.title.localeCompare(b.title);
          case 'status': {
            const aStatus = a.status || 'draft';
            const bStatus = b.status || 'draft';
            return (statusOrder[aStatus] || 99) - (statusOrder[bStatus] || 99);
          }
          case 'deadline': {
            const aDeadline = a.proposalDeadline || a.votingDeadline || a.createdAt || dateForCreated(a);
            const bDeadline = b.proposalDeadline || b.votingDeadline || b.createdAt || dateForCreated(b);
            return new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
          }
          case 'active': {
            const aActive = (a.documentVotes?.length || 0) + (childrenMap.get(a.id)?.length || 0);
            const bActive = (b.documentVotes?.length || 0) + (childrenMap.get(b.id)?.length || 0);
            return bActive - aActive;
          }
          default:
            return new Date(dateForCreated(a)).getTime() - new Date(dateForCreated(b)).getTime();
        }
      });
    };

    // Sort root documents
    const sortedRoots = sortDocuments(rootDocuments);

    // Sort children recursively
    const sortChildren = (parentId: string) => {
      const children = childrenMap.get(parentId) || [];
      const sorted = sortDocuments(children);
      childrenMap.set(parentId, sorted);
      sorted.forEach(child => sortChildren(child.id));
    };

    sortedRoots.forEach(root => sortChildren(root.id));

    return { rootDocuments: sortedRoots, childrenMap };
  }, [filteredDocuments, sortBy]);

  // Expand/Collapse all - defined after documentTree
  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (docs: Document[], childrenMap: Map<string, Document[]>) => {
      docs.forEach(doc => {
        allIds.add(doc.id);
        const children = childrenMap.get(doc.id) || [];
        if (children.length > 0) {
          collectIds(children, childrenMap);
        }
      });
    };
    // Use current documentTree state
    collectIds(documentTree.rootDocuments, documentTree.childrenMap);
    setExpandedNodes(allIds);
  }, [documentTree]);

  // Toggle expand/collapse
  const toggleExpanded = (documentId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const openChildCreateDialog = (parentId: string) => {
    setPositionContext({
      positionType: 'child',
      referenceDocumentId: parentId,
      referenceDocumentTitle: documents.find(d => d.id === parentId)?.title ?? tDoc('parentDocument'),
    });
    setShowCreateDialog(true);
  };

  const handleProposeTreeChange = (doc: Document) => {
    setSelectedDocumentForProposal(doc);
    setShowTreeProposalDialog(true);
  };

  const handleVoteTreeProposal = async (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      await documentTreeProposalsApi.voteOnProposal(proposalId, vote);
      toast.success(t('voteRecorded'));
      await refreshTreeProposals();
    } catch (error) {
      logger.error('Failed to vote on tree proposal:', error);
      toast.error(error instanceof Error ? error.message : t('failedToVote'));
    }
  };

  const handleCompleteTreeProposal = async (proposalId: string) => {
    try {
      await documentTreeProposalsApi.completeTreeProposal(proposalId);
      toast.success(t('voteCompleted'));
      await refreshTreeProposals();
      await onRefreshDocuments();
    } catch (error) {
      logger.error('Failed to complete tree proposal vote:', error);
      toast.error(error instanceof Error ? error.message : t('failedToCompleteVote'));
    }
  };

  const handleStartDocumentVoting = async (documentId: string) => {
    setStartingVotingDocumentId(documentId);
    try {
      await documentsApi.startVoting(documentId);
      toast.success(t('voteApprovedAndOpened', { defaultValue: 'Voting started. Document is now in voting phase.' }));
      await onRefreshDocuments();
    } catch (error) {
      logger.error('Start document voting failed', { documentId, error });
      const msg = error instanceof Error ? error.message : t('failedToCastVote');
      toast.error(msg);
    } finally {
      setStartingVotingDocumentId(null);
    }
  };

  const refreshTreeProposals = async () => {
    const proposalsMap = new Map<string, DocumentTreeProposal[]>();
    const docsToLoad = documents.filter(d => d.documentKind !== 'meeting_minutes');
    for (const doc of docsToLoad) {
      try {
        const response = await documentTreeProposalsApi.getProposals(doc.id);
        if (response.proposals && response.proposals.length > 0) {
          proposalsMap.set(doc.id, response.proposals);
        }
      } catch {
        // Silently fail
      }
    }
    setTreeProposals(proposalsMap);
  };

  // Handle position-based document creation
  const handleToggleStatusExpand = useCallback((documentId: string) => {
    setExpandedStatusDocumentId((prev) => (prev === documentId ? null : documentId));
  }, []);

  const handleExportMinutes = useCallback(async (documentId: string, format: 'pdf' | 'markdown' | 'docx', title?: string) => {
    try {
      const blob = await exportApi.exportDocument(documentId, format);
      const url = URL.createObjectURL(blob);
      const ext = format === 'pdf' ? 'pdf' : format === 'markdown' ? 'md' : 'docx';
      const safeName = (title || 'minutes').replace(/[^a-z0-9.-]/gi, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error('Export minutes failed', e);
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  }, []);

  const selectDocumentOrOpenMinutes = useCallback(
    (doc: Document) => {
      onSelectDocument?.(doc);
    },
    [onSelectDocument]
  );

  const handleCreateWithPosition = (
    positionType: 'root' | 'child' | 'above_sibling' | 'below_sibling',
    referenceDocument?: Document
  ) => {
    setPositionContext({
      positionType,
      referenceDocumentId: referenceDocument?.id,
      referenceDocumentTitle: referenceDocument?.title,
    });
    setShowCreateDialog(true);
  };

  // Memoized recursive tree node component for better performance
  const DocumentTreeNode: React.FC<{
    document: Document;
    level: number;
    children: Document[];
    childrenMap: Map<string, Document[]>;
    onToggleExpand: (id: string) => void;
    onSelect: (doc: Document) => void;
    onCreateChild: (parentId: string) => void;
    expandedNodes: Set<string>;
    permissions: OrganizationPermissions;
    documentTree?: { rootDocuments: Document[]; childrenMap: Map<string, Document[]> };
    treeProposals: Map<string, DocumentTreeProposal[]>;
    onProposeTreeChange: (doc: Document) => void;
    onVoteTreeProposal: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
    onCompleteTreeProposal: (proposalId: string) => Promise<void>;
    expandedStatusDocumentId: string | null;
    onToggleStatusExpand: (documentId: string) => void;
    statusExpandLabel: string;
    onStartDocumentVoting?: (documentId: string) => void;
    startingVotingDocumentId?: string | null;
  }> = ({ document, level, children, childrenMap, onToggleExpand, onSelect, onCreateChild, expandedNodes, permissions, documentTree, treeProposals, onProposeTreeChange, onVoteTreeProposal, onCompleteTreeProposal, expandedStatusDocumentId, onToggleStatusExpand, statusExpandLabel, onStartDocumentVoting, startingVotingDocumentId }) => {
    const operationLabel = (operationType?: string) => {
      if (operationType === 'MOVE') return tDoc('treeOperationMove', { defaultValue: 'Move' });
      if (operationType === 'DELETE') return tDoc('treeOperationDelete', { defaultValue: 'Delete' });
      if (operationType === 'REORDER') return tDoc('treeOperationReorder', { defaultValue: 'Reorder' });
      return tDoc('treeOperationChange', { defaultValue: 'Change' });
    };

    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(document.id);
    const levelIndent = isMobile ? 16 : 32;
    const indentPadding = level * levelIndent;
    const isMinutes = (document as Document & { documentKind?: string }).documentKind === 'meeting_minutes';
    const docMinutes = document as Document & { meetingId?: string; meetingScheduledAt?: string; minutesFinalizedAt?: string | null };

    // Meeting minutes variant: same card + status row as other docs, minutes-specific content
    if (isMinutes) {
      return (
        <>
          <div
            className={cn(
              'border hover:shadow-md group relative cursor-pointer transition-all duration-200 bg-card mb-2 min-w-0 max-w-full overflow-hidden shadow-sm border-border',
              SPACING.card.padding,
              RADIUS.panel
            )}
            style={{ marginLeft: `${indentPadding}px`, position: 'relative', zIndex: 1 }}
            onClick={() => onSelect(document)}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
              <div className="flex-1 min-w-0 overflow-hidden w-full sm:w-auto" style={{ marginLeft: '28px' }}>
                <h3 className="text-base font-semibold text-foreground truncate min-w-0" title={document.title}>
                  {document.title}
                </h3>
                <div className="mt-1 flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap min-w-0">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {tDoc('typeFilterMeetingMinutes', { defaultValue: 'Meeting minutes' })}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <OrganizationAvatar organization={organization} size="xs" />
                    <span className="font-medium">{organization.name}</span>
                  </div>
                  {docMinutes.meetingScheduledAt && (
                    <div className={cn('flex items-center gap-1 px-1.5 py-0.5 border border-border/60 bg-muted/30', RADIUS.inline)}>
                      <Icon name="Calendar" className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-xs">{formatDate(docMinutes.meetingScheduledAt)}</span>
                    </div>
                  )}
                  {docMinutes.minutesFinalizedAt && (
                    <div className={cn('flex items-center gap-1 px-1.5 py-0.5 border border-border/60 bg-muted/30', RADIUS.inline)}>
                      <Icon name="CheckCircle2" className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-xs">
                        {tDoc('minutesFinalized', { defaultValue: 'Finalized' })} {formatDate(docMinutes.minutesFinalizedAt)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Icon name="Clock" className="h-3 w-3" />
                    <span className="text-xs">{formatRelativeTime(document.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <div className={cn('flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end', isMobile && 'self-end w-full sm:w-auto')}>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(document);
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm min-w-[80px] flex-shrink-0"
                >
                  {tCommon('cardActions.open')}
                </Button>
              </div>
            </div>
            {/* Status row - same as other documents */}
            <div
              className={cn('mt-2 pt-2 border-t border-border/60 bg-muted/10 rounded-b', SPACING.tight.gap)}
              style={{ marginLeft: '28px' }}
              role="region"
              aria-label={tDoc('statusRowLabel', { defaultValue: 'Document status' })}
              onClick={(e) => e.stopPropagation()}
            >
              {expandedStatusDocumentId === document.id ? (
                <>
                  <div className={cn('border border-border/60 bg-card/50 p-2 min-w-0 overflow-x-auto', RADIUS.inline)}>
                    <DocumentLifecycleStepper document={document} compact={false} embedInCard={false} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onToggleStatusExpand(document.id); }}
                    className="h-8 min-w-[44px] touch-manipulation text-xs"
                    aria-expanded={true}
                    aria-label={tDoc('hideStatusDetailsAria', { defaultValue: 'Hide status details' })}
                  >
                    <Icon name="ChevronUp" className="h-3.5 w-3.5 mr-1" aria-hidden />
                    {tDoc('hideStatusDetails', { defaultValue: 'Hide' })}
                  </Button>
                </>
                ) : (
                  <div className={cn('flex gap-2 min-w-0', isMobile ? 'flex-col items-stretch' : 'items-center justify-between')}>
                    <DocumentLifecycleCompactRow document={document} className="min-w-0" hideDateOnNarrow={isMobile} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onToggleStatusExpand(document.id); }}
                      className={cn('h-8 min-w-[44px] touch-manipulation text-xs flex-shrink-0', isMobile && 'self-end')}
                      aria-expanded={false}
                      aria-label={statusExpandLabel}
                    >
                      <Icon name="ChevronDown" className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {statusExpandLabel}
                    </Button>
                  </div>
                )}
            </div>
          </div>
        </>
      );
    }

    // Build breadcrumb path for nested documents
    const buildBreadcrumbPath = (): Document[] => {
      if (level === 0 || !document.parentId || !documentTree) return [];
      
      const path: Document[] = [];
      const findDocument = (docs: Document[], map: Map<string, Document[]>, targetId: string): Document | null => {
        for (const doc of docs) {
          if (doc.id === targetId) return doc;
          const children = map.get(doc.id) || [];
          const found = findDocument(children, map, targetId);
          if (found) return found;
        }
        return null;
      };
      
      let currentParentId: string | undefined = document.parentId;
      const visited = new Set<string>();
      
      while (currentParentId && !visited.has(currentParentId)) {
        visited.add(currentParentId);
        const parent = findDocument(documentTree.rootDocuments, documentTree.childrenMap, currentParentId);
        if (parent) {
          path.unshift(parent);
          currentParentId = parent.parentId;
        } else {
          break;
        }
      }
      
      return path;
    };
    
    const breadcrumbPath = buildBreadcrumbPath();

    // Get deadline info
    const deadline = document.proposalDeadline || document.votingDeadline;
    const deadlineText = deadline ? formatRelativeTime(deadline) : null;
    
    // Get vote progress
    const voteCount = document.documentVotes?.length || 0;
    const minVoters = document.minVotersRequired || 0;
    const voteProgress = minVoters > 0 ? `${voteCount}/${minVoters}` : voteCount > 0 ? `${voteCount} votes` : null;

    // Color coding by depth level
    const depthColors = [
      '', // Level 0 - no special color
      'border-l-4 border-l-blue-500 bg-blue-50/30', // Level 1 - blue
      'border-l-4 border-l-green-500 bg-green-50/30', // Level 2 - green
      'border-l-4 border-l-purple-500 bg-purple-50/30', // Level 3 - purple
      'border-l-4 border-l-orange-500 bg-orange-50/30', // Level 4 - orange
    ];
    const depthColor = depthColors[Math.min(level, depthColors.length - 1)] || 'border-l-4 border-l-border bg-muted/30';

    return (
      <>
        {/* Enhanced Visual tree connector lines for nested documents */}
        {level > 0 && (
          <>
            {/* Vertical line - more visible */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-border"
              style={{ 
                left: `${(level - 1) * levelIndent + (isMobile ? 10 : 20)}px`,
                width: '2px',
                height: '100%',
                zIndex: 0
              }}
            />
            {/* Horizontal connector - more visible */}
            <div
              className="absolute left-0 top-4 bg-border"
              style={{ 
                left: `${(level - 1) * levelIndent + (isMobile ? 10 : 20)}px`,
                width: '12px',
                height: '2px',
                zIndex: 0
              }}
            />
          </>
        )}
        <div
          className={cn(
            'border hover:shadow-md group relative cursor-pointer transition-all duration-200 bg-card mb-2 min-w-0 max-w-full overflow-hidden',
            SPACING.card.padding,
            RADIUS.panel,
            level === 0 ? 'shadow-sm border-border' : `shadow border-border ${depthColor}`
          )}
          style={{ 
            marginLeft: `${indentPadding}px`,
            position: 'relative',
            zIndex: 1
          }}
          onClick={() => onSelect(document)}
        >
          {/* Enhanced Expand/Collapse indicator */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(document.id);
            }}
            className={cn(RADIUS.control, "absolute left-2 top-3 p-1 hover:bg-muted transition-all z-10", 
              hasChildren ? 'opacity-100' : 'opacity-30 cursor-default'
            )}
            title={hasChildren ? (isExpanded ? tCommon('tree.collapse') : tCommon('tree.expand')) : tCommon('tree.noChildren')}
            disabled={!hasChildren}
          >
            {isExpanded ? (
              <Icon name="ChevronDown" className="h-4 w-4 text-foreground" />
            ) : (
              <Icon name="ChevronRight" className="h-4 w-4 text-foreground" />
            )}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden w-full sm:w-auto" style={{ marginLeft: '28px' }}>
              <h3 className="text-base font-semibold text-foreground truncate min-w-0" title={document.title}>
                {document.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap min-w-0">
                {/* Enhanced Breadcrumb path for nested documents */}
                {breadcrumbPath.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium min-w-0 overflow-hidden">
                    {breadcrumbPath.map((parent, idx) => (
                      <React.Fragment key={parent.id}>
                        <span className="truncate max-w-[80px] sm:max-w-[100px] hover:text-foreground transition-colors" title={parent.title}>
                          {parent.title}
                        </span>
                        {idx < breadcrumbPath.length - 1 && <span className="text-muted-foreground/70 mx-0.5">/</span>}
                      </React.Fragment>
                    ))}
                    <span className="text-muted-foreground/70 mx-0.5">/</span>
                  </div>
                )}
                {/* Tree proposal indicators */}
                {treeProposals.get(document.id)?.some(p => p.status === 'pending') && (
                  <Badge variant="outline" className={cn('text-xs', COLORS.statusBadge.warning)}>
                    {tDoc('treeProposalPending', { defaultValue: 'Pending proposal' })}
                  </Badge>
                )}
                {treeProposals.get(document.id)?.some(p => p.status === 'approved') && (
                  <Badge variant="outline" className={cn('text-xs', COLORS.statusBadge.success)}>
                    {tDoc('treeProposalApproved', { defaultValue: 'Approved' })}
                  </Badge>
                )}
                {treeProposals.get(document.id)?.slice(0, 1).map(proposal => (
                  <Badge key={`${proposal.id}-op`} variant="secondary" className="text-xs">
                    {operationLabel((proposal as DocumentTreeProposal & { operation_type?: string }).operationType ?? (proposal as DocumentTreeProposal & { operation_type?: string }).operation_type)}
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  {document.owner?.type === 'organization' ? (
                    <>
                      <OrganizationAvatar organization={organization} size="xs" />
                      <span className="font-medium truncate max-w-[8rem] sm:max-w-none">{organization.name}</span>
                    </>
                  ) : (
                    <>
                      <Icon name="Users" className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium truncate max-w-[8rem] sm:max-w-none">{document.owner?.name}</span>
                    </>
                  )}
                </div>
                {hasChildren && (
                  <div className="flex items-center gap-1">
                    <Icon name="FileText" className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" className="text-xs font-medium">
                      {children.length}
                    </Badge>
                  </div>
                )}
                {deadline && (document.status === 'proposal' || document.status === 'voting') && (
                  <div className={cn('flex items-center gap-1 px-1.5 py-0.5 border', RADIUS.inline, COLORS.statusBg.active, COLORS.status.active, 'border-[var(--status-proposed-border)]')}>
                    <Icon name="Clock" className="h-3 w-3" />
                    <span className="font-medium text-xs">{deadlineText}</span>
                  </div>
                )}
                {voteProgress && document.status === 'voting' && (
                  <Badge variant="secondary" className={cn('text-xs font-medium', COLORS.statusBadge.info)}>
                    {voteProgress}
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Icon name="Clock" className="h-3 w-3" />
                  <span className="text-xs">{formatRelativeTime(document.updatedAt)}</span>
                </div>
                {document.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                    {document.description}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div
              className={cn(
                isMobile ? 'flex w-full items-center gap-2' : 'flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end'
              )}
            >
              {isMobile ? (
                <>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(document);
                    }}
                    className="min-h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  >
                    {tCommon('cardActions.open')}
                  </Button>
                  {(permissions.canCreateDocuments ||
                    (document.ownershipType === 'organizational' &&
                      document.status === 'proposal' &&
                      permissions.canStartDocumentVoting &&
                      onStartDocumentVoting) ||
                    (document.ownershipType === 'organizational' && document.status === 'voting')) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => e.stopPropagation()}
                          className="min-h-11 min-w-11 shrink-0 px-0 touch-manipulation"
                          aria-label={tCommon('buttons.more', { defaultValue: 'More actions' })}
                        >
                          <Icon name="MoreHorizontal" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {document.ownershipType === 'organizational' &&
                          document.status === 'proposal' &&
                          permissions.canStartDocumentVoting &&
                          onStartDocumentVoting && (
                          <DropdownMenuItem
                            disabled={startingVotingDocumentId === document.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartDocumentVoting(document.id);
                            }}
                            className="min-h-[44px] touch-manipulation"
                          >
                            <Icon name="Vote" className="h-4 w-4 mr-2" />
                            {startingVotingDocumentId === document.id
                              ? t('startingVoting', { defaultValue: 'Starting…' })
                              : t('startVoting', { defaultValue: 'Start voting' })}
                          </DropdownMenuItem>
                        )}
                        {document.ownershipType === 'organizational' && document.status === 'voting' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(document);
                            }}
                            className="min-h-[44px] touch-manipulation"
                          >
                            <Icon name="Vote" className="h-4 w-4 mr-2" />
                            Vote
                          </DropdownMenuItem>
                        )}
                        {permissions.canCreateDocuments && document.parentId && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateWithPosition('root', document);
                            }}
                            className="min-h-[44px] touch-manipulation"
                          >
                            <Icon name="FolderTree" className="h-4 w-4 mr-2" />
                            Create at Root
                          </DropdownMenuItem>
                        )}
                        {permissions.canCreateDocuments && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateWithPosition('above_sibling', document);
                              }}
                              className="min-h-[44px] touch-manipulation"
                            >
                              <Icon name="ArrowUp" className="h-4 w-4 mr-2" />
                              Create Above
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateWithPosition('below_sibling', document);
                              }}
                              className="min-h-[44px] touch-manipulation"
                            >
                              <Icon name="ArrowDown" className="h-4 w-4 mr-2" />
                              Create Below
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateWithPosition('child', document);
                              }}
                              className="min-h-[44px] touch-manipulation"
                            >
                              <Icon name="FolderPlus" className="h-4 w-4 mr-2" />
                              Create Child
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              ) : (
              <>
              {/* Propose tree structure change button */}
              {permissions.canCreateDocuments && document.ownershipType === 'organizational' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProposeTreeChange(document);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title={tDoc('proposeTreeStructureChange')}
                >
                  <Icon name="Move" className="h-4 w-4" />
                </Button>
              )}

              {/* Show voting/complete vote buttons for pending proposals, apply for approved */}
              {treeProposals.get(document.id)?.map(proposal => {
                if (proposal.status === 'pending') {
                  const userVote = proposal.votes?.find(v => v.userId === currentUser?.id)?.vote ?? null;
                  const quorumMet = proposal.quorumMet ?? false;
                  const canComplete = permissions.isRepresentative && quorumMet;
                  return (
                    <div key={proposal.id} className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <VoteButtonGroup
                        variant="compact"
                        value={userVote}
                        onVote={(vote) => onVoteTreeProposal(proposal.id, vote)}
                        voteLocked={false}
                      />
                      {canComplete && (
                        <CompleteVoteButton
                          quorumMet={quorumMet}
                          onComplete={() => onCompleteTreeProposal(proposal.id)}
                          confirmDescription={tDoc('structure.treeCloseVoteConfirm')}
                        />
                      )}
                    </div>
                  );
                } else if (proposal.status === 'approved') {
                  return permissions.isRepresentative ? (
                    <div key={proposal.id} className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <CompleteVoteButton
                        quorumMet={true}
                        onComplete={() => onCompleteTreeProposal(proposal.id)}
                        label={tCommon('buttons.apply')}
                        confirmDescription={tDoc('structure.treeApplyConfirm')}
                      />
                    </div>
                  ) : null;
                }
                return null;
              })}

              {/* Context menu for creating documents at different positions */}
              {permissions.canCreateDocuments && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-100 sm:opacity-70 sm:hover:opacity-100 transition-opacity min-w-[44px] min-h-[44px] touch-manipulation"
                      title={isMobile ? tDoc('tapToCreateRelative') : tDoc('clickToCreateRelative')}
                    >
                      <Icon name="Plus" className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {document.parentId && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateWithPosition('root', document);
                        }}
                        className="min-h-[44px] touch-manipulation"
                      >
                        <Icon name="FolderTree" className="h-4 w-4 mr-2" />
                        Create at Root
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateWithPosition('above_sibling', document);
                      }}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <Icon name="ArrowUp" className="h-4 w-4 mr-2" />
                      Create Above
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateWithPosition('below_sibling', document);
                      }}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <Icon name="ArrowDown" className="h-4 w-4 mr-2" />
                      Create Below
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateWithPosition('child', document);
                      }}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <Icon name="FolderPlus" className="h-4 w-4 mr-2" />
                      Create Child
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Create child document button (legacy - keeping for backward compatibility) */}
              {permissions.canCreateDocuments && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChild(document.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title={tDoc('createChildDocument')}
                >
                  <Icon name="FolderPlus" className="h-4 w-4" />
                </Button>
              )}

              {/* Start voting - move document from proposal to voting (manual transition) */}
              {document.ownershipType === 'organizational' && document.status === 'proposal' && permissions.canStartDocumentVoting && onStartDocumentVoting && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={startingVotingDocumentId === document.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartDocumentVoting(document.id);
                  }}
                  className="border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  title={t('startVotingDocument', { defaultValue: 'Start voting period now (do not wait for proposal deadline)' })}
                >
                  {startingVotingDocumentId === document.id ? (
                    <>
                      <span className={cn("animate-spin inline-block h-3 w-3 border-2 border-current border-t-transparent mr-1", RADIUS.pill)} aria-hidden />
                      {t('startingVoting', { defaultValue: 'Starting…' })}
                    </>
                  ) : (
                    <>
                      <Icon name="Vote" className="h-3 w-3 mr-1" />
                      {t('startVoting', { defaultValue: 'Start voting' })}
                    </>
                  )}
                </Button>
              )}

              {/* Open to Vote - navigates to document where full voting UI with canVote check is shown */}
              {document.ownershipType === 'organizational' && document.status === 'voting' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(document);
                  }}
                  className={`${COLORS.status.success} hover:opacity-90 border-[var(--status-approved-border)]`}
                  title={tDoc('openDocumentToVote')}
                >
                  <Icon name="Vote" className="h-3 w-3 mr-1" />
                  Vote
                </Button>
              )}

              {/* Open document button */}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(document);
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm min-w-[80px] flex-shrink-0"
              >
                {tCommon('cardActions.open')}
              </Button>
              </>
              )}
            </div>
          </div>

          {/* Status row - dedicated row for lifecycle/status, expandable */}
          <div
            className={cn('mt-2 pt-2 border-t border-border/60 bg-muted/10 rounded-b', SPACING.tight.gap)}
            style={{ marginLeft: '28px' }}
            role="region"
            aria-label={tDoc('statusRowLabel', { defaultValue: 'Document status' })}
            onClick={(e) => e.stopPropagation()}
          >
            {expandedStatusDocumentId === document.id ? (
              <>
                {document.ownershipType === 'organizational' ? (
                  <div className={cn('border border-border/60 bg-card/50 p-2 min-w-0 overflow-x-auto', RADIUS.inline)}>
                    <DocumentLifecycleStepper document={document} compact={false} embedInCard={false} />
                  </div>
                ) : (
                  <div className={cn('border border-border/60 bg-card/50 p-2', RADIUS.inline)}>
                    <DocumentStatusDisplay document={document} compact={false} />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onToggleStatusExpand(document.id); }}
                  className="h-8 min-w-[44px] touch-manipulation text-xs"
                  aria-expanded={true}
                  aria-label={tDoc('hideStatusDetailsAria', { defaultValue: 'Hide status details' })}
                >
                  <Icon name="ChevronUp" className="h-3.5 w-3.5 mr-1" aria-hidden />
                  {tDoc('hideStatusDetails', { defaultValue: 'Hide' })}
                </Button>
              </>
            ) : (
              <>
                {document.ownershipType === 'organizational' ? (
                  <DocumentLifecycleCompactRow
                    document={document}
                    onExpandClick={() => onToggleStatusExpand(document.id)}
                    expandLabel={statusExpandLabel}
                    isExpanded={false}
                    hideDateOnNarrow={isMobile}
                  />
                ) : (
                  <div className={cn('flex gap-2 min-w-0', isMobile ? 'flex-col items-stretch' : 'items-center justify-between')}>
                    <DocumentStatusDisplay document={document} compact={true} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onToggleStatusExpand(document.id); }}
                      className={cn('h-8 min-w-[44px] touch-manipulation text-xs flex-shrink-0', isMobile && 'self-end')}
                      aria-expanded={false}
                      aria-label={statusExpandLabel}
                    >
                      <Icon name="ChevronDown" className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {statusExpandLabel}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Render children if expanded */}
        {isExpanded && children.map(child => (
          <DocumentTreeNode
            key={child.id}
            document={child}
            level={level + 1}
            children={childrenMap.get(child.id) || []}
            childrenMap={childrenMap}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
            expandedNodes={expandedNodes}
            permissions={permissions}
            documentTree={documentTree}
            treeProposals={treeProposals}
            onProposeTreeChange={onProposeTreeChange}
            onVoteTreeProposal={onVoteTreeProposal}
            onCompleteTreeProposal={onCompleteTreeProposal}
            expandedStatusDocumentId={expandedStatusDocumentId}
            onToggleStatusExpand={onToggleStatusExpand}
            statusExpandLabel={statusExpandLabel}
            onStartDocumentVoting={onStartDocumentVoting}
            startingVotingDocumentId={startingVotingDocumentId}
          />
        ))}
      </>
    );
  };

  const activeFilterCount = (statusFilterValue !== 'all' ? 1 : 0) + (debouncedSearchQuery.trim() ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const statusExpandLabel = isMobile
    ? tDoc('showFullStatusShort', { defaultValue: 'Details' })
    : tDoc('showFullStatus', { defaultValue: 'Show full status' });

  const sortOptionLabel = (value: typeof sortBy, short = false) => {
    const labels: Record<typeof sortBy, { full: string; short: string }> = {
      modified: { full: 'sortModified', short: 'sortModifiedShort' },
      created: { full: 'sortCreated', short: 'sortCreatedShort' },
      title: { full: 'sortTitle', short: 'sortTitleShort' },
      status: { full: 'sortStatus', short: 'sortStatusShort' },
      deadline: { full: 'sortDeadline', short: 'sortDeadlineShort' },
      active: { full: 'sortActive', short: 'sortActiveShort' },
    };
    const key = short ? labels[value].short : labels[value].full;
    return tDoc(key);
  };

  return (
    <TabPanelBody className="min-w-0 overflow-x-hidden">
      <TabPanelHeader
        title={isMobile ? undefined : (overviewMode === 'minutes' ? t('minutes') : t('documents'))}
        subtitle={
          documents.length > 0
            ? (() => {
                const activeTotal = overviewMode === 'minutes' ? meetingMinutesDocuments.length : governanceDocuments.length;
                return overviewMode === 'minutes'
                  ? (filteredDocuments.length === activeTotal
                      ? tDoc('minutesCount', { count: activeTotal, defaultValue: '{{count}} meeting minute(s)' })
                      : tDoc('minutesCountShowing', { count: filteredDocuments.length, total: activeTotal, defaultValue: 'Showing {{count}} of {{total}} meeting minutes' }))
                  : (filteredDocuments.length === activeTotal
                      ? tDoc('documentsCount', { count: activeTotal, defaultValue: '{{count}} document(s)' })
                      : tDoc('documentsCountShowing', { count: filteredDocuments.length, total: activeTotal, defaultValue: 'Showing {{count}} of {{total}} documents' }));
              })()
            : undefined
        }
        actions={
          permissions.canCreateDocuments && documents.length > 0 && overviewMode === 'governance' ? (
            <div className={cn('flex items-center', SPACING.toolbar.gap)}>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {isMobile ? "Tap + on a document to create relative to it" : "Click + on a document card to create relative to it"}
              </span>
              <Button
                onClick={() => {
                  setPositionContext(null);
                  setShowCreateDialog(true);
                }}
                className="gap-2 min-h-[44px] touch-manipulation bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                title={tDoc('createAtRoot')}
              >
                <Icon name="Plus" className="h-4 w-4" />
                <span className="hidden sm:inline">{tDoc('newDocument')}</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Inline document creation form (same pattern as personal documents) */}
      {showCreateDialog && permissions.canCreateDocuments && (
        <DocumentCreationModal
          variant="inline"
          organization={organization}
          governanceRules={governanceRules}
          onCreateDocument={onCreateDocument}
          onClose={() => {
            setShowCreateDialog(false);
            setPositionContext(null);
          }}
          onSuccess={() => {
            setShowCreateDialog(false);
            setPositionContext(null);
            onRefreshDocuments();
          }}
          positionContext={positionContext}
        />
      )}

      {/* Search and Filters */}
      {documents.length > 0 && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Icon name="Search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/70 h-4 w-4" />
            <Input
              placeholder={
                isMobile
                  ? tDoc('dashboard.placeholderSearchShort', { defaultValue: 'Search documents…' })
                  : tDoc('dashboard.placeholderSearch')
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-11"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <Icon name="X" className="h-4 w-4" />
              </button>
            )}
          </div>

          {isMobile && (
            <div className="flex items-center gap-2 min-w-0">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 gap-2"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
              >
                <Icon name="Filter" className="h-4 w-4" aria-hidden />
                {tDoc('mobileFilters', { defaultValue: 'Filters' })}
                {hasActiveFilters && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              {overviewMode === 'governance' && (
              <Select value={sortBy} onValueChange={(value: typeof sortBy) => setSortBy(value)}>
                <SelectTrigger className="min-h-11 min-w-0 flex-1">
                  <SelectValue>{sortOptionLabel(sortBy, true)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['modified', 'created', 'title', 'status', 'deadline', 'active'] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {sortOptionLabel(value, false)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
            </div>
          )}

          {/* Filters and Sorting - Grouped in Card */}
          {(!isMobile || mobileFiltersOpen) && (
          <div className={cn('bg-card border border-border shadow-sm min-w-0', RADIUS.panel, isMobile ? 'p-3' : 'p-4')}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 min-w-0">
              {!isMobile && (
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <Icon name="Filter" className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {overviewMode === 'minutes'
                    ? tDoc('typeFilterMeetingMinutes', { defaultValue: 'Meeting minutes' })
                    : tDoc('typeFilterDocuments', { defaultValue: 'Documents' })}
                </span>
              </div>
              )}
              {/* Status filter dropdown */}
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground shrink-0">{tDoc('statusFilterLabel', { defaultValue: 'Status' })}:</span>
                <Select value={statusFilterValue} onValueChange={(v) => setStatusFilterValue(v as 'all' | DerivedStatusFilter)}>
                  <SelectTrigger className={cn('min-h-11 min-w-0 w-full md:w-[200px]')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tDoc('statusFilterAll', { defaultValue: 'All' })}</SelectItem>
                    {(['proposal', 'voting', 'agreed', 'rejected', 'expired', 'draft'] as const).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                    <SelectItem value="amendments_open">{tDoc('statusFilterAmendmentsOpen', { defaultValue: 'Amendments open' })}</SelectItem>
                    <SelectItem value="amendments_closed">{tDoc('statusFilterAmendmentsClosed', { defaultValue: 'Amendments closed' })}</SelectItem>
                    <SelectItem value="amendment_adoption_pending">{tDoc('statusFilterAdoptionPending', { defaultValue: 'Adoption vote pending' })}</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilterValue('all');
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground ml-2"
                  >
                    <Icon name="X" className="h-3 w-3 mr-1" />
                    {tDoc('clearFilters', { defaultValue: 'Clear filters' })}
                  </Button>
                )}
              </div>

              {/* Sort Dropdown and Tree Controls (governance mode only) */}
              {overviewMode === 'governance' && !isMobile && (
                <div className="flex items-center gap-3 md:border-l md:border-border md:pl-4 min-w-0 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-none">
                  <Icon name="ArrowUpDown" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select value={sortBy} onValueChange={(value: typeof sortBy) => setSortBy(value)}>
                    <SelectTrigger className={cn('min-h-11 min-w-0 w-full flex-1 md:w-[180px]')}>
                      <SelectValue placeholder={tDoc('sortBy')}>{sortOptionLabel(sortBy, false)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(['modified', 'created', 'title', 'status', 'deadline', 'active'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {sortOptionLabel(value, false)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Expand/Collapse All */}
                <div className="flex items-center gap-1 md:border-l md:border-border md:pl-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={expandAll}
                    title={tDoc('expandAll')}
                    className="min-h-11"
                  >
                    <Icon name="ChevronsDown" className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={collapseAll}
                    title={tDoc('collapseAll')}
                    className="min-h-11"
                  >
                    <Icon name="ChevronsUp" className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              )}

              {overviewMode === 'governance' && isMobile && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={expandAll}
                    title={tDoc('expandAll')}
                    className="min-h-11 flex-1"
                  >
                    <Icon name="ChevronsDown" className="h-4 w-4 mr-1" />
                    {tDoc('expandAll')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={collapseAll}
                    title={tDoc('collapseAll')}
                    className="min-h-11 flex-1"
                  >
                    <Icon name="ChevronsUp" className="h-4 w-4 mr-1" />
                    {tDoc('collapseAll')}
                  </Button>
                </div>
              )}
            </div>

            {/* Active Filters Badge */}
            {hasActiveFilters && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{tDoc('activeFilters')}</span>
                  {debouncedSearchQuery.trim() && (
                    <Badge variant="secondary" className="text-xs">
                      Search: "{debouncedSearchQuery}"
                    </Badge>
                  )}
                  {statusFilterValue !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      {statusFilterValue === 'amendments_open'
                        ? tDoc('statusFilterAmendmentsOpen', { defaultValue: 'Amendments open' })
                        : statusFilterValue === 'amendments_closed'
                          ? tDoc('statusFilterAmendmentsClosed', { defaultValue: 'Amendments closed' })
                          : statusFilterValue === 'amendment_adoption_pending'
                            ? tDoc('statusFilterAdoptionPending', { defaultValue: 'Adoption vote pending' })
                            : statusFilterValue.charAt(0).toUpperCase() + statusFilterValue.slice(1)}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <p className={`${COLORS.status.error} mb-2`}>Error: {error}</p>
          <Button variant="outline" onClick={onRefreshDocuments}>Retry</Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <LoadingState isLoading={true} mode="skeleton" skeletonVariant="list" skeletonCount={5} className="space-y-4">
          <div />
        </LoadingState>
      )}

      {/* Empty State */}
      {!isLoading && !error && documents.length === 0 && (
        <EmptyState
          icon={<Icon name="FileText" className="h-16 w-16" />}
          title={tDoc('dashboard.noDocumentsYet')}
          description={tDoc('dashboard.noDocumentsYetDescription')}
          action={
            permissions.canCreateDocuments ? (
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] px-6 text-base gap-2"
                size="lg"
              >
                <Icon name="Plus" className="h-5 w-5" />
                {tDoc('dashboard.createFirstDocument')}
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground max-w-md mx-auto">
                <p>You don't have permission to create documents in this organization.</p>
                <p className="mt-2">Contact an organization representative or administrator for access.</p>
              </div>
            )
          }
        />
      )}

      {/* No Results State */}
      {!isLoading && !error && documents.length > 0 && filteredDocuments.length === 0 && (
        <EmptyState
          icon={<Icon name="Search" className="h-16 w-16" />}
          title={overviewMode === 'minutes' ? tDoc('noMeetingMinutes', { defaultValue: 'No meeting minutes' }) : tDoc('dashboard.noDocumentsFound')}
          description={overviewMode === 'minutes' ? tDoc('noMeetingMinutesMatchFilters', { defaultValue: 'No meeting minutes match your filters.' }) : tDoc('dashboard.noDocumentsFoundDescription')}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setStatusFilterValue('all');
              }}
              className="border-border"
            >
              <Icon name="X" className="h-4 w-4 mr-2" />
              {tDoc('clearAllFilters', { defaultValue: 'Clear All Filters' })}
            </Button>
          }
        />
      )}

      {/* Mode-aware results */}
      {!isLoading && !error && documents.length > 0 && (
        <div className="space-y-2 relative min-w-0">
          {overviewMode === 'governance'
            ? documentTree.rootDocuments.map((doc) => (
                <DocumentTreeNode
                  key={doc.id}
                  document={doc}
                  level={0}
                  children={documentTree.childrenMap.get(doc.id) || []}
                  childrenMap={documentTree.childrenMap}
                  onToggleExpand={toggleExpanded}
                  onSelect={selectDocumentOrOpenMinutes}
                  onCreateChild={openChildCreateDialog}
                  expandedNodes={expandedNodes}
                  permissions={permissions}
                  documentTree={documentTree}
                  treeProposals={treeProposals}
                  onProposeTreeChange={handleProposeTreeChange}
                  onVoteTreeProposal={handleVoteTreeProposal}
                  onCompleteTreeProposal={handleCompleteTreeProposal}
                  expandedStatusDocumentId={expandedStatusDocumentId}
                  onToggleStatusExpand={handleToggleStatusExpand}
                  statusExpandLabel={statusExpandLabel}
                  onStartDocumentVoting={handleStartDocumentVoting}
                  startingVotingDocumentId={startingVotingDocumentId}
                />
              ))
            : sortedMeetingMinutes.map((doc) => (
                <DocumentTreeNode
                  key={doc.id}
                  document={doc}
                  level={0}
                  children={[]}
                  childrenMap={new Map<string, Document[]>()}
                  onToggleExpand={toggleExpanded}
                  onSelect={selectDocumentOrOpenMinutes}
                  onCreateChild={openChildCreateDialog}
                  expandedNodes={expandedNodes}
                  permissions={permissions}
                  treeProposals={treeProposals}
                  onProposeTreeChange={handleProposeTreeChange}
                  onVoteTreeProposal={handleVoteTreeProposal}
                  onCompleteTreeProposal={handleCompleteTreeProposal}
                  expandedStatusDocumentId={expandedStatusDocumentId}
                  onToggleStatusExpand={handleToggleStatusExpand}
                  statusExpandLabel={statusExpandLabel}
                  onStartDocumentVoting={handleStartDocumentVoting}
                  startingVotingDocumentId={startingVotingDocumentId}
                />
              ))}
        </div>
      )}

      {/* Tree Proposal Dialog */}
      {selectedDocumentForProposal && (
        <DocumentTreeProposalDialog
          document={selectedDocumentForProposal}
          documents={documents}
          isOpen={showTreeProposalDialog}
          onClose={() => {
            setShowTreeProposalDialog(false);
            setSelectedDocumentForProposal(null);
          }}
          onSuccess={async () => {
            await refreshTreeProposals();
            await onRefreshDocuments();
          }}
        />
      )}
    </TabPanelBody>
  );
}