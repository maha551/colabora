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
      {/* Document Context Header */}
      <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
        <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
        <button
          onClick={() => onNavigateToDocument(documentContext.documentId)}
          className="font-medium hover:text-gray-900 transition-colors text-left"
        >
          {documentContext.documentTitle}
        </button>
        {documentContext.paragraphTitle && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600">{documentContext.paragraphTitle}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {getTabBadge()}
          {tabType === 'accepted' && history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="h-7 text-xs gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              History ({history.length})
            </Button>
          )}
        </div>
      </div>

      {/* SuggestionCard */}
      <SuggestionCard
        suggestion={proposal}
        totalUsers={totalUsers}
        currentUser={currentUser}
        allCollaborators={allCollaborators}
        onVote={(proposalId, voteType) => onVote(proposalId, documentContext.documentId, documentContext.paragraphId, voteType)}
        onComment={(proposalId, text, parentId) => onComment(proposalId, documentContext.documentId, documentContext.paragraphId, text, parentId)}
        originalText={originalText}
      />

      {/* Expanded Diff View for Pending Tab */}
      {tabType === 'pending' && (
        <Card className="border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowDiffExpanded(!showDiffExpanded)}
            className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-700">Proposed Change</h4>
              <span className="text-xs text-gray-500">by {proposal.user.name}</span>
            </div>
            {showDiffExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
            )}
          </button>
          {showDiffExpanded && (
            <div className="p-4 bg-white">
              <DiffViewer
                originalText={originalText}
                suggestion1Text={proposal.text}
                suggestion1Author={proposal.user.name}
              />
            </div>
          )}
        </Card>
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

