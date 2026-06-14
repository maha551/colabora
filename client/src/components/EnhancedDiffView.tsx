import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, User, Paragraph, Proposal, Vote } from '../types';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { DiffViewer } from './DiffViewer';
import { SuggestionCard } from './SuggestionCard';
import { VoteButtonGroup } from './shared/VoteButtonGroup';
import { Icon } from './ui/Icon';
import { useOnboarding } from '../hooks/useOnboarding';
import { OnboardingHint } from './OnboardingHint';
import { RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface EnhancedDiffViewProps {
  document: Document;
  currentUser: User;
  totalUsers: number;
  allCollaborators: User[];
  targetParagraph: Paragraph;
  selectedSuggestion: Proposal;
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
  const { hasSeenHint } = useOnboarding();
  const { t: tOnboarding } = useTranslation('onboarding');
  const { t: tDocuments } = useTranslation('documents');
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

      const newParagraphs: Paragraph[] = [...loadedParagraphs];

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
    // Paragraphs can have a heading (title) and/or body (text)
    const isHeading = paragraph.title && paragraph.title.trim().length > 0;
    const displayText = isHeading 
      ? paragraph.title 
      : paragraph.text;

    if (isTarget && selectedSuggestion) {
      // Show diff for target paragraph
      return (
        <div key={paragraph.id} className="mb-6">
          <div 
            style={{
              backgroundColor: 'var(--color-amber-200)',
              borderColor: 'var(--color-amber-500)',
            }}
            className={cn("border-2 p-4 mb-4 dark:bg-[var(--color-amber-500)] dark:border-[var(--color-amber-600)]", RADIUS.panel)}
          >
            <Badge 
              style={{
                backgroundColor: 'var(--color-amber-200)',
                color: 'var(--color-amber-600)',
              }}
              className="mb-2 dark:bg-[var(--color-amber-500)] dark:text-[var(--color-amber-200)]"
            >
              {tDocuments('diffView.currentSuggestionBadge')}
            </Badge>
            <DiffViewer
              originalText={isHeading ? (paragraph.title || '') : paragraph.text}
              suggestion1Text={selectedSuggestion.text}
              suggestion1Author={selectedSuggestion.user.name}
              suggestion1UserId={selectedSuggestion.user.id}
            />
          </div>
        </div>
      );
    }

    // Show accepted content for other paragraphs
    return (
      <div key={paragraph.id} className="mb-6">
        <div 
          style={{
            backgroundColor: 'var(--muted)',
          }}
          className={cn("p-4 dark:bg-[var(--muted)]", RADIUS.panel)}
        >
          <p 
            style={{
              color: 'var(--muted-foreground)',
            }}
            className="text-sm mb-2"
          >
            {hasAcceptedContent ? tDocuments('diffView.acceptedContent') : tDocuments('diffView.originalContent')}
          </p>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {isHeading ? (
              <div className="font-semibold mb-2">
                {displayText}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">
                {displayText}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!selectedSuggestion) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-0 md:p-4">
      <Card className="w-full h-full md:max-w-7xl md:h-[90vh] flex flex-col">
        {/* Header */}
        {!hasSeenHint('enhanced-diff-view-opened') && (
          <div className="p-3 md:p-4 border-b">
            <OnboardingHint
              hintKey="enhanced-diff-view-opened"
              message={tOnboarding('enhancedDiffViewOpened')}
              variant="info"
              position="inline"
              showOnce={true}
              delay={300}
            />
          </div>
        )}
        <div className="flex items-center justify-between p-3 md:p-4 border-b">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{tDocuments('diffView.reviewSuggestion')}</h3>
            <Badge variant="outline">
              {tDocuments('diffView.userProposal', { name: selectedSuggestion.user.name })}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFullContext(!showFullContext)}
              className="gap-2"
            >
              <Icon name="Expand" className="h-4 w-4" />
              {showFullContext ? tDocuments('diffView.showFocused') : tDocuments('diffView.showFullContext')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left Pane - Diff View */}
          <div className="flex-1 flex flex-col border-r-0 md:border-r border-border min-w-0">
            <div 
              style={{
                backgroundColor: 'var(--muted)',
              }}
              className="p-4 border-b flex-shrink-0 dark:bg-[var(--muted)]"
            >
              <h4 className="font-medium flex items-center gap-2">
                {tDocuments('diffView.documentContext')}
                {showFullContext && (
                  <Badge variant="secondary" className="text-xs">
                    {tDocuments('diffView.fullView')}
                  </Badge>
                )}
              </h4>
            </div>

            <div
              ref={leftScrollRef}
              className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0"
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
                        <Icon name="ChevronUp" className="h-4 w-4" />
                        {loadingDirection === 'up' ? tDocuments('diffView.loading') : tDocuments('diffView.loadMoreAbove')}
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
                        <Icon name="ChevronDown" className="h-4 w-4" />
                        {loadingDirection === 'down' ? tDocuments('diffView.loading') : tDocuments('diffView.loadMoreBelow')}
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
          <div className="w-full md:w-96 flex flex-col min-w-0 border-t md:border-t-0 border-border">
            <div 
              style={{
                backgroundColor: 'var(--muted)',
              }}
              className="p-4 border-b flex-shrink-0 dark:bg-[var(--muted)]"
            >
              <h4 className="font-medium">{tDocuments('diffView.discussionVoting')}</h4>
            </div>

            <div
              ref={rightScrollRef}
              className="flex-1 overflow-y-auto min-h-0"
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
        <div className="lg:hidden border-t p-3 md:p-4">
          <VoteButtonGroup
            value={selectedSuggestion.votes.find((v: Vote) => v.userId === currentUser.id)?.vote ?? null}
            onVote={(vote) => onVote(selectedSuggestion.id, vote)}
            variant="full"
          />
        </div>
      </Card>
    </div>
  );
}
