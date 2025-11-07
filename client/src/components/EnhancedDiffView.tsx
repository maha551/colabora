import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, User, Paragraph } from '../types';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { DiffViewer } from './DiffViewer';
import { SuggestionCard } from './SuggestionCard';
import { ThumbsUp, ThumbsDown, Minus, Expand, ChevronUp, ChevronDown } from 'lucide-react';

interface EnhancedDiffViewProps {
  document: Document;
  currentUser: User;
  totalUsers: number;
  allCollaborators: User[];
  targetParagraph: Paragraph;
  selectedSuggestion: any;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
  onClose: () => void;
}

export function EnhancedDiffView({
  document,
  currentUser,
  totalUsers,
  allCollaborators,
  targetParagraph,
  selectedSuggestion,
  onVote,
  onComment,
  onClose,
}: EnhancedDiffViewProps) {
  const [showFullContext, setShowFullContext] = useState(false);
  const [loadedParagraphs, setLoadedParagraphs] = useState<Paragraph[]>([]);
  const [loadingDirection, setLoadingDirection] = useState<'up' | 'down' | null>(null);
  const [hasMoreUp, setHasMoreUp] = useState(true);
  const [hasMoreDown, setHasMoreDown] = useState(true);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Get all paragraphs sorted by order
  const allParagraphs = [...document.paragraphs]
    .filter(p => !p.isDocumentTitle)
    .sort((a, b) => a.order - b.order);

  const targetIndex = allParagraphs.findIndex(p => p.id === targetParagraph.id);

  // Initialize with target paragraph and 2 paragraphs in each direction if available
  useEffect(() => {
    if (showFullContext && loadedParagraphs.length === 0) {
      const initialParagraphs: Paragraph[] = [];
      const startIndex = Math.max(0, targetIndex - 2);
      const endIndex = Math.min(allParagraphs.length - 1, targetIndex + 2);

      for (let i = startIndex; i <= endIndex; i++) {
        initialParagraphs.push(allParagraphs[i]);
      }

      setLoadedParagraphs(initialParagraphs);
      setHasMoreUp(startIndex > 0);
      setHasMoreDown(endIndex < allParagraphs.length - 1);
    }
  }, [showFullContext, targetIndex, allParagraphs, loadedParagraphs.length]);

  // Load more paragraphs in the specified direction
  const loadMoreParagraphs = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up' && !hasMoreUp) return;
    if (direction === 'down' && !hasMoreDown) return;

    setLoadingDirection(direction);

    setTimeout(() => {
      const firstLoadedIndex = allParagraphs.findIndex(p => p.id === loadedParagraphs[0]?.id);
      const lastLoadedIndex = allParagraphs.findIndex(p => p.id === loadedParagraphs[loadedParagraphs.length - 1]?.id);

      let newParagraphs: Paragraph[] = [...loadedParagraphs];

      if (direction === 'up') {
        const loadCount = 2;
        const startIndex = Math.max(0, firstLoadedIndex - loadCount);
        for (let i = startIndex; i < firstLoadedIndex; i++) {
          newParagraphs.unshift(allParagraphs[i]);
        }
        setHasMoreUp(startIndex > 0);
      } else if (direction === 'down') {
        const loadCount = 2;
        const endIndex = Math.min(allParagraphs.length - 1, lastLoadedIndex + loadCount + 1);
        for (let i = lastLoadedIndex + 1; i <= endIndex; i++) {
          newParagraphs.push(allParagraphs[i]);
        }
        setHasMoreDown(endIndex < allParagraphs.length - 1);
      }

      setLoadedParagraphs(newParagraphs);
      setLoadingDirection(null);
    }, 300);
  }, [loadedParagraphs, allParagraphs, hasMoreUp, hasMoreDown]);

  // Handle scroll events for dynamic loading
  const handleScroll = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up' && hasMoreUp) {
      loadMoreParagraphs('up');
    } else if (direction === 'down' && hasMoreDown) {
      loadMoreParagraphs('down');
    }
  }, [hasMoreUp, hasMoreDown, loadMoreParagraphs]);

  // Render a paragraph in the diff view
  const renderParagraphInDiff = (paragraph: Paragraph, isTarget: boolean = false) => {
    if (!paragraph) return null;

    const hasAcceptedContent = paragraph.history && paragraph.history.length > 0;
    const displayText = hasAcceptedContent
      ? paragraph.text // Show accepted text
      : paragraph.title || paragraph.text;

    if (isTarget && selectedSuggestion) {
      // Show diff for target paragraph
      return (
        <div key={paragraph.id} className="mb-6">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-600 rounded-lg p-4 mb-4">
            <Badge className="mb-2 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Current Suggestion Under Review
            </Badge>
            <DiffViewer
              originalText={paragraph.text}
              suggestion1Text={selectedSuggestion.text}
              suggestion1Author={selectedSuggestion.user.name}
            />
          </div>
        </div>
      );
    }

    // Show accepted content for other paragraphs
    return (
      <div key={paragraph.id} className="mb-6">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {hasAcceptedContent ? 'Accepted Content' : 'Original Content'}
          </p>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {paragraph.title && (
              <div className="font-semibold mb-2">
                {paragraph.title}
              </div>
            )}
            <div className="whitespace-pre-wrap">
              {displayText}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!selectedSuggestion) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
      <Card className="w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Review Suggestion</h3>
            <Badge variant="outline">
              {selectedSuggestion.user.name}'s proposal
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFullContext(!showFullContext)}
              className="gap-2"
            >
              <Expand className="h-4 w-4" />
              {showFullContext ? 'Show Focused' : 'Show Full Context'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left Pane - Diff View */}
          <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700 min-w-0">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              <h4 className="font-medium flex items-center gap-2">
                Document Context
                {showFullContext && (
                  <Badge variant="secondary" className="text-xs">
                    Full View
                  </Badge>
                )}
              </h4>
            </div>

            <div
              ref={leftScrollRef}
              className="flex-1 overflow-y-auto p-4 min-h-0"
              onScroll={(e) => {
                const element = e.currentTarget;
                const isAtTop = element.scrollTop === 0;
                const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 10;

                if (isAtTop && showFullContext) {
                  handleScroll('up');
                } else if (isAtBottom && showFullContext) {
                  handleScroll('down');
                }
              }}
            >
              {showFullContext ? (
                <>
                  {/* Load More Up */}
                  {hasMoreUp && (
                    <div className="text-center mb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadMoreParagraphs('up')}
                        disabled={loadingDirection === 'up'}
                        className="gap-2"
                      >
                        <ChevronUp className="h-4 w-4" />
                        {loadingDirection === 'up' ? 'Loading...' : 'Load More Above'}
                      </Button>
                    </div>
                  )}

                  {/* Loaded Paragraphs */}
                  {loadedParagraphs.map((paragraph) => (
                    renderParagraphInDiff(paragraph, paragraph.id === targetParagraph.id)
                  ))}

                  {/* Load More Down */}
                  {hasMoreDown && (
                    <div className="text-center mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadMoreParagraphs('down')}
                        disabled={loadingDirection === 'down'}
                        className="gap-2"
                      >
                        <ChevronDown className="h-4 w-4" />
                        {loadingDirection === 'down' ? 'Loading...' : 'Load More Below'}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                /* Focused View - Just the target paragraph diff */
                renderParagraphInDiff(targetParagraph, true)
              )}
            </div>
          </div>

          {/* Right Pane - Discussion */}
          <div className="w-full lg:w-96 flex flex-col min-w-0">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              <h4 className="font-medium">Discussion & Voting</h4>
            </div>

            <div
              ref={rightScrollRef}
              className="flex-1 overflow-y-auto p-4 min-h-0"
            >
              <SuggestionCard
                suggestion={selectedSuggestion}
                totalUsers={totalUsers}
                currentUser={currentUser}
                allCollaborators={allCollaborators}
                onVote={onVote}
                onComment={onComment}
                originalText={targetParagraph.text}
              />
            </div>
          </div>
        </div>

        {/* Footer - Vote Buttons (Mobile Only) */}
        <div className="lg:hidden border-t p-4">
          <div className="flex gap-2">
            <Button
              variant={selectedSuggestion.votes.find((v: any) => v.userId === currentUser.id)?.vote === 'PRO' ? 'default' : 'outline'}
              onClick={() => onVote(selectedSuggestion.id, 'PRO')}
              className="flex-1 gap-2"
            >
              <ThumbsUp className="h-4 w-4" />
              Approve
            </Button>
            <Button
              variant={selectedSuggestion.votes.find((v: any) => v.userId === currentUser.id)?.vote === 'NEUTRAL' ? 'secondary' : 'outline'}
              onClick={() => onVote(selectedSuggestion.id, 'NEUTRAL')}
              className="flex-1 gap-2"
            >
              <Minus className="h-4 w-4" />
              Neutral
            </Button>
            <Button
              variant={selectedSuggestion.votes.find((v: any) => v.userId === currentUser.id)?.vote === 'CONTRA' ? 'destructive' : 'outline'}
              onClick={() => onVote(selectedSuggestion.id, 'CONTRA')}
              className="flex-1 gap-2"
            >
              <ThumbsDown className="h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
