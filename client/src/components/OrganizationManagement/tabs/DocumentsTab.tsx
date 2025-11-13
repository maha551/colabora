import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { FileText, Plus } from 'lucide-react';
import { Organization, User, Document, DocumentProposal } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RuleProposalDialog } from '../../governance/RuleProposalDialog';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  documents: Document[];
  documentProposals: DocumentProposal[];
  policyVotes: any[];
  loading: boolean;
  onCreateDocument?: (organizationId: string) => void;
  onCreateDocumentProposal?: (title: string, description?: string, contributors?: string[], options?: any) => Promise<void>;
  onVoteOnDocumentProposal?: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
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
  onCreateDocument,
  onCreateDocumentProposal,
  onVoteOnDocumentProposal,
  onRefreshDocuments,
  onRefreshDocumentProposals,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);

  const handleCreateDocument = () => {
    if (onCreateDocument) {
      onCreateDocument(organization.id);
    }
  };

  // Combine documents and proposals for hierarchical display
  const allItems = [
    ...documents.map(doc => ({
      type: 'document' as const,
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      owner: doc.owner,
      collaborators: doc.collaborators,
      openProposals: 0, // TODO: Calculate open proposals for this document
      level: 1, // Top level documents
    })),
    ...documentProposals.map(proposal => ({
      type: 'proposal' as const,
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      owner: proposal.user,
      collaborators: proposal.contributors?.map(id => ({ id, name: 'Unknown' })) || [], // TODO: Resolve contributor names
      openProposals: 0, // Proposals don't have sub-proposals
      level: 1, // Top level proposals
      approved: proposal.approved,
      votes: proposal.votes,
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Generate hierarchical numbering
  const generateNumbering = (index: number, level: number): string => {
    return `${index + 1}${level > 1 ? '.1'.repeat(level - 1) : ''}`;
  };

  const handleItemClick = (item: typeof allItems[0]) => {
    if (item.type === 'document') {
      // TODO: Navigate to document editor
      console.log('Navigate to document:', item.id);
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
        {permissions.canCreateDocuments && (
          <div className="relative group">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 hover:bg-gray-50"
              onMouseEnter={() => {/* TODO: Show inline creation form */}}
            >
              <Plus className="h-4 w-4" />
              Suggest Document
            </Button>
            {/* TODO: Add inline creation form that appears on hover */}
          </div>
        )}
      </div>

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
          {loading ? (
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
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Suggest First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {allItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer group ${
                    item.type === 'proposal' && !item.approved
                      ? 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  {/* Numbering */}
                  <div className="flex-shrink-0 w-12 text-sm font-mono text-gray-600 pt-0.5">
                    {generateNumbering(index, item.level)}.
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-medium truncate ${
                        item.type === 'proposal' && !item.approved ? 'text-gray-700' : 'text-gray-900'
                      }`}>
                        {item.title}
                      </h4>
                      {item.type === 'proposal' && !item.approved && (
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                          Pending Approval
                        </Badge>
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
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(item.id, 'PRO');
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
                            handleVote(item.id, 'NEUTRAL');
                          }}
                        >
                          🤔 NEUTRAL
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(item.id, 'CONTRA');
                          }}
                        >
                          👎 CONTRA
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Actions - only show on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.type === 'document' && permissions.canCreateDocuments && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Add sub-document">
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
