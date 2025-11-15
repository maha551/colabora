import React, { useState, Fragment } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { FileText, Plus, X, ThumbsUp, ThumbsDown, Minus, AlertCircle } from 'lucide-react';
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

  // Hierarchical document structure
  const buildDocumentHierarchy = (documents: Document[]) => {
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

    // Sort documents by hierarchy level and order
    hierarchyMap.forEach(docs => {
      docs.sort((a, b) => (a as any).sortOrder - (b as any).sortOrder);
    });

    return { hierarchyMap, documentMap };
  };

  const { hierarchyMap } = buildDocumentHierarchy(documents);

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
          {hasChildren && level < 3 && (
            <div className="ml-6 border-l border-gray-200 pl-4">
              {renderDocumentTree(doc.id, level + 1)}
            </div>
          )}

          {/* Insert button after last item */}
          {isLast && level < 3 && (
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

        // Determine the position for the new document
        let positionParentId = inlineCreationPosition?.parentId;
        
        // If inserting after an item, use the same parent as that item
        if (inlineCreationPosition?.afterItemId) {
          const afterItem = allItems.find(item => item.id === inlineCreationPosition.afterItemId);
          if (afterItem) {
            positionParentId = afterItem.parentId;
          }
        }
        
        // If inserting before an item, use the same parent as that item
        if (inlineCreationPosition?.beforeItemId) {
          const beforeItem = allItems.find(item => item.id === inlineCreationPosition.beforeItemId);
          if (beforeItem) {
            positionParentId = beforeItem.parentId;
          }
        }

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
            parentId: positionParentId
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

  const handleInsertAfter = (item: DocumentItem, allItems: DocumentItem[], index: number) => {
    // Determine parent: if item has a parent, use it; otherwise, item is root level
    const parentId = item.parentId || undefined;
    const level = item.level;
    
    setInlineCreationPosition({
      afterItemId: item.id,
      parentId,
      level
    });
    setProposalTitle('');
    setProposalDescription('');
  };

  const handleInsertBefore = (item: DocumentItem, allItems: DocumentItem[], index: number) => {
    // Determine parent: if item has a parent, use it; otherwise, item is root level
    const parentId = item.parentId || undefined;
    const level = item.level;
    
    setInlineCreationPosition({
      beforeItemId: item.id,
      parentId,
      level
    });
    setProposalTitle('');
    setProposalDescription('');
  };

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

  // Build tree structure
  const buildTree = (items: DocumentItem[]): DocumentItem[] => {
    const itemMap = new Map<string, DocumentItem>();
    const rootItems: DocumentItem[] = [];

    // First pass: create map and set initial levels
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree
    items.forEach(item => {
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
  };

  // Combine and build tree
  const allItems = buildTree([...documentItems, ...proposalItems]);

  // Generate hierarchical numbering based on position in tree
  const generateNumbering = (item: DocumentItem, index: number, allItems: DocumentItem[]): string => {
    if (item.level === 1) {
      return `${index + 1}.`;
    }
    
    // Find parent and count siblings at same level
    let parentIndex = -1;
    for (let i = index - 1; i >= 0; i--) {
      if (allItems[i].id === item.parentId) {
        parentIndex = i;
        break;
      }
    }
    
    if (parentIndex >= 0) {
      const parentNumber = generateNumbering(allItems[parentIndex], parentIndex, allItems);
      // Count siblings with same parent at same level
      let siblingCount = 1;
      for (let i = index - 1; i >= 0; i--) {
        if (allItems[i].parentId === item.parentId && allItems[i].level === item.level) {
          siblingCount++;
        } else if (allItems[i].level < item.level) {
          break;
        }
      }
      return `${parentNumber.replace(/\.$/, '')}.${siblingCount}.`;
    }
    
    return `${index + 1}.`;
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
      {/* Header with title and create button */}
        <div className="flex justify-between items-center">
          <div>
          <h3 className="text-lg font-semibold">Organization Document Structure</h3>
            <p className="text-sm text-gray-600">
            Table of contents for {organization.name} documents
            </p>
          </div>
        {(permissions.canCreateDocuments || permissions.canCreateDocumentProposals) && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 hover:bg-gray-50"
              onClick={() => {
                setCreationMode(permissions.canCreateDocuments ? 'document' : 'proposal');
                handleSuggestDocumentClick();
              }}
            >
            <Plus className="h-4 w-4" />
            {permissions.canCreateDocuments ? 'Create Document' : 'Propose Document'}
          </Button>
        </div>
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
            Document Table of Contents ({allItems.length})
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
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading document structure...</p>
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
                  onClick={handleSuggestDocumentClick}
                >
                  <Plus className="h-4 w-4" />
                  Suggest First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {allItems.map((item, index) => {
                const showInsertBefore = inlineCreationPosition?.beforeItemId === item.id;
                const showInsertAfter = inlineCreationPosition?.afterItemId === item.id;
                
                return (
                  <Fragment key={item.id}>
                    {/* Insert Before Form */}
                    {showInsertBefore && (
                      <div 
                        className="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg animate-in slide-in-from-top-2 duration-300"
                        style={{ marginLeft: `${(inlineCreationPosition.level - 1) * 24}px` }}
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
                      }`}
                      style={{ marginLeft: `${(item.level - 1) * 24}px` }}
                      onClick={() => {
                        if (item.type === 'document') {
                          handleItemClick(item);
                        }
                      }}
                    >
                  {/* Numbering */}
                  <div className="flex-shrink-0 w-12 text-sm font-mono text-gray-600 pt-0.5">
                    {generateNumbering(item, index, allItems)}
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

                  {/* Actions - only show on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {permissions.canCreateDocuments && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 hover:bg-blue-100" 
                          title="Insert document before this"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreationMode('document');
                            handleInsertBefore(item, allItems, index);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 hover:bg-blue-100" 
                          title="Insert document after this"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreationMode('document');
                            handleInsertAfter(item, allItems, index);
                          }}
                        >
                          <Plus className="h-3 w-3 rotate-45" />
                        </Button>
                        {item.type === 'document' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 hover:bg-blue-100" 
                            title="Add sub-document"
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
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Insert After Form */}
                {showInsertAfter && (
                  <div 
                    className="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg animate-in slide-in-from-top-2 duration-300"
                    style={{ marginLeft: `${(inlineCreationPosition.level - 1) * 24}px` }}
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
