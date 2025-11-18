import React, { useState, useMemo } from 'react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { FileText, Plus, ThumbsUp, ThumbsDown, Minus, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react';
import { Organization, User, Document, OrganizationGovernanceRules } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { documentsApi } from '../../../lib/api';
import { toast } from 'sonner';
import { DocumentCreationModal } from '../DocumentCreationModal';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  documents: Document[];
  policyVotes: any[];
  loading: boolean;
  error?: string | null;
  onCreateDocument: (title: string, description?: string) => Promise<void>;
  onCreateChildDocument: (title: string, description?: string, parentId: string) => Promise<void>;
  onSelectDocument?: (document: Document) => void;
  onRefreshDocuments: () => Promise<void>;
  onRefreshPolicyVotes: () => Promise<void>;
}

export function DocumentsTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  documents,
  policyVotes,
  loading,
  error,
  onCreateDocument,
  onCreateChildDocument,
  onSelectDocument,
  onRefreshDocuments,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showChildCreateDialog, setShowChildCreateDialog] = useState(false);
  const [childDocParentId, setChildDocParentId] = useState<string>('');
  const [newChildDocTitle, setNewChildDocTitle] = useState('');
  const [newChildDocDescription, setNewChildDocDescription] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());


  const handleVote = async (documentId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      await documentsApi.voteOnDocument(documentId, voteType);
      toast.success(`Vote recorded: ${voteType}`);
      await onRefreshDocuments();
    } catch (error: any) {
      console.error('Failed to cast vote:', error);
      const errorMessage = error.message || 'Failed to cast vote';
      toast.error(errorMessage);
    }
  };

  // Tree building logic
  const documentTree = useMemo(() => {
    const docMap = new Map<string, Document>();
    const childrenMap = new Map<string, Document[]>();

    // Initialize maps
    documents.forEach(doc => {
      docMap.set(doc.id, doc);
      childrenMap.set(doc.id, []);
    });

    // Build tree structure
    const rootDocuments: Document[] = [];
    documents.forEach(doc => {
      if (doc.parentId) {
        // This is a child document
        const parentChildren = childrenMap.get(doc.parentId);
        if (parentChildren) {
          parentChildren.push(doc);
        }
      } else {
        // This is a root document
        rootDocuments.push(doc);
      }
    });

    // Sort children by creation date
    childrenMap.forEach(children => {
      children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });

    return { rootDocuments, childrenMap };
  }, [documents]);

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

  // Recursive tree node component
  const DocumentTreeNode: React.FC<{
    document: Document;
    level: number;
    children: Document[];
    onToggleExpand: (id: string) => void;
    onVote: (id: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
    onSelect: (doc: Document) => void;
    onCreateChild: (parentId: string) => void;
    expandedNodes: Set<string>;
    permissions: OrganizationPermissions;
  }> = ({ document, level, children, onToggleExpand, onVote, onSelect, onCreateChild, expandedNodes, permissions }) => {
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(document.id);
    const indentPadding = level * 24; // 24px per level

    return (
      <>
        <div
          className="border rounded-lg p-4 hover:bg-gray-50 group relative"
          style={{ marginLeft: `${indentPadding}px` }}
        >
          {/* Expand/Collapse indicator */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(document.id);
              }}
              className="absolute left-2 top-4 p-1 rounded hover:bg-gray-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}

          <div className="flex items-center justify-between">
            <div className="flex-1" style={{ marginLeft: hasChildren ? '28px' : '0' }}>
              <h4 className="font-medium">{document.title}</h4>
              {document.description && (
                <p className="text-sm text-gray-600 mt-1">{document.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>By {document.owner?.name}</span>
                <Badge variant={document.status === 'proposal' ? 'secondary' : 'outline'}>
                  {document.status}
                </Badge>
                {hasChildren && (
                  <span className="text-gray-400">
                    {children.length} sub-document{children.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Create child document button */}
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

              {/* Voting actions */}
              {document.status === 'proposal' && (
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
            children={documentTree.childrenMap.get(child.id) || []}
            onToggleExpand={onToggleExpand}
            onVote={onVote}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
            expandedNodes={expandedNodes}
            permissions={permissions}
          />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Documents</h3>
        {permissions.canCreateDocuments && (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Document
          </Button>
        )}
      </div>

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

      {/* Documents Tree */}
      {!loading && !error && documents.length > 0 && (
        <div className="space-y-2">
          {documentTree.rootDocuments.map((doc) => (
            <DocumentTreeNode
              key={doc.id}
              document={doc}
              level={0}
              children={documentTree.childrenMap.get(doc.id) || []}
              onToggleExpand={toggleExpanded}
              onVote={handleVote}
              onSelect={onSelectDocument || (() => {})}
              onCreateChild={openChildCreateDialog}
              expandedNodes={expandedNodes}
              permissions={permissions}
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
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => {
          setShowCreateDialog(false);
          onRefreshDocuments();
        }}
      />
    </div>
  );
}