import React, { useState } from 'react';
import { SuggestionCard } from './SuggestionCard';
import { HistoryDisplay } from './HistoryDisplay';
import { DiffViewer } from './DiffViewer';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FileText, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Suggestion, User, VersionHistory } from '../types';
import { DocumentContext } from '../utils/proposalAdapter';
import { cn } from './ui/utils';
import { Card } from './ui/card';

interface ActivityFeedProposalCardProps {
  proposal: Suggestion;
  documentContext: DocumentContext;
  currentUser: User;
  totalUsers: number;
  allCollaborators: User[];
  originalText: string;
  history?: VersionHistory[];
  tabType: 'accepted' | 'debated' | 'pending';
  onVote: (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => void;
  onNavigateToDocument: (documentId: string) => void;
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
  onVote,
  onComment,
  onNavigateToDocument,
}: ActivityFeedProposalCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showDiffExpanded, setShowDiffExpanded] = useState(tabType === 'pending'); // Auto-expand for pending

  const getTabBadge = () => {
    switch (tabType) {
      case 'accepted':
        return (
          <Badge className="bg-green-600 text-white text-xs px-2 py-0.5 font-medium">
            Accepted
          </Badge>
        );
      case 'debated':
        return (
          <Badge className="bg-purple-600 text-white text-xs px-2 py-0.5 font-medium">
            Hot Discussion
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5 font-medium">
            Vote Pending
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* SuggestionCard with integrated document context and inline diff for pending */}
      {tabType === 'pending' ? (
        <Card className="p-0 overflow-hidden">
          <SuggestionCard
            suggestion={proposal}
            totalUsers={totalUsers}
            currentUser={currentUser}
            allCollaborators={allCollaborators}
            onVote={(proposalId, voteType) => onVote(proposalId, documentContext.documentId, documentContext.paragraphId, voteType)}
            onComment={(proposalId, text, parentId) => onComment(proposalId, documentContext.documentId, documentContext.paragraphId, text, parentId)}
            originalText={originalText}
            showDiffInline={true}
            documentContext={documentContext}
            onNavigateToDocument={onNavigateToDocument}
            tabBadge={getTabBadge()}
            showHistoryButton={tabType === 'accepted' && history.length > 0}
            historyCount={history.length}
            onToggleHistory={() => setShowHistory(!showHistory)}
          />
        </Card>
      ) : (
        <SuggestionCard
          suggestion={proposal}
          totalUsers={totalUsers}
          currentUser={currentUser}
          allCollaborators={allCollaborators}
          onVote={(proposalId, voteType) => onVote(proposalId, documentContext.documentId, documentContext.paragraphId, voteType)}
          onComment={(proposalId, text, parentId) => onComment(proposalId, documentContext.documentId, documentContext.paragraphId, text, parentId)}
          originalText={originalText}
          documentContext={documentContext}
          onNavigateToDocument={onNavigateToDocument}
          tabBadge={getTabBadge()}
          showHistoryButton={tabType === 'accepted' && history.length > 0}
          historyCount={history.length}
          onToggleHistory={() => setShowHistory(!showHistory)}
        />
      )}

      {/* History Display (for Accepted tab) */}
      {tabType === 'accepted' && showHistory && history.length > 0 && (
        <HistoryDisplay 
          history={history} 
          isDocumentTitle={proposal.type === 'TITLE'}
          className="mt-2"
        />
      )}
    </div>
  );
}

