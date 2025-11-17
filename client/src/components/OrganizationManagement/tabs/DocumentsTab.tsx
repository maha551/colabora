import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { FileText, Plus, ChevronRight, ChevronDown, Vote } from 'lucide-react';
import { Organization, User, Document } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { DocumentCreationModal } from '../DocumentCreationModal';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { documentsApi } from '../../../lib/api';
import { toast } from 'sonner';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  documents: Document[];
  policyVotes: any[];
  loading: boolean;
  error?: string | null;
  onCreateDocument?: (title: string, description?: string, parentId?: string) => Promise<void>;
  onSelectDocument?: (document: Document) => void;
  onRefreshDocuments: () => Promise<void>;
  onRefreshPolicyVotes: () => Promise<void>;
}

export function DocumentsTab({
  organization,
  currentUser,
  permissions,
  documents,
  policyVotes,
  loading,
  error,
  onCreateDocument,
  onSelectDocument,
  onRefreshDocuments,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showDocumentCreationModal, setShowDocumentCreationModal] = useState(false);
  const [creationParentId, setCreationParentId] = useState<string | undefined>(undefined);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Handle document creation
  const handleCreateDocumentClick = (parentId?: string) => {
    setCreationParentId(parentId);
    setShowDocumentCreationModal(true);
  };

  const handleDocumentCreationSuccess = async () => {
    await onRefreshDocuments();
  };

  // Handle document-level voting
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

  // Build hierarchical document structure (3 levels max)
  const buildHierarchy = React.useMemo(() => {
    const hierarchyMap = new Map<string | null, Document[]>();

    // Initialize maps
    documents.forEach(doc => {
      const parentId = doc.parentId || null;
      if (!hierarchyMap.has(parentId)) {
        hierarchyMap.set(parentId, []);
      }
      hierarchyMap.get(parentId)!.push(doc);
    });

    return hierarchyMap;
  }, [documents]);

  // Set default expanded state for root level documents
  React.useEffect(() => {
    const rootDocs = buildHierarchy.get(null) || [];
    const rootDocIds = rootDocs.map(doc => doc.id);
    setExpandedNodes(new Set(rootDocIds));
  }, [buildHierarchy]);

  // Toggle expand/collapse
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

  // Render document tree (3 levels max)
  const renderDocumentTree = (parentId: string | null = null, level: number = 1) => {
    if (level > 3) return null; // Max 3 levels

    const docsAtLevel = buildHierarchy.get(parentId) || [];

    return docsAtLevel.map((doc) => {
      const hasChildren = buildHierarchy.has(doc.id) && level < 3;
      const isExpanded = expandedNodes.has(doc.id);

      return (
        <div key={doc.id} className="relative">
          {/* Document item */}
          <div
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group cursor-pointer ${
              doc.status === 'proposal'
                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
            } ${
              level === 1 ? '' :
              level === 2 ? 'ml-6 border-l-2 border-gray-200 pl-4' :
              level === 3 ? 'ml-12 border-l-2 border-gray-200 pl-4' : ''
            }`}
            onClick={() => onSelectDocument?.(doc)}
          >
            {/* Expand/collapse button */}
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-200 flex-shrink-0 mt-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(doc.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            {!hasChildren && <div className="w-6 flex-shrink-0"></div>}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-blue-700 group-hover:text-blue-900 truncate">
                  {doc.title}
                </h4>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    doc.status === 'agreed'
                      ? 'text-green-700 bg-green-50 border-green-300'
                      : doc.status === 'proposal'
                      ? 'text-orange-700 bg-orange-50 border-orange-300'
                      : 'text-blue-600'
                  }`}
                >
                  {doc.status === 'agreed' ? 'Agreed' : doc.status === 'proposal' ? 'Proposal' : 'Draft'}
                </Badge>
                {doc.status === 'proposal' && (
                  <Vote className="h-3 w-3 text-orange-600" />
                )}
              </div>

              {doc.description && (
                <p className="text-sm text-gray-600 mb-2 line-clamp-1">
                  {doc.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>By: {doc.owner?.name || 'Unknown'}</span>
                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
              </div>

              {/* Voting interface for proposals */}
              {doc.status === 'proposal' && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-600 mr-2">Vote:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote(doc.id, 'PRO');
                    }}
                  >
                    👍 PRO
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote(doc.id, 'NEUTRAL');
                    }}
                  >
                    ➖ NEUTRAL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote(doc.id, 'CONTRA');
                    }}
                  >
                    👎 CONTRA
                  </Button>
                </div>
              )}
            </div>

            {/* Add child button for level 1 and 2 (max 3 levels) */}
            {permissions.canCreateDocuments && level < 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateDocumentClick(doc.id);
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Children */}
          {hasChildren && isExpanded && (
            <div className="mt-1">
              {renderDocumentTree(doc.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Organization Documents</h3>
          <p className="text-sm text-gray-600">
            Hierarchical table of contents for {organization.name} documents
          </p>
        </div>

        {/* Add root document button */}
        {permissions.canCreateDocuments && (
          <Button
            onClick={() => handleCreateDocumentClick()}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
        )}
      </div>

      {/* Document Tree */}
      <Card>
        <CardContent className="p-6">
          {error ? (
            <div className="text-center py-8">
              <div className="text-red-500 mb-4">⚠️</div>
              <p className="text-red-600 font-medium mb-2">Error loading documents</p>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={onRefreshDocuments}>
                Try Again
              </Button>
            </div>
          ) : loading ? (
            <LoadingSkeleton type="documents" count={3} />
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Documents Yet</h3>
              <p className="text-gray-600 mb-4">
                {permissions.canCreateDocuments
                  ? "Start building your organization's knowledge base by creating the first document."
                  : "This organization hasn't created any documents yet."
                }
              </p>
              {permissions.canCreateDocuments && (
                <Button
                  onClick={() => handleCreateDocumentClick()}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {renderDocumentTree()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Creation Modal */}
      <DocumentCreationModal
        organization={organization}
        isOpen={showDocumentCreationModal}
        onClose={() => setShowDocumentCreationModal(false)}
        onSuccess={handleDocumentCreationSuccess}
        parentId={creationParentId}
      />
    </div>
  );
}