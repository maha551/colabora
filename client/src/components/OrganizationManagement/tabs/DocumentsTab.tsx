import React, { useState, Fragment } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { FileText, Plus, X, ThumbsUp, ThumbsDown, Minus, AlertCircle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Organization, User, Document, DocumentProposal } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RuleProposalDialog } from '../../governance/RuleProposalDialog';
import { toast } from 'sonner';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  documents: Document[];
  documentProposals: DocumentProposal[];
  policyVotes: any[];
  loading: boolean;
  error?: string | null;
  onCreateDocumentProposal?: (title: string, description?: string, contributors?: string[], options?: any) => Promise<void>;
  onCreateDocument?: (title: string, description?: string, parentId?: string) => Promise<void>;
  onVoteOnDocumentProposal?: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onSelectDocument?: (document: Document) => void;
  onRefreshDocuments: () => Promise<void>;
  onRefreshDocumentProposals: () => Promise<void>;
  onRefreshPolicyVotes: () => Promise<void>;
}

export function DocumentsTab({
  organization,
  currentUser,
  permissions,
  documents,
  documentProposals,
  policyVotes,
  loading,
  error,
  onCreateDocumentProposal,
  onCreateDocument,
  onVoteOnDocumentProposal,
  onSelectDocument,
  onRefreshDocuments,
  onRefreshDocumentProposals,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);
  const [showInlineCreation, setShowInlineCreation] = useState(false);
  const [inlineCreationPosition, setInlineCreationPosition] = useState<{
    afterItemId?: string;
    beforeItemId?: string;
    parentId?: string;
    level: number;
  } | null>(null);
  const [creationMode, setCreationMode] = useState<'proposal' | 'document'>('document');

  // Form state for inline document creation
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expand/collapse state for document nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Toggle expand/collapse for a node
  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // Set default expanded state for root level documents
  React.useEffect(() => {
    const rootDocs = hierarchyMap.get(null) || [];
    const rootDocIds = rootDocs.map(doc => doc.id);
    setExpandedNodes(new Set(rootDocIds));
  }, [hierarchyMap]); // Re-run when hierarchy changes

  // Hierarchical document structure - memoized for performance
  const { hierarchyMap } = React.useMemo(() => {
    const hierarchyMap = new Map<string | null, Document[]>();
    const documentMap = new Map<string, Document>();

    // Initialize maps
    documents.forEach(doc => {
      documentMap.set(doc.id, doc);
      const parentId = doc.parentId || null;
      if (!hierarchyMap.has(parentId)) {
        hierarchyMap.set(parentId, []);
      }
      hierarchyMap.get(parentId)!.push(doc);
    });

    // Documents are assumed to be returned from the database in correct order
    // If custom ordering is needed in the future, it should be implemented in the database/API layer

    return { hierarchyMap, documentMap };
  }, [documents]);

  // Render hierarchical document tree
  const renderDocumentTree = (parentId: string | null = null, level: number = 1) => {
    const docsAtLevel = hierarchyMap.get(parentId) || [];

    return docsAtLevel.map((doc, index) => {
      const isLast = index === docsAtLevel.length - 1;
      const hasChildren = hierarchyMap.has(doc.id);

      return (
        <div key={doc.id} className="relative">
          {/* Insert button before first item */}
          {index === 0 && level === 1 && (
            <InsertButton
              onClick={() => setInlineCreationPosition({
                level: 1,
                beforeItemId: doc.id,
                parentId: null
              })}
              className="mb-2"
            />
          )}

          {/* Document item */}
          <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-50">
            {/* Expand/collapse button */}
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(doc.id);
                }}
              >
                {expandedNodes.has(doc.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            {/* Spacer for alignment when no children */}
            {!hasChildren && <div className="w-6"></div>}

            <div className="flex-1">
              <button
                onClick={() => onSelectDocument?.(doc)}
                className="text-left hover:text-blue-600 font-medium"
              >
                {doc.title}
              </button>
              <div className="text-sm text-gray-500 ml-4">
                {doc.description && <span>{doc.description}</span>}
                <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                  Level {level}
                </span>
              </div>
            </div>
          </div>

          {/* Insert button between items */}
          {!isLast && (
            <InsertButton
              onClick={() => setInlineCreationPosition({
                level,
                afterItemId: doc.id,
                beforeItemId: docsAtLevel[index + 1].id,
                parentId
              })}
              className="my-1"
            />
          )}

          {/* Children */}
          {hasChildren && expandedNodes.has(doc.id) && (
            <div className="ml-6 border-l border-gray-200 pl-4">
              {renderDocumentTree(doc.id, level + 1)}
            </div>
          )}

          {/* Insert button after last item */}
          {isLast && (
            <InsertButton
              onClick={() => setInlineCreationPosition({
                level: level + 1,
                parentId: level === 1 ? doc.id : parentId,
                afterItemId: doc.id
              })}
              className="mt-1"
            />
          )}
        </div>
      );
    });
  };

  // Get available contributors (all demo users except current user)
  const demoUsers = [
    { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' },
  ];
  const availableContributors = demoUsers.filter(user => user.id !== currentUser.id);

  // Build document items with parentId
  const handleCreateDocumentProposal = async () => {
    if (!proposalTitle.trim()) {
      toast.error('Please enter a document title');
      return;
    }

    setIsSubmitting(true);
    try {
      if (creationMode === 'document' && onCreateDocument) {
        // Create document directly
        await onCreateDocument(
          proposalTitle.trim(),
          proposalDescription.trim() || undefined,
          inlineCreationPosition?.parentId
        );
        // Refresh documents after creation
        await onRefreshDocuments();
        toast.success('Document created successfully!');
      } else if (onCreateDocumentProposal) {
        // Create document proposal
        const allMemberIds = organization.members?.map(member => member.userId) || [];

        // Use the parentId directly from inlineCreationPosition (already set correctly by the buttons)
        const parentId = inlineCreationPosition?.parentId;

        await onCreateDocumentProposal(
          proposalTitle.trim(),
          proposalDescription.trim() || undefined,
          allMemberIds.length > 0 ? allMemberIds : undefined,
          {
            acceptanceThreshold: 75,
            votingAnonymous: false,
            votingAnonymityLocked: false,
            voteChangeAllowed: true,
            structureProposalsEnabled: true,
            parentId: parentId
          }
        );
        // Refresh the data to show the new proposal
        await onRefreshDocumentProposals();
        toast.success('Document proposal created successfully!');
      }

      // Reset form
      setProposalTitle('');
      setProposalDescription('');
      setShowInlineCreation(false);
      setInlineCreationPosition(null);
    } catch (error) {
      console.error(`Failed to create ${creationMode}:`, error);
      toast.error(`Failed to create ${creationMode}. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestDocumentClick = () => {
    setShowInlineCreation(!showInlineCreation);
    setInlineCreationPosition(null);
  };

  // Note: Old insert functions removed - now using TOC-integrated buttons

  const cancelInlineCreation = () => {
    setInlineCreationPosition(null);
    setProposalTitle('');
    setProposalDescription('');
  };

  // Build hierarchical document tree
  interface DocumentItem {
    type: 'document' | 'proposal';
    id: string;
    title: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    owner: { id: string; name: string; email?: string };
    collaborators: any[];
    openProposals: number;
    level: number;
    parentId?: string;
    children?: DocumentItem[];
    approved?: boolean;
    votes?: any[];
    status?: 'proposal' | 'draft' | 'agreed'; // Document status
  }

  // Build document items with parentId
  const documentItems: DocumentItem[] = documents.map(doc => ({
    type: 'document' as const,
    id: doc.id,
    title: doc.title,
    description: doc.description,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    owner: doc.owner,
    collaborators: doc.collaborators,
    openProposals: (doc.proposals || []).filter(p => !p.approved).length,
    level: 1, // Will be recalculated
    parentId: doc.parentId,
    status: doc.status, // Include document status
  }));

  // Add proposals
  const proposalItems: DocumentItem[] = documentProposals.map(proposal => ({
    type: 'proposal' as const,
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    owner: proposal.user,
    collaborators: proposal.contributors?.map(id => ({ id, name: 'Unknown' })) || [],
    openProposals: 0,
    level: 1,
    approved: proposal.approved,
    votes: proposal.votes,
  }));

  // Build tree structure - memoized for performance
  const allItems = React.useMemo(() => {
    const itemMap = new Map<string, DocumentItem>();
    const rootItems: DocumentItem[] = [];
    const allSourceItems = [...documentItems, ...proposalItems];

    // First pass: create map and set initial levels
    allSourceItems.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree
    allSourceItems.forEach(item => {
      const node = itemMap.get(item.id)!;
      if (item.parentId && itemMap.has(item.parentId)) {
        const parent = itemMap.get(item.parentId)!;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        rootItems.push(node);
      }
    });

    // Flatten tree for display (depth-first)
    const flattenTree = (nodes: DocumentItem[], level = 1): DocumentItem[] => {
      const result: DocumentItem[] = [];
      nodes.forEach(node => {
        node.level = level;
        result.push(node);
        if (node.children && node.children.length > 0) {
          result.push(...flattenTree(node.children, level + 1));
        }
      });
      return result;
    };

    return flattenTree(rootItems);
  }, [documentItems, documentProposals]);

  // Filter items based on search term
  const filteredItems = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return allItems;
    }

    const term = searchTerm.toLowerCase();
    const matchingIds = new Set<string>();

    // Find all items that match the search term
    allItems.forEach(item => {
      if (
        item.title.toLowerCase().includes(term) ||
        (item.description && item.description.toLowerCase().includes(term))
      ) {
        matchingIds.add(item.id);

        // Also include all ancestors to show the full path
        let currentItem = item;
        while (currentItem.parentId) {
          matchingIds.add(currentItem.parentId);
          // Find parent item
          const parentItem = allItems.find(i => i.id === currentItem.parentId);
          if (!parentItem) break;
          currentItem = parentItem;
        }
      }
    });

    return allItems.filter(item => matchingIds.has(item.id));
  }, [allItems, searchTerm]);

  // Expand all nodes when searching to show results
  React.useEffect(() => {
    if (searchTerm.trim()) {
      const nodesToExpand = new Set<string>();
      filteredItems.forEach(item => {
        if (hierarchyMap.has(item.id)) {
          nodesToExpand.add(item.id);
        }
      });
      setExpandedNodes(prev => new Set([...prev, ...nodesToExpand]));
    }
  }, [searchTerm, filteredItems, hierarchyMap]);

  // Generate hierarchical numbering based on position in tree
  const generateNumbering = (item: DocumentItem, index: number, allItems: DocumentItem[]): string => {
    if (!item.parentId) {
      // Root level: count how many root items come before this one
      let rootCount = 0;
      for (let i = 0; i <= index; i++) {
        if (!allItems[i].parentId) {
          rootCount++;
        }
      }
      return `${rootCount}.`;
    }

    // Child level: find parent and count siblings at same level before this item
    let parentNumber = '';
    let siblingCount = 1;

    // First pass: find parent number
    for (let i = 0; i < index; i++) {
      if (allItems[i].id === item.parentId) {
        parentNumber = generateNumbering(allItems[i], i, allItems);
        break;
      }
    }

    if (!parentNumber) {
      // Fallback if parent not found
      return `${index + 1}.`;
    }

    // Second pass: count siblings at same level before this item
    for (let i = 0; i < index; i++) {
      if (allItems[i].parentId === item.parentId && allItems[i].level === item.level) {
        siblingCount++;
      }
    }

    return `${parentNumber.replace(/\.$/, '')}.${siblingCount}.`;
  };

  const handleItemClick = (item: typeof allItems[0]) => {
    if (item.type === 'document' && onSelectDocument) {
      // Find the full document object to pass to onSelectDocument
      const document = documents.find(doc => doc.id === item.id);
      if (document) {
        onSelectDocument(document);
      }
    }
  };

  const handleVote = async (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (onVoteOnDocumentProposal) {
      await onVoteOnDocumentProposal(proposalId, vote);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header with title */}
        <div>
          <h3 className="text-lg font-semibold">Organization Document Structure</h3>
          <p className="text-sm text-gray-600">
            Table of contents for {organization.name} documents. Use the + buttons to create documents at specific positions in the hierarchy.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

      {/* Inline Document Creation Form */}
      {showInlineCreation && (permissions.canCreateDocuments || permissions.canCreateDocumentProposals) && (
        <Card className="border-2 border-blue-200 bg-blue-50 animate-in slide-in-from-top-2 duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New Document
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInlineCreation(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              {creationMode === 'proposal' 
                ? 'Propose a new organizational document. The proposal will be voted on by all members before being created.'
                : 'Create a new organizational document. All organization members will be included and governance rules will be applied automatically.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {/* Document Title */}
              <div className="space-y-2">
                <Label htmlFor="proposal-title">Document Title *</Label>
                <Input
                  id="proposal-title"
                  placeholder="Enter proposed document title"
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  className="bg-white"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="proposal-description">Description (Optional)</Label>
                <Textarea
                  id="proposal-description"
                  placeholder="Brief description of what this organizational document will contain"
                  value={proposalDescription}
                  onChange={(e) => setProposalDescription(e.target.value)}
                  rows={3}
                  className="bg-white"
                />
              </div>

              {/* Organization Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">
                  {creationMode === 'proposal' ? 'Document Proposal' : 'Organizational Document'}
                </h4>
                <p className="text-sm text-blue-700 mb-2">
                  {creationMode === 'proposal' 
                    ? 'This proposal will be voted on by all organization members. If approved, it will become an organizational document.'
                    : 'This document will be owned by the entire organization and follow the governance rules established in the Governance tab.'}
                </p>
                <div className="text-xs text-blue-600 space-y-1">
                  <p>• All active organization members will be included as collaborators</p>
                  <p>• Voting settings will use the organization's governance configuration</p>
                  {creationMode === 'proposal' 
                    ? <p>• Proposal requires approval through member voting before document is created</p>
                    : <p>• Document will be created immediately and enter proposal period</p>}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowInlineCreation(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDocumentProposal}
                disabled={isSubmitting || !proposalTitle.trim()}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {creationMode === 'proposal' ? 'Creating Proposal...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {creationMode === 'proposal' ? 'Create Proposal' : 'Create Document'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table of Contents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Table of Contents ({filteredItems.length}{searchTerm ? ` of ${allItems.length}` : ''})
          </CardTitle>
          <CardDescription>
            Hierarchical view of all documents and pending proposals
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 font-medium mb-2">Error loading documents</p>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={() => onRefreshDocuments()}>
                Try Again
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {/* Loading skeletons */}
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2 p-3 rounded">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-12" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Documents Yet</h3>
              <p className="text-gray-600 mb-4">
                {permissions.isRepresentative
                  ? "Start building your organization's knowledge base by suggesting the first document."
                  : "This organization hasn't created any documents yet."
                }
              </p>
              {permissions.canCreateDocuments && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setCreationMode('document');
                    setInlineCreationPosition({
                      level: 1,
                      parentId: null
                    });
                    setProposalTitle('');
                    setProposalDescription('');
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Top-level create button */}
              {permissions.canCreateDocuments && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 border-t border-gray-200"></div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-gray-600 hover:text-blue-600 hover:border-blue-300"
                    onClick={() => {
                      setCreationMode('document');
                      setInlineCreationPosition({
                        level: 1,
                        parentId: null
                      });
                      setProposalTitle('');
                      setProposalDescription('');
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add Root Document
                  </Button>
                  <div className="flex-1 border-t border-gray-200"></div>
                </div>
              )}

              {filteredItems.map((item, index) => {
                const showInsertBefore = inlineCreationPosition?.beforeItemId === item.id;
                const showInsertAfter = inlineCreationPosition?.afterItemId === item.id;
                const nextItem = filteredItems[index + 1];
                const isLastItemAtLevel = !nextItem || nextItem.level <= item.level;

                return (
                  <Fragment key={item.id}>
                    {/* Insert Before Form */}
                    {showInsertBefore && (
                      <div
                        className={`p-4 border-2 border-blue-200 bg-blue-50 rounded-lg animate-in slide-in-from-top-2 duration-300 ${
                          inlineCreationPosition.level === 1 ? '' :
                          inlineCreationPosition.level === 2 ? 'md:ml-8 md:pl-4 ml-4 pl-2' :
                          inlineCreationPosition.level === 3 ? 'md:ml-16 md:pl-4 ml-8 pl-2' :
                          inlineCreationPosition.level >= 4 ? 'md:ml-24 md:pl-4 ml-12 pl-2' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-blue-900">Insert New Document</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelInlineCreation}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor={`inline-title-${item.id}`} className="text-sm">Document Title *</Label>
                            <Input
                              id={`inline-title-${item.id}`}
                              placeholder="Enter document title"
                              value={proposalTitle}
                              onChange={(e) => setProposalTitle(e.target.value)}
                              className="bg-white mt-1"
                              autoFocus
                            />
                          </div>
                          <div>
                            <Label htmlFor={`inline-desc-${item.id}`} className="text-sm">Description (Optional)</Label>
                            <Textarea
                              id={`inline-desc-${item.id}`}
                              placeholder="Brief description"
                              value={proposalDescription}
                              onChange={(e) => setProposalDescription(e.target.value)}
                              rows={2}
                              className="bg-white mt-1"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" size="sm" onClick={cancelInlineCreation} disabled={isSubmitting}>
                              Cancel
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={handleCreateDocumentProposal}
                              disabled={isSubmitting || !proposalTitle.trim()}
                            >
                              {isSubmitting ? 'Creating...' : 'Create'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Document Item */}
                    <div
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group relative ${
                        item.type === 'proposal' && !item.approved
                          ? 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          : item.type === 'document'
                          ? 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                          : 'hover:bg-gray-50'
                      } ${
                        item.level === 1 ? '' :
                        item.level === 2 ? 'md:ml-8 md:pl-4 ml-4 pl-2' :
                        item.level === 3 ? 'md:ml-16 md:pl-4 ml-8 pl-2' :
                        item.level >= 4 ? 'md:ml-24 md:pl-4 ml-12 pl-2' : ''
                      }`}
                      data-level={item.level}
                      onClick={() => {
                        if (item.type === 'document') {
                          handleItemClick(item);
                        }
                      }}
                    >
                  {/* Numbering */}
                  <div className="flex-shrink-0 w-12 md:w-12 w-8 text-xs md:text-sm font-mono text-gray-600 pt-0.5">
                    {generateNumbering(item, index, filteredItems)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-medium truncate ${
                        item.type === 'proposal' && !item.approved 
                          ? 'text-gray-700' 
                          : item.type === 'document'
                          ? 'text-blue-700 group-hover:text-blue-900 underline decoration-dotted underline-offset-2'
                          : 'text-gray-900'
                      }`}>
                        {item.title}
                      </h4>
                      {item.type === 'proposal' && !item.approved && (
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                          Pending Approval
                        </Badge>
                      )}
                      {item.type === 'document' && (
                        <>
                          <Badge 
                            variant="outline" 
                            className={`text-xs border-blue-300 ${
                              item.status === 'agreed' 
                                ? 'text-green-700 bg-green-50 border-green-300' 
                                : item.status === 'proposal'
                                ? 'text-orange-700 bg-orange-50 border-orange-300'
                                : 'text-blue-600'
                            }`}
                          >
                            {item.status === 'agreed' ? 'Agreed' : item.status === 'proposal' ? 'Proposal' : 'Document'}
                          </Badge>
                        </>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-1">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                      {item.updatedAt !== item.createdAt && (
                        <span>Last updated: {new Date(item.updatedAt).toLocaleDateString()}</span>
                      )}
                      <span>By: {item.owner?.name || 'Unknown'}</span>
                      {item.openProposals > 0 && (
                        <span className="text-orange-600">
                          {item.openProposals} open proposal{item.openProposals !== 1 ? 's' : ''}
                        </span>
                          )}
                        </div>

                    {/* Voting interface for proposals */}
                    {item.type === 'proposal' && !item.approved && onVoteOnDocumentProposal && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-600 mr-2">Vote:</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(item.id, 'PRO');
                          }}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          PRO
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(item.id, 'NEUTRAL');
                          }}
                        >
                          <Minus className="h-3 w-3" />
                          NEUTRAL
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(item.id, 'CONTRA');
                          }}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          CONTRA
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Space for alignment - actions now integrated into TOC below */}
                  <div className="w-20"></div>
                  </div>

                  {/* TOC-integrated create buttons */}
                  {permissions.canCreateDocuments && (
                    <div className={`mt-2 flex items-center gap-1 ${
                      item.level === 1 ? '' :
                      item.level === 2 ? 'md:ml-8 md:pl-4 ml-4 pl-2' :
                      item.level === 3 ? 'md:ml-16 md:pl-4 ml-8 pl-2' :
                      item.level >= 4 ? 'md:ml-24 md:pl-4 ml-12 pl-2' : ''
                    }`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCreationMode('document');
                          setInlineCreationPosition({
                            afterItemId: item.id,
                            parentId: item.parentId,
                            level: item.level
                          });
                          setProposalTitle('');
                          setProposalDescription('');
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        Add Sibling
                      </Button>
                      {item.type === 'document' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1 text-gray-500 hover:text-green-600 hover:bg-green-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreationMode('document');
                            setInlineCreationPosition({
                              parentId: item.id,
                              level: item.level + 1
                            });
                            setProposalTitle('');
                            setProposalDescription('');
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Add Child
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Insert After Form */}
                {showInsertAfter && (
                  <div
                    className={`p-4 border-2 border-blue-200 bg-blue-50 rounded-lg animate-in slide-in-from-top-2 duration-300 ${
                      inlineCreationPosition.level === 1 ? '' :
                      inlineCreationPosition.level === 2 ? 'md:ml-8 md:pl-4 ml-4 pl-2' :
                      inlineCreationPosition.level === 3 ? 'md:ml-16 md:pl-4 ml-8 pl-2' :
                      inlineCreationPosition.level >= 4 ? 'md:ml-24 md:pl-4 ml-12 pl-2' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-blue-900">Insert New Document</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelInlineCreation}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor={`inline-title-after-${item.id}`} className="text-sm">Document Title *</Label>
                        <Input
                          id={`inline-title-after-${item.id}`}
                          placeholder="Enter document title"
                          value={proposalTitle}
                          onChange={(e) => setProposalTitle(e.target.value)}
                          className="bg-white mt-1"
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label htmlFor={`inline-desc-after-${item.id}`} className="text-sm">Description (Optional)</Label>
                        <Textarea
                          id={`inline-desc-after-${item.id}`}
                          placeholder="Brief description"
                          value={proposalDescription}
                          onChange={(e) => setProposalDescription(e.target.value)}
                          rows={2}
                          className="bg-white mt-1"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={cancelInlineCreation} disabled={isSubmitting}>
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={handleCreateDocumentProposal}
                          disabled={isSubmitting || !proposalTitle.trim()}
                        >
                          {isSubmitting ? 'Creating...' : 'Create'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
                );
              })}

              {/* Final create button at the end */}
              {permissions.canCreateDocuments && allItems.length > 0 && (
                <div className="flex items-center gap-2 py-2 mt-4">
                  <div className="flex-1 border-t border-gray-200"></div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-gray-600 hover:text-blue-600 hover:border-blue-300"
                    onClick={() => {
                      setCreationMode('document');
                      setInlineCreationPosition({
                        level: 1,
                        parentId: null
                      });
                      setProposalTitle('');
                      setProposalDescription('');
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Root Document
                  </Button>
                  <div className="flex-1 border-t border-gray-200"></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Rule Proposal Dialog */}
      {showRuleProposalDialog && (
        <RuleProposalDialog
          organization={organization}
          currentUser={currentUser}
          open={showRuleProposalDialog}
          onOpenChange={setShowRuleProposalDialog}
          onSuccess={() => {
            setShowRuleProposalDialog(false);
            // Could refresh governance data here if needed
          }}
        />
      )}
    </div>
  );
}
