import React, { useState } from 'react';
import { User, Proposal } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { DiffViewer } from './DiffViewer';
import { SuggestionCard } from './SuggestionCard';
import { Icon } from './ui/Icon';
import { RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface InlineExpandedViewProps {
  proposal: Proposal;
  currentUser: User;
  totalUsers: number;
  onVote: (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onClose: () => void;
}

export function InlineExpandedView({
  proposal,
  currentUser,
  totalUsers,
  onVote,
  onClose,
}: InlineExpandedViewProps) {
  const [showFullContext, setShowFullContext] = useState(false);

  // Stable id for paragraph/list when proposal is document- or organization-scoped (paragraphId may be '')
  const paragraphOrContextId = proposal.paragraphId || (proposal as { contextId?: string }).contextId || proposal.id;
  const documentId = (proposal as { documentId?: string }).documentId ?? ((proposal as { contextType?: string }).contextType === 'document' ? (proposal as { contextId?: string }).contextId : undefined) ?? '';

  // Mock data for the inline view
  const mockDocument = {
    id: documentId,
    title: (proposal as { documentTitle?: string }).documentTitle,
    ownerId: '',
    createdAt: '',
    updatedAt: '',
    owner: { id: '', name: 'Unknown', email: '' },
    collaborators: [],
    paragraphs: [{
      id: paragraphOrContextId,
      documentId,
      title: proposal.paragraphTitle || undefined,
      text: proposal.currentText || '',
      order: 0,
      createdAt: '',
      updatedAt: '',
      proposals: [],
      history: [],
      suggestions: []
    }]
  };

  const mockParagraph = {
    id: paragraphOrContextId,
    documentId,
    title: proposal.paragraphTitle || undefined,
    text: proposal.currentText || '',
    order: 0,
    createdAt: '',
    updatedAt: '',
    proposals: [],
    history: [],
    suggestions: []
  };

  const mockSuggestion = {
    id: proposal.id,
    paragraphId: proposal.paragraphId || paragraphOrContextId,
    userId: proposal.user.id,
    text: proposal.proposedText,
    type: proposal.type,
    headingLevel: proposal.headingLevel,
    approved: false,
    createdAt: proposal.createdAt,
    updatedAt: proposal.createdAt,
    user: proposal.user,
    votes: [], // Simplified
    comments: []
  };

  return (
    <div className="p-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <h4 className="font-medium">Full Context Review</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFullContext(!showFullContext)}
            className="text-xs"
          >
            {showFullContext ? 'Show Focused' : 'Show More Context'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <Icon name="X" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
        {/* Left Column - Document Context */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <h5 className="font-medium text-sm">Document Context</h5>
            {showFullContext && (
              <Badge variant="secondary" className="text-xs">
                Full View
              </Badge>
            )}
          </div>

          <div className={cn("flex-1 border p-3 bg-muted overflow-y-auto", RADIUS.panel)}>
            {showFullContext ? (
              <div className="space-y-3">
                <div className="text-center text-sm text-muted-foreground mb-2">
                  Additional context paragraphs would load here
                </div>
                <div className="p-3 bg-card rounded border">
                  <p className="text-sm text-muted-foreground mb-2">Current Content</p>
                  <div className="whitespace-pre-wrap text-sm">
                    {proposal.currentText || 'No current content'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-card rounded border">
                  <p className="text-sm text-muted-foreground mb-2">Current Content</p>
                  <div className="whitespace-pre-wrap text-sm">
                    {proposal.currentText || 'No current content'}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <DiffViewer
                    originalText={proposal.currentText}
                    suggestion1Text={proposal.proposedText}
                    suggestion1Author={proposal.user.name}
                    suggestion1UserId={proposal.user.id}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Discussion & Voting */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <h5 className="font-medium text-sm">Discussion & Voting</h5>
          </div>

          <div className={cn("flex-1 border overflow-hidden", RADIUS.panel)}>
            <div className="h-full overflow-y-auto">
              <div className="p-3">
                <SuggestionCard
                  suggestion={mockSuggestion}
                  totalUsers={totalUsers}
                  currentUser={currentUser}
                  allCollaborators={[]} // Simplified
                  onVote={(suggestionId, voteType) => {
                    onVote(proposal.id, documentId, proposal.paragraphId || paragraphOrContextId, voteType);
                    onClose(); // Close after voting
                  }}
                  onComment={(suggestionId, text, parentId) => {
                    // Comments not supported in inline view
                  }}
                  originalText={proposal.currentText}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
