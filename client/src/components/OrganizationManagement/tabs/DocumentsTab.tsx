import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { 
  FileText, Plus, ThumbsUp, ThumbsDown, Minus, ChevronRight, ChevronDown, FolderPlus, 
  Search, Filter, ArrowUpDown, ChevronsDown, ChevronsUp, Clock, Users as UsersIcon, Move, CheckCircle2,
  ArrowUp, ArrowDown, FolderTree
} from 'lucide-react';
import { Organization, User, Document, OrganizationGovernanceRules, DocumentTreeProposal } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { documentsApi, documentTreeProposalsApi } from '../../../lib/api';
import { toast } from 'sonner';
import { DocumentCreationModal } from '../DocumentCreationModal';
import { DocumentTreeProposalDialog } from '../DocumentTreeProposalDialog';
import OrganizationalDocumentVoting from '../../OrganizationalDocumentVoting';
import DocumentStatusDisplay from '../../DocumentStatusDisplay';
import { formatDistanceToNow, format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { useIsMobile } from '../../ui/use-mobile';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  documents: Document[];
  loading: boolean;
  error?: string | null;
  onCreateDocument: (title: string, description?: string) => Promise<void>;
  onCreateChildDocument: (title: string, description?: string, parentId: string) => Promise<void>;
  onSelectDocument?: (document: Document) => void;
  onRefreshDocuments: () => Promise<void>;
}

export function DocumentsTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  documents,
  loading,
  error,
  onCreateDocument,
  onCreateChildDocument,
  onSelectDocument,
  onRefreshDocuments,
}: DocumentsTabProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showChildCreateDialog, setShowChildCreateDialog] = useState(false);
  const [childDocParentId, setChildDocParentId] = useState<string>('');
  const [newChildDocTitle, setNewChildDocTitle] = useState('');
  const [newChildDocDescription, setNewChildDocDescription] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [treeProposals, setTreeProposals] = useState<Map<string, DocumentTreeProposal[]>>(new Map());
  const [showTreeProposalDialog, setShowTreeProposalDialog] = useState(false);
  const [selectedDocumentForProposal, setSelectedDocumentForProposal] = useState<Document | null>(null);
  const [positionContext, setPositionContext] = useState<{
    positionType: 'root' | 'child' | 'above_sibling' | 'below_sibling';
    referenceDocumentId?: string;
    referenceDocumentTitle?: string;
  } | null>(null);
  const isMobile = useIsMobile();

  // Auto-expand all nodes by default when documents change
  React.useEffect(() => {
    if (documents.length > 0 && expandedNodes.size === 0) {
      const allIds = new Set<string>();
      documents.forEach(doc => allIds.add(doc.id));
      setExpandedNodes(allIds);
    }
  }, [documents.length]); // Only trigger when document count changes

  // Load tree proposals for all documents
  React.useEffect(() => {
    const loadTreeProposals = async () => {
      const proposalsMap = new Map<string, DocumentTreeProposal[]>();
      for (const doc of documents) {
        try {
          const response = await documentTreeProposalsApi.getProposals(doc.id);
          if (response.proposals && response.proposals.length > 0) {
            proposalsMap.set(doc.id, response.proposals);
          }
        } catch (error) {
          // Silently fail - proposals might not exist yet
          console.debug('No tree proposals for document', doc.id);
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
  const [statusFilters, setStatusFilters] = useState<Set<Document['status']>>(new Set());
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');


  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleVote = async (documentId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      await documentsApi.voteOnDocument(documentId, voteType);
      toast.success(`Vote recorded: ${voteType}`);
      await onRefreshDocuments();
    } catch (error: unknown) {
      console.error('Failed to cast vote:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cast vote';
      toast.error(errorMessage);
    }
  };

  // Toggle status filter
  const toggleStatusFilter = useCallback((status: Document['status']) => {
    setStatusFilters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(status)) {
        newSet.delete(status);
      } else {
        newSet.add(status);
      }
      return newSet;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Filter documents by search query and status
  // Tree-aware filtering: if child matches, include parent; if parent matches, include children
  const filteredDocuments = useMemo(() => {
    let filtered = documents;
    const docMap = new Map<string, Document>();
    documents.forEach(doc => docMap.set(doc.id, doc));

    // Build parent-child map
    const childrenMap = new Map<string, Document[]>();
    documents.forEach(doc => {
      childrenMap.set(doc.id, []);
    });
    documents.forEach(doc => {
      if (doc.parentId) {
        const parentChildren = childrenMap.get(doc.parentId);
        if (parentChildren) {
          parentChildren.push(doc);
        }
      }
    });

    // Helper to check if document or any descendant matches
    const hasMatchingDescendant = (doc: Document, searchQuery: string, statusFilter: Set<string>): boolean => {
      const children = childrenMap.get(doc.id) || [];
      for (const child of children) {
        if (matchesFilters(child, searchQuery, statusFilter) || hasMatchingDescendant(child, searchQuery, statusFilter)) {
          return true;
        }
      }
      return false;
    };

    // Helper to check if document matches filters
    const matchesFilters = (doc: Document, searchQuery: string, statusFilter: Set<string>): boolean => {
      // Check search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesDescription = doc.description?.toLowerCase().includes(query) || false;
        const matchesOwner = doc.owner?.name.toLowerCase().includes(query) || false;
        if (!matchesTitle && !matchesDescription && !matchesOwner) {
          return false;
        }
      }

      // Check status filter
      if (statusFilter.size > 0) {
        const status = doc.status || 'draft';
        if (!statusFilter.has(status)) {
          return false;
        }
      }

      return true;
    };

    // Apply filters with tree awareness
    if (debouncedSearchQuery.trim() || statusFilters.size > 0) {
      const query = debouncedSearchQuery.trim();
      const statusFilter = statusFilters;
      
      filtered = documents.filter(doc => {
        // Document matches filters
        if (matchesFilters(doc, query, statusFilter)) {
          return true;
        }
        
        // Check if any descendant matches (include parent if child matches)
        if (hasMatchingDescendant(doc, query, statusFilter)) {
          return true;
        }
        
        return false;
      });
    }

    return filtered;
  }, [documents, debouncedSearchQuery, statusFilters]);

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

    // Sort function based on sortBy
    // For tree structure, always use sort_order as primary sort (if available), then apply user's sortBy preference
    const sortDocuments = (docs: Document[]): Document[] => {
      return [...docs].sort((a, b) => {
        // Primary sort: use sort_order if available (preserves tree structure from backend)
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
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          case 'created':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'title':
            return a.title.localeCompare(b.title);
          case 'status':
            const aStatus = a.status || 'draft';
            const bStatus = b.status || 'draft';
            return (statusOrder[aStatus] || 99) - (statusOrder[bStatus] || 99);
          case 'deadline':
            const aDeadline = a.proposalDeadline || a.votingDeadline || a.createdAt;
            const bDeadline = b.proposalDeadline || b.votingDeadline || b.createdAt;
            return new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
          case 'active':
            const aActive = (a.documentVotes?.length || 0) + (childrenMap.get(a.id)?.length || 0);
            const bActive = (b.documentVotes?.length || 0) + (childrenMap.get(b.id)?.length || 0);
            return bActive - aActive;
          default:
            // Fallback to created_at if no sort_order and no explicit sortBy
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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

  // Handle child document creation
  const handleCreateChildDocument = async () => {
    if (!newChildDocTitle.trim()) return;

    try {
      await onCreateChildDocument(newChildDocTitle.trim(), newChildDocDescription.trim() || undefined, childDocParentId);
      toast.success('Child document created successfully');
      setShowChildCreateDialog(false);
      setNewChildDocTitle('');
      setNewChildDocDescription('');
      setChildDocParentId('');
      await onRefreshDocuments();
    } catch (error) {
      toast.error('Failed to create child document');
    }
  };

  const openChildCreateDialog = (parentId: string) => {
    setChildDocParentId(parentId);
    setShowChildCreateDialog(true);
  };

  const handleProposeTreeChange = (doc: Document) => {
    setSelectedDocumentForProposal(doc);
    setShowTreeProposalDialog(true);
  };

  const handleVoteTreeProposal = async (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      await documentTreeProposalsApi.voteOnProposal(proposalId, vote);
      toast.success(`Vote recorded: ${vote}`);
      // Reload proposals
      const proposalsMap = new Map<string, DocumentTreeProposal[]>();
      for (const doc of documents) {
        try {
          const response = await documentTreeProposalsApi.getProposals(doc.id);
          if (response.proposals && response.proposals.length > 0) {
            proposalsMap.set(doc.id, response.proposals);
          }
        } catch (error) {
          // Silently fail
        }
      }
      setTreeProposals(proposalsMap);
    } catch (error) {
      console.error('Failed to vote on tree proposal:', error);
      toast.error('Failed to vote on proposal');
    }
  };

  const handleApplyTreeProposal = async (proposalId: string) => {
    try {
      await documentTreeProposalsApi.applyProposal(proposalId);
      toast.success('Proposal applied successfully');
      // Reload proposals and refresh documents
      const proposalsMap = new Map<string, DocumentTreeProposal[]>();
      for (const doc of documents) {
        try {
          const response = await documentTreeProposalsApi.getProposals(doc.id);
          if (response.proposals && response.proposals.length > 0) {
            proposalsMap.set(doc.id, response.proposals);
          }
        } catch (error) {
          // Silently fail
        }
      }
      setTreeProposals(proposalsMap);
      await onRefreshDocuments();
    } catch (error) {
      console.error('Failed to apply tree proposal:', error);
      toast.error('Failed to apply proposal');
    }
  };

  // Handle position-based document creation
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

  // Recursive tree node component
  const DocumentTreeNode: React.FC<{
    document: Document;
    level: number;
    children: Document[];
    childrenMap: Map<string, Document[]>;
    onToggleExpand: (id: string) => void;
    onVote: (id: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
    onSelect: (doc: Document) => void;
    onCreateChild: (parentId: string) => void;
    expandedNodes: Set<string>;
    permissions: OrganizationPermissions;
    documentTree?: { rootDocuments: Document[]; childrenMap: Map<string, Document[]> };
    treeProposals: Map<string, DocumentTreeProposal[]>;
    onProposeTreeChange: (doc: Document) => void;
    onVoteTreeProposal: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
    onApplyTreeProposal: (proposalId: string) => Promise<void>;
  }> = ({ document, level, children, childrenMap, onToggleExpand, onVote, onSelect, onCreateChild, expandedNodes, permissions, documentTree, treeProposals, onProposeTreeChange, onVoteTreeProposal, onApplyTreeProposal }) => {
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(document.id);
    const indentPadding = level * 32; // 32px per level for better visibility

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
    const deadlineText = deadline ? formatDistanceToNow(new Date(deadline), { addSuffix: true }) : null;
    
    // Get vote progress
    const voteCount = document.documentVotes?.length || 0;
    const minVoters = document.minVotersRequired || 0;
    const voteProgress = minVoters > 0 ? `${voteCount}/${minVoters}` : voteCount > 0 ? `${voteCount} votes` : null;

    return (
      <>
        {/* Visual tree connector line for nested documents */}
        {level > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-gray-300"
            style={{ 
              left: `${(level - 1) * 32 + 16}px`,
              height: '100%',
              zIndex: 0
            }}
          />
        )}
        <div
          className="border rounded-lg p-4 hover:bg-gray-50 group relative cursor-pointer transition-colors bg-white"
          style={{ 
            marginLeft: `${indentPadding}px`,
            position: 'relative',
            zIndex: 1
          }}
          onClick={() => onSelect(document)}
        >
          {/* Expand/Collapse indicator - always show for better UX */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(document.id);
            }}
            className="absolute left-2 top-4 p-1 rounded hover:bg-gray-200 transition-colors z-10"
            style={{ opacity: hasChildren ? 1 : 0.3 }}
            title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600" />
            )}
          </button>

          <div className="flex items-center justify-between">
            <div className="flex-1" style={{ marginLeft: '28px' }}>
              {/* Breadcrumb path for nested documents */}
              {breadcrumbPath.length > 0 && (
                <div className="flex items-center gap-1 mb-1 text-xs text-gray-500">
                  {breadcrumbPath.map((parent, idx) => (
                    <React.Fragment key={parent.id}>
                      <span className="truncate max-w-[120px]" title={parent.title}>{parent.title}</span>
                      {idx < breadcrumbPath.length - 1 && <span className="text-gray-400">/</span>}
                    </React.Fragment>
                  ))}
                  <span className="text-gray-400">/</span>
                </div>
              )}
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h4 className="font-medium">{document.title}</h4>
                <DocumentStatusDisplay document={document} compact={true} />
                {level > 0 && (
                  <Badge variant="outline" className="text-xs font-semibold">
                    Level {level + 1}
                  </Badge>
                )}
                {/* Tree proposal indicators */}
                {treeProposals.get(document.id)?.some(p => p.status === 'pending') && (
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                    Pending Proposal
                  </Badge>
                )}
                {treeProposals.get(document.id)?.some(p => p.status === 'approved') && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                    Approved
                  </Badge>
                )}
              </div>
              {document.description && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{document.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                <div className="flex items-center gap-1">
                  <UsersIcon className="h-3 w-3" />
                  <span>{document.owner?.name}</span>
                </div>
                {hasChildren && (
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <Badge variant="secondary" className="text-xs">
                      {children.length} sub-doc{children.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
                {deadline && (document.status === 'proposal' || document.status === 'voting') && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="text-orange-600">{deadlineText}</span>
                  </div>
                )}
                {voteProgress && document.status === 'voting' && (
                  <Badge variant="secondary" className="text-xs">
                    {voteProgress}
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Updated {formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
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
                  title="Propose tree structure change"
                >
                  <Move className="h-4 w-4" />
                </Button>
              )}

              {/* Show voting/apply buttons for pending/approved proposals */}
              {treeProposals.get(document.id)?.map(proposal => {
                if (proposal.status === 'pending') {
                  return (
                    <div key={proposal.id} className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVoteTreeProposal(proposal.id, 'PRO');
                        }}
                        className="text-green-600 hover:text-green-700 text-xs"
                        title="Vote PRO"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVoteTreeProposal(proposal.id, 'CONTRA');
                        }}
                        className="text-red-600 hover:text-red-700 text-xs"
                        title="Vote CONTRA"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                } else if (proposal.status === 'approved') {
                  return (
                    <Button
                      key={proposal.id}
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyTreeProposal(proposal.id);
                      }}
                      className="text-green-600 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Apply approved proposal"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                  );
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
                      title={isMobile ? "Tap to create document relative to this one" : "Click to create document relative to this one (right-click for menu)"}
                    >
                      <Plus className="h-4 w-4" />
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
                        <FolderTree className="h-4 w-4 mr-2" />
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
                      <ArrowUp className="h-4 w-4 mr-2" />
                      Create Above
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateWithPosition('below_sibling', document);
                      }}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <ArrowDown className="h-4 w-4 mr-2" />
                      Create Below
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateWithPosition('child', document);
                      }}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <FolderPlus className="h-4 w-4 mr-2" />
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
                  title="Create child document"
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              )}

              {/* Voting actions - simplified for organizational documents */}
              {document.ownershipType === 'organizational' && document.status === 'voting' && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVote(document.id, 'PRO');
                    }}
                    className="text-green-600 hover:text-green-700"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVote(document.id, 'NEUTRAL');
                    }}
                    className="text-gray-600"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVote(document.id, 'CONTRA');
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Open document button */}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(document);
                }}
                className="bg-black text-white hover:bg-gray-800"
              >
                Open
              </Button>
            </div>
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
            onVote={onVote}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
            expandedNodes={expandedNodes}
            permissions={permissions}
            documentTree={documentTree}
            treeProposals={treeProposals}
            onProposeTreeChange={onProposeTreeChange}
            onVoteTreeProposal={onVoteTreeProposal}
            onApplyTreeProposal={onApplyTreeProposal}
          />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Documents</h3>
        {permissions.canCreateDocuments && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">
              {isMobile ? "Tap + on a document to create relative to it" : "Click + on a document card to create relative to it"}
            </span>
            <Button 
              onClick={() => {
                setPositionContext(null);
                setShowCreateDialog(true);
              }} 
              className="gap-2 min-h-[44px] touch-manipulation"
              title="Create a new document at the root level"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Document</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      {documents.length > 0 && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search documents by title, description, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters and Sorting */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Status:</span>
              <Button
                variant={statusFilters.size === 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilters(new Set())}
              >
                All
              </Button>
              {(['proposal', 'voting', 'agreed', 'rejected', 'expired', 'draft'] as const).map(status => (
                <Button
                  key={status}
                  variant={statusFilters.has(status) ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatusFilter(status);
                  }}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 ml-auto">
              <ArrowUpDown className="h-4 w-4 text-gray-500" />
              <Select value={sortBy} onValueChange={(value: typeof sortBy) => setSortBy(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modified">Recently Modified</SelectItem>
                  <SelectItem value="created">Recently Created</SelectItem>
                  <SelectItem value="title">Title (A-Z)</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="active">Most Active</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Expand/Collapse All */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                title="Expand all"
              >
                <ChevronsDown className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                title="Collapse all"
              >
                <ChevronsUp className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Results count */}
          {filteredDocuments.length !== documents.length && (
            <div className="text-sm text-gray-600">
              Showing {filteredDocuments.length} of {documents.length} documents
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-600 mb-2">Error: {error}</p>
          <Button variant="outline" onClick={onRefreshDocuments}>Retry</Button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 h-16 rounded"></div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && documents.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No documents yet</p>
          {permissions.canCreateDocuments && (
            <Button onClick={() => setShowCreateDialog(true)}>Create First Document</Button>
          )}
        </div>
      )}

      {/* No Results State */}
      {!loading && !error && documents.length > 0 && filteredDocuments.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No documents match your filters</p>
          <p className="text-sm text-gray-500 mb-4">
            Try adjusting your search query or status filters
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery('');
              setStatusFilters(new Set());
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}

      {/* Documents Tree */}
      {!loading && !error && documents.length > 0 && (
        <div className="space-y-6">
          {documentTree.rootDocuments.map((doc) => (
            <DocumentTreeNode
              key={doc.id}
              document={doc}
              level={0}
              children={documentTree.childrenMap.get(doc.id) || []}
              childrenMap={documentTree.childrenMap}
              onToggleExpand={toggleExpanded}
              onVote={handleVote}
            onSelect={onSelectDocument || (() => {})}
            onCreateChild={openChildCreateDialog}
            expandedNodes={expandedNodes}
            permissions={permissions}
            documentTree={documentTree}
            treeProposals={treeProposals}
            onProposeTreeChange={handleProposeTreeChange}
            onVoteTreeProposal={handleVoteTreeProposal}
            onApplyTreeProposal={handleApplyTreeProposal}
          />
        ))}
        </div>
      )}

      {/* Create Child Document Dialog */}
      {showChildCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Child Document</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="child-title">Document Title *</Label>
                <Input
                  id="child-title"
                  value={newChildDocTitle}
                  onChange={(e) => setNewChildDocTitle(e.target.value)}
                  placeholder="Enter child document title"
                />
              </div>
              <div>
                <Label htmlFor="child-description">Description (Optional)</Label>
                <Textarea
                  id="child-description"
                  value={newChildDocDescription}
                  onChange={(e) => setNewChildDocDescription(e.target.value)}
                  placeholder="Brief description of the child document"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button onClick={handleCreateChildDocument} disabled={!newChildDocTitle.trim()}>
                Create Child Document
              </Button>
              <Button variant="outline" onClick={() => setShowChildCreateDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document Creation Modal */}
      <DocumentCreationModal
        organization={organization}
        governanceRules={governanceRules}
        isOpen={showCreateDialog}
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
            // Reload proposals and refresh documents
            const proposalsMap = new Map<string, DocumentTreeProposal[]>();
            for (const doc of documents) {
              try {
                const response = await documentTreeProposalsApi.getProposals(doc.id);
                if (response.proposals && response.proposals.length > 0) {
                  proposalsMap.set(doc.id, response.proposals);
                }
              } catch (error) {
                // Silently fail
              }
            }
            setTreeProposals(proposalsMap);
            await onRefreshDocuments();
          }}
        />
      )}
    </div>
  );
}