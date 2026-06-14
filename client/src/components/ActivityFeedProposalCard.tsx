import React, { useState, useMemo } from 'react';
import { SuggestionCard } from './SuggestionCard';
import { HistoryDisplay } from './HistoryDisplay';
import { Badge } from './ui/badge';
import { Icon } from './ui/Icon';
import { Suggestion, User, VersionHistory, Organization, DocumentOptions } from '../types';
import { DocumentContext, getComparisonTarget } from '../utils/proposalAdapter';

interface ActivityFeedProposalCardProps {
  proposal: Suggestion;
  documentContext: DocumentContext;
  currentUser: User;
  totalUsers: number;
  allCollaborators: User[];
  originalText: string;
  history?: VersionHistory[];
  tabType: 'accepted' | 'debated' | 'pending';
  organization?: Organization | null;
  ranking?: {
    index: number;
    score: number;
    isControversial?: boolean;
  };
  otherProposals?: Suggestion[]; // Other proposals for comparison
  agreedVersion?: { // Agreed version if available
    text: string;
    previousText?: string;
    proposalId?: string;
    acceptedAt?: string;
    type?: 'BODY' | 'TITLE';
  };
  onVote: (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => void;
  onDeleteProposal?: (proposalId: string) => Promise<void>;
  onNavigateToDocument: (documentId: string) => void;
  documentOptions?: DocumentOptions; // Document options for vote progress bar calculations
}

export function ActivityFeedProposalCard({
  proposal,
  documentContext,
  currentUser,
  totalUsers,
  allCollaborators,
  originalText,
  history = [],
  tabType,
  organization,
  ranking,
  otherProposals = [],
  agreedVersion,
  onVote,
  onComment,
  onDeleteProposal,
  onNavigateToDocument,
  documentOptions,
}: ActivityFeedProposalCardProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Determine comparison target based on priority: agreed version > highest-voted other > original
  const comparisonTarget = useMemo(() => {
    // For "accepted" tab, always use previousText (already provided as originalText)
    if (tabType === 'accepted') {
      return { text: originalText, label: 'Previous Version', source: 'original' as const };
    }

    // For "pending" and "debated" tabs, use comparison logic
    return getComparisonTarget(
      proposal,
      agreedVersion,
      otherProposals,
      originalText
    );
  }, [proposal, agreedVersion, otherProposals, originalText, tabType]);

  // Get the text to use as originalText for diff comparison
  const diffOriginalText = useMemo(() => {
    return comparisonTarget?.text || originalText;
  }, [comparisonTarget, originalText]);

  const getTabBadge = () => {
    switch (tabType) {
      case 'accepted':
        // Don't show badge for accepted - the "Accepted (X%)" badge next to proposer name is sufficient
        return null;
      case 'debated':
        return (
          <Badge className="bg-purple-600 text-white text-xs px-2 py-0.5 font-medium">
            Hot Discussion
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5 font-medium animate-pulse inline-flex items-center gap-1">
            <Icon name="AlertTriangle" className="h-3 w-3" />
            Vote Pending
          </Badge>
        );
    }
  };

  // Get organization color for border
  const orgBorderColor = organization?.brandingColor || null;

  return (
    <div className="space-y-6 min-w-0 w-full">
      {/* SuggestionCard with integrated document context and inline diff */}
      <SuggestionCard
        suggestion={proposal}
        totalUsers={totalUsers}
        currentUser={currentUser}
        allCollaborators={allCollaborators}
        onVote={(proposalId, voteType) => onVote(proposalId, documentContext.documentId, documentContext.paragraphId, voteType)}
        onComment={(proposalId, text, parentId) => onComment(proposalId, documentContext.documentId, documentContext.paragraphId, text, parentId)}
        onDeleteProposal={tabType !== 'accepted' ? onDeleteProposal : undefined}
        originalText={diffOriginalText}
        showDiffInline={true} // Show diff for all tabs when comparison is available
        documentContext={documentContext}
        onNavigateToDocument={onNavigateToDocument}
        tabBadge={getTabBadge()}
        showHistoryButton={tabType === 'accepted' && history.length > 0}
        historyCount={history.length}
        onToggleHistory={() => setShowHistory(!showHistory)}
        diffHighlightColor={tabType === 'accepted' ? 'green' : 'yellow'}
        organization={organization}
        organizationBorderColor={orgBorderColor}
        ranking={ranking}
        documentOptions={documentOptions}
      />

      {/* History Display (for Accepted tab) */}
      {tabType === 'accepted' && showHistory && history.length > 0 && (
        <HistoryDisplay 
          history={history} 
          isDocumentTitle={proposal.type === 'TITLE'}
          className="mt-4"
          organizationBorderColor={orgBorderColor}
        />
      )}
    </div>
  );
}

