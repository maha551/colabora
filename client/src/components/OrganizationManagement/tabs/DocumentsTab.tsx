import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Checkbox } from '../../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { FileText, Plus, X } from 'lucide-react';
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
  onCreateDocumentProposal?: (title: string, description?: string, contributors?: string[], options?: any) => Promise<void>;
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
  onCreateDocumentProposal,
  onVoteOnDocumentProposal,
  onSelectDocument,
  onRefreshDocuments,
  onRefreshDocumentProposals,
  onRefreshPolicyVotes,
}: DocumentsTabProps) {
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);
  const [showInlineCreation, setShowInlineCreation] = useState(false);

  // Form state for inline document creation
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [selectedContributors, setSelectedContributors] = useState<string[]>([]);

  // Document options state
  const [acceptanceThreshold, setAcceptanceThreshold] = useState(75);
  const [votingAnonymous, setVotingAnonymous] = useState(false);
  const [votingAnonymityLocked, setVotingAnonymityLocked] = useState(false);
  const [voteChangeAllowed, setVoteChangeAllowed] = useState(true);
  const [structureProposalsEnabled, setStructureProposalsEnabled] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available contributors (all demo users except current user)
  const demoUsers = [
    { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
    { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' },
  ];
  const availableContributors = demoUsers.filter(user => user.id !== currentUser.id);

  const handleCreateDocument = () => {
    if (onCreateDocument) {
      onCreateDocument(organization.id);
    }
  };

  const handleCreateDocumentProposal = async () => {
    if (!proposalTitle.trim()) {
      alert('Please enter a document title');
      return;
    }

    setIsSubmitting(true);
    try {
      if (onCreateDocumentProposal) {
        await onCreateDocumentProposal(
          proposalTitle.trim(),
          proposalDescription.trim() || undefined,
          selectedContributors.length > 0 ? selectedContributors : undefined,
          {
            acceptanceThreshold,
            votingAnonymous,
            votingAnonymityLocked,
            voteChangeAllowed,
            structureProposalsEnabled
          }
        );
      }

      // Reset form
      setProposalTitle('');
      setProposalDescription('');
      setSelectedContributors([]);
      setAcceptanceThreshold(75);
      setVotingAnonymous(false);
      setVotingAnonymityLocked(false);
      setVoteChangeAllowed(true);
      setStructureProposalsEnabled(false);
      setShowInlineCreation(false);

      alert('Document proposal created successfully!');
    } catch (error) {
      console.error('Failed to create document proposal:', error);
      alert('Failed to create document proposal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestDocumentClick = () => {
    setShowInlineCreation(!showInlineCreation);
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
      openProposals: (doc.proposals || []).filter(p => !p.approved).length, // Count unapproved proposals
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
        {permissions.canCreateDocuments && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 hover:bg-gray-50"
              onClick={handleSuggestDocumentClick}
            >
              <Plus className="h-4 w-4" />
              Create Document
            </Button>
          </div>
        )}
      </div>

      {/* Inline Document Creation Form */}
      {showInlineCreation && permissions.canCreateDocuments && (
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
              Create a new document for this organization with custom settings and collaborators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Document Title */}
              <div className="space-y-2 md:col-span-2">
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="proposal-description">Description (Optional)</Label>
                <Textarea
                  id="proposal-description"
                  placeholder="Brief description of the proposed document"
                  value={proposalDescription}
                  onChange={(e) => setProposalDescription(e.target.value)}
                  rows={2}
                  className="bg-white"
                />
              </div>
            </div>

            {/* Document Options */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Settings className="h-4 w-4" />
                <span>Document Options</span>
              </div>

              {/* Acceptance Threshold */}
              <div className="space-y-2">
                <Label>Acceptance Threshold</Label>
                <RadioGroup
                  value={acceptanceThreshold.toString()}
                  onValueChange={(value) => setAcceptanceThreshold(parseInt(value))}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="50" id="threshold-50" />
                    <Label htmlFor="threshold-50" className="font-normal cursor-pointer text-xs">
                      50% - Simple majority
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="75" id="threshold-75" />
                    <Label htmlFor="threshold-75" className="font-normal cursor-pointer text-xs">
                      75% - Strong consensus (default)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="90" id="threshold-90" />
                    <Label htmlFor="threshold-90" className="font-normal cursor-pointer text-xs">
                      90% - Near-unanimous
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Voting Anonymity */}
              <div className="space-y-2">
                <Label>Voting Anonymity</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anonymous-voting"
                    checked={votingAnonymous}
                    onCheckedChange={(checked) => setVotingAnonymous(checked === true)}
                  />
                  <Label htmlFor="anonymous-voting" className="font-normal cursor-pointer text-xs">
                    Anonymous voting (votes are hidden)
                  </Label>
                </div>
              </div>

              {/* Vote Flexibility */}
              <div className="space-y-2">
                <Label>Vote Flexibility</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="flexible-votes"
                    checked={voteChangeAllowed}
                    onCheckedChange={(checked) => setVoteChangeAllowed(checked === true)}
                  />
                  <Label htmlFor="flexible-votes" className="font-normal cursor-pointer text-xs">
                    Allow vote changes after casting
                  </Label>
                </div>
              </div>

              {/* Structure Proposals */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="structure-proposals"
                    checked={structureProposalsEnabled}
                    onCheckedChange={(checked) => setStructureProposalsEnabled(checked === true)}
                  />
                  <Label htmlFor="structure-proposals" className="font-normal cursor-pointer text-xs">
                    Enable structure proposals
                  </Label>
                </div>
              </div>
            </div>

            {/* Contributors */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Add Contributors (Optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSelected = selectedContributors.length === availableContributors.length;
                    if (allSelected) {
                      setSelectedContributors([]);
                    } else {
                      setSelectedContributors(availableContributors.map(user => user.id));
                    }
                  }}
                  className="text-xs h-7"
                >
                  {selectedContributors.length === availableContributors.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-3 bg-white">
                {availableContributors.map((user) => (
                  <div key={user.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`contributor-${user.id}`}
                      checked={selectedContributors.includes(user.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedContributors(prev => [...prev, user.id]);
                        } else {
                          setSelectedContributors(prev => prev.filter(id => id !== user.id));
                        }
                      }}
                    />
                    <Label
                      htmlFor={`contributor-${user.id}`}
                      className="text-sm flex items-center gap-2 cursor-pointer flex-1"
                    >
                      <span className="font-medium">{user.name}</span>
                      <span className="text-muted-foreground">({user.email})</span>
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedContributors.length} of {availableContributors.length} contributors selected
              </p>
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
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create Proposal
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
