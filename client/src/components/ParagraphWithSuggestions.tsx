import React, { useState, useMemo, useEffect } from "react";
import { Paragraph, User, HeadingLevel, Document } from "../types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { SuggestionCard } from "./SuggestionCard";
import { DiffViewer } from "./DiffViewer";
import { EnhancedDiffView } from "./EnhancedDiffView";
import { PlusCircle, Edit, MessageSquare, History, Filter, ArrowUpDown, Expand } from "lucide-react";
import { cn } from "./ui/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface ParagraphWithSuggestionsProps {
  paragraph: Paragraph;
  document: Document;
  totalUsers: number;
  currentUser: User;
  allCollaborators?: User[];
  onAddSuggestion: (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
    }
  ) => void;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
  isDocumentTitle?: boolean;
  isHovered?: boolean;
  showContextButton?: boolean;
}

export function ParagraphWithSuggestions({
  paragraph,
  document,
  totalUsers,
  currentUser,
  allCollaborators = [],
  onAddSuggestion,
  onVote,
  onComment,
  isDocumentTitle = false,
  isHovered = false,
  showContextButton = true,
}: ParagraphWithSuggestionsProps) {
  const suggestions = paragraph.suggestions ?? [];
  const bodySuggestions = suggestions.filter((s) => s.type !== 'TITLE');
  const titleSuggestions = suggestions.filter((s) => s.type === 'TITLE');
  
  // State for filtering and sorting
  const [sortBy, setSortBy] = useState('votePercentage' as 'votePercentage' | 'date' | 'status');
  const [filterBy, setFilterBy] = useState('all' as 'all' | 'accepted' | 'pending' | 'needsVotes');

  // State for enhanced diff view
  const [enhancedDiffSuggestion, setEnhancedDiffSuggestion] = useState<any>(null);

  // State for double-click editing
  const [editCursorPosition, setEditCursorPosition] = useState<number | null>(null);
  const [similarSuggestions, setSimilarSuggestions] = useState<any[]>([]);
  const [showSimilarityWarning, setShowSimilarityWarning] = useState(false);

  const acceptedBodyProposal = bodySuggestions.find((s) => s.approved);
  const acceptedTitleProposal = titleSuggestions.find((s) => s.approved);

  const fallbackHeading = paragraph.title ?? (isDocumentTitle ? paragraph.text ?? "" : "");
  const fallbackBody = paragraph.text ?? "";

  const acceptedHeadingText = acceptedTitleProposal ? acceptedTitleProposal.text : fallbackHeading;
  const acceptedBodyText = acceptedBodyProposal ? acceptedBodyProposal.text : fallbackBody;

  const defaultSuggestionType: 'BODY' | 'TITLE' = isDocumentTitle ? 'TITLE' : 'BODY';
  const acceptedHeadingLevel: HeadingLevel = (acceptedTitleProposal?.headingLevel as HeadingLevel)
    || (paragraph.headingLevel as HeadingLevel)
    || (isDocumentTitle ? 'h1' : 'h2');

  const [isEditing, setIsEditing] = useState(false);
  const [suggestionType, setSuggestionType] = useState(defaultSuggestionType);
  const [suggestionText, setSuggestionText] = useState(
    defaultSuggestionType === 'TITLE' ? acceptedHeadingText : acceptedBodyText
  );
  const [suggestionHeadingLevel, setSuggestionHeadingLevel] = useState(acceptedHeadingLevel);
  const [showDiscussionArea, setShowDiscussionArea] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState(() => [] as string[]);
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > window.innerHeight;
    }
    return true;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    
    handleResize(); // Set initial value
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const historyEntries = paragraph.history || [];
  const historyCount = historyEntries.length;

  const headingContent = (acceptedHeadingText || "").trim();
  const bodyContent = (acceptedBodyText || "").trim();

  const availableTypes: Array<'BODY' | 'TITLE'> = isDocumentTitle ? ['TITLE'] : ['BODY', 'TITLE'];

  // Filter and sort suggestions
  const filteredAndSortedSuggestions = useMemo(() => {
    let filtered = [...suggestions];
    
    // Apply filters
    switch (filterBy) {
      case 'accepted':
        filtered = filtered.filter(s => s.approved);
        break;
      case 'pending':
        filtered = filtered.filter(s => !s.approved);
        break;
      case 'needsVotes':
        filtered = filtered.filter(s => {
          const totalVotes = s.votes.length;
          return totalVotes < totalUsers && !s.approved;
        });
        break;
      // 'all' - no filtering
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'votePercentage': {
          const aProVotes = a.votes.filter(v => v.vote === 'PRO').length;
          const bProVotes = b.votes.filter(v => v.vote === 'PRO').length;
          const aVotePercentage = totalUsers > 0 ? (aProVotes / totalUsers) * 100 : 0;
          const bVotePercentage = totalUsers > 0 ? (bProVotes / totalUsers) * 100 : 0;
          
          // Sort by vote percentage descending, then by total votes descending
          if (Math.abs(aVotePercentage - bVotePercentage) < 0.1) {
            return b.votes.length - a.votes.length;
          }
          return bVotePercentage - aVotePercentage;
        }
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'status':
          // Accepted first, then by vote percentage
          if (a.approved !== b.approved) {
            return a.approved ? -1 : 1;
          }
          const aProVotes = a.votes.filter(v => v.vote === 'PRO').length;
          const bProVotes = b.votes.filter(v => v.vote === 'PRO').length;
          return bProVotes - aProVotes;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [suggestions, filterBy, sortBy, totalUsers]);

  const handleToggleSuggestion = (suggestionId: string) => {
    setSelectedSuggestions((prev) => {
      if (prev.includes(suggestionId)) {
        return prev.filter((id) => id !== suggestionId);
      }

      if (prev.length < 2) {
        return [...prev, suggestionId];
      }

      return [prev[1], suggestionId];
    });
  };

  const selectedSuggestion1 = bodySuggestions.find((p) => p.id === selectedSuggestions[0]);
  const selectedSuggestion2 = bodySuggestions.find((p) => p.id === selectedSuggestions[1]);

  const toggleDiscussion = () => {
    setShowDiscussionArea((prev) => {
      const next = !prev;
      if (next) {
        setShowHistory(false);
      }
      return next;
    });
  };

  const toggleHistory = () => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next) {
        setShowDiscussionArea(false);
      }
      return next;
    });
  };

  // Function to calculate text similarity (simple Levenshtein distance)
  const calculateSimilarity = (text1: string, text2: string): number => {
    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;

    if (longer.length === 0) return 1.0;

    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  };

  const findSimilarSuggestions = (newText: string): any[] => {
    const threshold = 0.8; // 80% similarity threshold
    return suggestions.filter(suggestion => {
      const similarity = calculateSimilarity(newText, suggestion.text);
      return similarity >= threshold;
    });
  };

  const startEditing = (typeOverride?: 'BODY' | 'TITLE') => {
    const nextType = typeOverride ?? (isDocumentTitle ? 'TITLE' : 'BODY');
    setSuggestionType(nextType);
    setSuggestionText(nextType === 'TITLE' ? acceptedHeadingText : acceptedBodyText);
    if (nextType === 'TITLE') {
      setSuggestionHeadingLevel(acceptedHeadingLevel);
    }
    setIsEditing(true);
    if (nextType === 'TITLE') {
      setShowHistory(true);
      setShowDiscussionArea(false);
    } else {
      setShowDiscussionArea(true);
      setShowHistory(false);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent, textContent: string, isTitle: boolean = false) => {
    event.stopPropagation();

    // Get cursor position within the text
    const target = event.target as HTMLElement;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(target);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const cursorPosition = preCaretRange.toString().length;

    // Start editing at cursor position
    setEditCursorPosition(cursorPosition);

    const nextType = isTitle ? 'TITLE' : 'BODY';
    setSuggestionType(nextType);

    // Pre-fill with current text up to cursor position for better UX
    const currentText = isTitle ? acceptedHeadingText : acceptedBodyText;
    const textUpToCursor = currentText.substring(0, cursorPosition);
    setSuggestionText(textUpToCursor);

    setIsEditing(true);
    if (nextType === 'TITLE') {
      setShowHistory(true);
      setShowDiscussionArea(false);
    } else {
      setShowDiscussionArea(true);
      setShowHistory(false);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSuggestionType(defaultSuggestionType);
    setSuggestionText(defaultSuggestionType === 'TITLE' ? acceptedHeadingText : acceptedBodyText);
    setSuggestionHeadingLevel(acceptedHeadingLevel);
  };

  const handleSubmitSuggestion = () => {
    const baseline = suggestionType === 'TITLE' ? acceptedHeadingText : acceptedBodyText;
    const trimmed = suggestionText.trim();

    if (!trimmed || trimmed === (baseline || '').trim()) {
      setIsEditing(false);
      return;
    }

    // Check for similar suggestions
    const similar = findSimilarSuggestions(trimmed);
    if (similar.length > 0) {
      setSimilarSuggestions(similar);
      setShowSimilarityWarning(true);
      return;
    }

    // No similar suggestions found, proceed with submission
    submitSuggestion(trimmed);
  };

  const submitSuggestion = (text: string) => {
    onAddSuggestion(paragraph.id, {
      text: text,
      type: suggestionType,
      headingLevel: suggestionType === 'TITLE' ? suggestionHeadingLevel : undefined,
    });
    setIsEditing(false);
    setShowSimilarityWarning(false);
    setSimilarSuggestions([]);
    if (suggestionType === 'TITLE') {
      setShowHistory(true);
    } else {
      setShowDiscussionArea(true);
    }
  };

  const handleSimilarityWarningResponse = (shouldProceed: boolean) => {
    if (shouldProceed) {
      submitSuggestion(suggestionText.trim());
    } else {
      setShowSimilarityWarning(false);
      setSimilarSuggestions([]);
      // Stay in editing mode so user can modify their suggestion
    }
  };

  const renderHeading = () => {
    if (!headingContent) {
      return null;
    }

    const level: HeadingLevel = (paragraph.headingLevel as HeadingLevel) || acceptedHeadingLevel || (isDocumentTitle ? 'h1' : 'h2');

    if (isDocumentTitle) {
      return <h1 className="text-3xl font-bold text-foreground" onDoubleClick={(e) => handleDoubleClick(e, headingContent, true)}>{headingContent}</h1>;
    }

    if (level === 'h1') {
      return <h1 className="text-2xl font-semibold text-foreground" onDoubleClick={(e) => handleDoubleClick(e, headingContent, true)}>{headingContent}</h1>;
    }
    if (level === 'h2') {
      return <h2 className="text-xl font-semibold text-foreground" onDoubleClick={(e) => handleDoubleClick(e, headingContent, true)}>{headingContent}</h2>;
    }
    return <h3 className="text-lg font-semibold text-foreground" onDoubleClick={(e) => handleDoubleClick(e, headingContent, true)}>{headingContent}</h3>;
  };

  const renderBody = () => {
    if (!bodyContent) {
      return null;
    }

    return <p className="leading-relaxed text-foreground whitespace-pre-wrap" onDoubleClick={(e) => handleDoubleClick(e, bodyContent, false)}>{bodyContent}</p>;
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "relative transition-all duration-200",
          suggestions.length > 0
            ? "bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-blue-400 cursor-pointer"
            : "bg-white dark:bg-slate-900/40",
          showDiscussionArea || showHistory || isHovered
            ? "shadow-lg ring-1 ring-primary/10 p-8"
            : "shadow-sm p-6"
        )}
        onClick={suggestions.length > 0 ? toggleDiscussion : undefined}
      >
        {!isEditing ? (
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              {renderHeading()}
              {renderBody()}
              {!headingContent && !bodyContent && (
                <p className="text-sm text-muted-foreground italic">Consensus open.</p>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-xs font-medium text-blue-700 dark:text-blue-300">
                  <MessageSquare className="h-3 w-3" />
                  {suggestions.length}
                </div>
              </div>
            )}
            <div
              className={cn(
                "flex items-center transition-all duration-150",
                isLandscape ? "flex-row gap-1" : "flex-col gap-2",
                showDiscussionArea || showHistory || isHovered
                  ? "opacity-100 translate-y-0"
                  : "pointer-events-none opacity-0 -translate-y-0.5"
              )}
            >
              {suggestions.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDiscussion();
                  }}
                  className="h-10 w-10 sm:h-8 sm:w-8 rounded-full touch-manipulation"
                  aria-label="Toggle discussion"
                >
                  <MessageSquare className="h-5 w-5 sm:h-4 sm:w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHistory();
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 rounded-full touch-manipulation"
                aria-label="Toggle history"
              >
                <History className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 rounded-full touch-manipulation"
                aria-label="Suggest edit"
              >
                <Edit className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {availableTypes.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={suggestionType === type ? "default" : "outline"}
                    onClick={() => {
                      setSuggestionType(type);
                      setSuggestionText(type === 'TITLE' ? acceptedHeadingText : acceptedBodyText);
                      if (type === 'TITLE') {
                        setSuggestionHeadingLevel(acceptedHeadingLevel);
                      }
                    }}
                  >
                    {type === 'TITLE' ? (isDocumentTitle ? 'Title' : 'Heading') : 'Body'}
                  </Button>
                ))}
                {suggestionType === 'TITLE' && (
                  <Select
                    value={suggestionHeadingLevel}
                    onValueChange={(value: HeadingLevel) => setSuggestionHeadingLevel(value)}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue placeholder="Heading level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="h1">H1</SelectItem>
                      <SelectItem value="h2">H2</SelectItem>
                      <SelectItem value="h3">H3</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEditing}
              >
                Cancel
              </Button>
            </div>
            <Textarea
              value={suggestionText}
              onChange={(e) => setSuggestionText(e.target.value)}
              className={suggestionType === 'TITLE' ? "min-h-[60px]" : "min-h-[100px]"}
              placeholder={
                suggestionType === 'TITLE'
                  ? `Edit the ${isDocumentTitle ? 'title' : 'heading'}...`
                  : "Edit the text and suggest changes..."
              }
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" onClick={handleSubmitSuggestion}>
                <PlusCircle className="h-4 w-4 mr-1" />
                Submit Suggestion
              </Button>
            </div>
          </div>
        )}
      </div>

      {showDiscussionArea && suggestions.length > 0 && (
        <div className="space-y-3 pl-6 border-l-2 border-primary/20" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                {filteredAndSortedSuggestions.length} {filteredAndSortedSuggestions.length !== suggestions.length && `of ${suggestions.length} `}
                Suggestion{suggestions.length !== 1 ? "s" : ""}
                {suggestions.some((p) => p.approved) && " (including accepted)"}
              </div>
              {selectedSuggestions.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {selectedSuggestions.length}/2 selected for comparison
                </div>
              )}
            </div>
            
            {/* Filtering and Sorting Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suggestions</SelectItem>
                    <SelectItem value="pending">Pending only</SelectItem>
                    <SelectItem value="accepted">Accepted only</SelectItem>
                    <SelectItem value="needsVotes">Needs votes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="votePercentage">By vote %</SelectItem>
                    <SelectItem value="date">By date (newest)</SelectItem>
                    <SelectItem value="status">By status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Show View Full Context button whenever there are suggestions */}
          {bodySuggestions.length > 0 && showContextButton && (
            <div className="flex justify-end mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Use the first available suggestion if none are selected
                  const suggestionToExpand = selectedSuggestion1 || bodySuggestions[0];
                  setEnhancedDiffSuggestion(suggestionToExpand);
                }}
                className="gap-2"
              >
                <Expand className="h-4 w-4" />
                View Full Context
              </Button>
            </div>
          )}

          {selectedSuggestion1 && (
            <DiffViewer
              originalText={acceptedBodyText}
              suggestion1Text={selectedSuggestion1?.text}
              suggestion2Text={selectedSuggestion2?.text}
              suggestion1Author={selectedSuggestion1?.user.name}
              suggestion2Author={selectedSuggestion2?.user.name}
            />
          )}

          {filteredAndSortedSuggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground italic text-center py-6">
              No suggestions match the current filter.
            </div>
          ) : (
            filteredAndSortedSuggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                totalUsers={totalUsers}
                currentUser={currentUser}
                allCollaborators={allCollaborators}
                documentOptions={document.options}
                isSelected={selectedSuggestions.includes(suggestion.id)}
                selectionIndex={selectedSuggestions.indexOf(suggestion.id)}
                onToggleSelect={suggestion.type === 'BODY' ? handleToggleSuggestion : undefined}
                onVote={onVote}
                onComment={onComment}
                originalText={suggestion.type === 'BODY' ? acceptedBodyText : acceptedHeadingText}
              />
            ))
          )}
        </div>
      )}

      {showHistory && (
        <div className="space-y-3 pl-6 border-l-2 border-primary/20" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Accepted Changes</h3>
            <span className="text-xs text-muted-foreground">
              {historyCount} {historyCount === 1 ? "entry" : "entries"}
            </span>
          </div>

          {historyCount === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No accepted changes yet.
            </p>
          ) : (
            <div className="space-y-3">
              {historyEntries.map((entry) => {
                const acceptedAt = entry.acceptedAt instanceof Date ? entry.acceptedAt : new Date(entry.acceptedAt);
                const formattedDate = isNaN(acceptedAt.getTime())
                  ? "Unknown date"
                  : `${acceptedAt.toLocaleDateString()} ${acceptedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                const isTitleChange = (entry.type || '').toUpperCase() === 'TITLE';
                const headingLevelLabel = entry.headingLevel ? entry.headingLevel.toUpperCase() : undefined;

                return (
                  <div key={entry.id} className="p-4 bg-muted/40 rounded-md space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {entry.user?.name || "Unknown collaborator"}
                      </span>
                      <span className="text-xs text-muted-foreground">{formattedDate}</span>
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {isTitleChange
                        ? (isDocumentTitle ? 'Title change' : `Heading change${headingLevelLabel ? ` (${headingLevelLabel})` : ''}`)
                        : 'Body change'}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{entry.text}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {entry.approvalPercentage ? (
                        <span>
                          Approved with {Math.round(entry.approvalPercentage)}% support
                        </span>
                      ) : (
                        <span>Approved</span>
                      )}
                      {entry.oldText && entry.oldText.trim() !== entry.text.trim() && (
                        <span className="italic">Previous: "{entry.oldText}"</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Similarity Warning Dialog */}
      <Dialog open={showSimilarityWarning} onOpenChange={setShowSimilarityWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Similar Suggestion Found</DialogTitle>
            <DialogDescription>
              Your suggestion is very similar to {similarSuggestions.length === 1 ? 'an existing suggestion' : `${similarSuggestions.length} existing suggestions`}.
              Consider voting for the existing {similarSuggestions.length === 1 ? 'one' : 'ones'} instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <h4 className="font-medium">Similar suggestions:</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {similarSuggestions.map((similar, index) => (
                <div key={similar.id} className="p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{similar.user.name}</span>
                    <div className="flex items-center gap-2">
                      {similar.approved && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Accepted</span>}
                      <span className="text-xs text-muted-foreground">
                        {similar.votes?.filter((v: any) => v.vote === 'PRO').length || 0} votes
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{similar.text}"</p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleSimilarityWarningResponse(false)}
            >
              Edit My Suggestion
            </Button>
            <Button
              onClick={() => handleSimilarityWarningResponse(true)}
            >
              Create Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Diff View */}
      {enhancedDiffSuggestion && (
        <EnhancedDiffView
          document={document}
          currentUser={currentUser}
          totalUsers={totalUsers}
          allCollaborators={allCollaborators}
          targetParagraph={paragraph}
          selectedSuggestion={enhancedDiffSuggestion}
          onVote={onVote}
          onComment={onComment}
          onClose={() => setEnhancedDiffSuggestion(null)}
        />
      )}
    </div>
  );
}
