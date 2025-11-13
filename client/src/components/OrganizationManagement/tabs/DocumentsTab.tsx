import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { FileText, Plus, Settings, CheckSquare } from 'lucide-react';
import { Organization, User, Document } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RuleProposalDialog } from '../../governance/RuleProposalDialog';

interface DocumentsTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  documents: Document[];
  policyVotes: any[];
  loading: boolean;
  onCreateDocument?: (organizationId: string) => void;
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
  onCreateDocument,
  onRefreshDocuments,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);

  const handleCreateDocument = () => {
    if (onCreateDocument) {
      onCreateDocument(organization.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Document Button (Representatives only) */}
      {permissions.canCreateDocuments && (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Organization Documents</h3>
            <p className="text-sm text-gray-600">
              Documents owned by {organization.name}
            </p>
          </div>
          <Button onClick={handleCreateDocument} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Document
          </Button>
        </div>
      )}

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents ({documents.length})
          </CardTitle>
          <CardDescription>
            {permissions.isRepresentative
              ? "All documents owned by this organization"
              : "Documents owned by this organization that you have access to"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Organization Documents</h3>
              <p className="text-gray-600 mb-4">
                {permissions.isRepresentative
                  ? "This organization doesn't have any documents yet. Create the first one!"
                  : "This organization hasn't created any documents yet."
                }
              </p>
              {permissions.canCreateDocuments && (
                <Button variant="outline" onClick={handleCreateDocument} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div>
                        <h4 className="font-medium">{doc.title}</h4>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {doc.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>Owner: {doc.owner?.name || doc.owner_name}</span>
                          <span>Created: {new Date(doc.createdAt).toLocaleDateString()}</span>
                          {doc.collaborators && doc.collaborators.length > 0 && (
                            <span>{doc.collaborators.length} collaborator{doc.collaborators.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Organizational
                    </Badge>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Member Initiatives Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Member Initiatives
            </span>
            {permissions.canProposeRules && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRuleProposalDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Propose Rule Change
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            Propose changes to governance rules. {permissions.isRepresentative ? 'Your proposals go directly to voting.' : 'Your proposals need representative approval first.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Member-driven governance proposals</p>
            <p className="text-sm">Click "Propose Rule Change" to suggest improvements to organization rules</p>
          </div>
        </CardContent>
      </Card>

      {/* Document Policy Votes Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Document Policy Votes
            </span>
            {permissions.canCreateDocuments && (
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Policy Vote
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            Active votes on implementing policies from organization documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Policy voting system</p>
            <p className="text-sm">Vote on implementing organizational policies and decisions</p>
          </div>
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
