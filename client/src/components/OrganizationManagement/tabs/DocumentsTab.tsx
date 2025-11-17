import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { FileText, Plus, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { Organization, User, Document } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
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
  onCreateDocument: (title: string, description?: string) => Promise<void>;
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocDescription, setNewDocDescription] = useState('');

  const handleCreateDocument = async () => {
    if (!newDocTitle.trim()) return;

    try {
      await onCreateDocument(newDocTitle.trim(), newDocDescription.trim());
      toast.success('Document created successfully');
      setShowCreateDialog(false);
      setNewDocTitle('');
      setNewDocDescription('');
      await onRefreshDocuments();
    } catch (error) {
      toast.error('Failed to create document');
    }
  };

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

      {/* Documents List */}
      {!loading && !error && documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium">{doc.title}</h4>
                  {doc.description && (
                    <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>By {doc.owner?.name}</span>
                    <Badge variant={doc.status === 'proposal' ? 'secondary' : 'outline'}>
                      {doc.status}
                    </Badge>
                  </div>
                </div>

                {/* Voting Actions */}
                {doc.status === 'proposal' && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVote(doc.id, 'PRO')}
                      className="text-green-600 hover:text-green-700"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVote(doc.id, 'NEUTRAL')}
                      className="text-gray-600"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVote(doc.id, 'CONTRA')}
                      className="text-red-600 hover:text-red-700"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Document Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create New Document</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="Document title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={newDocDescription}
                  onChange={(e) => setNewDocDescription(e.target.value)}
                  placeholder="Document description"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button onClick={handleCreateDocument} disabled={!newDocTitle.trim()}>
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}