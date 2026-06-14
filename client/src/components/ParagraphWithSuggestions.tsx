import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Paragraph, User, HeadingLevel, Document, Proposal, Comment, Organization } from "../types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { SuggestionCard } from "./SuggestionCard";
import { DiffViewer } from "./DiffViewer";
import { EnhancedDiffView } from "./EnhancedDiffView";
import { ProposalText } from "./ProposalText";
import { Icon } from "./ui/Icon";
import { cn } from "./ui/utils";
import { cardStyles, documentSpacing } from "../lib/documentStyles";
import { COLORS, RADIUS } from "../lib/designSystem";
import { calculateVoteCounts, calculateApprovalPercentage } from "../utils/voteCalculations";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingHint } from "./OnboardingHint";
import { useTimezone } from "../hooks/useTimezone";

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
  onEditComment?: (suggestionId: string, commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (suggestionId: string, commentId: string) => Promise<void>;
  onDeleteProposal?: (suggestionId: string) => Promise<void>;
  onLoadMoreComments?: (suggestionId: string, offset: number) => Promise<Comment[]>;
  onUpvoteComment?: (suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => void;
  isDocumentTitle?: boolean;
  isHovered?: boolean;
  showContextButton?: boolean;
  diffHighlightColor?: 'yellow' | 'green'; // Color for diff highlights in persistent view
  organization?: Organization | null;
  // Optional: Voting state for document proposals (only needed for document proposals)
  votingState?: Set<string>;
  setVotingState?: React.Dispatch<React.SetStateAction<Set<string>>>;
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
  onEditComment,
  onDeleteComment,
  onDeleteProposal,
  onLoadMoreComments,
  onUpvoteComment,
  isDocumentTitle = false,
  isHovered = false,
  showContextButton = true,
  diffHighlightColor = 'yellow',
  organization,
  votingState,
  setVotingState,
}: ParagraphWithSuggestionsProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { hasSeenHint, trackSuggestion, trackVote } = useOnboarding();
  const { formatDate, formatTime } = useTimezone();
  const suggestions = paragraph.suggestions ?? [];
  const bodySuggestions = suggestions.filter((s) => s.type !== 'TITLE');
  const titleSuggestions = suggestions.filter((s) => s.type === 'TITLE');
  
  // Wrap vote handler to track votes
  const handleVote = (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    trackVote();
    onVote(suggestionId, voteType);
  };
  
  // State for filtering and sorting
  const [sortBy, setSortBy] = useState('votePercentage' as 'votePercentage' | 'date' | 'status');
  const [filterBy, setFilterBy] = useState('all' as 'all' | 'accepted' | 'pending' | 'needsVotes');

  // State for enhanced diff view
  const [enhancedDiffSuggestion, setEnhancedDiffSuggestion] = useState<Proposal | null>(null);

  const [similarSuggestions, setSimilarSuggestions] = useState<Proposal[]>([]);
  const [showSimilarityWarning, setShowSimilarityWarning] = useState(false);

  // Helper to check if a suggestion meets acceptance threshold based on votes
  const meetsAcceptanceThreshold = (suggestion: Proposal): boolean => {
    const acceptanceThreshold = document.options?.acceptanceThreshold || 75;
    const calculationMethod = document.options?.thresholdCalculationMethod || 'all_members';
    const voteCounts = calculateVoteCounts(suggestion.votes);
    const approvalPercentage = calculateApprovalPercentage({
      proVotes: voteCounts.pro,
      totalVotes: voteCounts.total,
      totalEligible: totalUsers,
      calculationMethod
    });
    return approvalPercentage >= acceptanceThreshold;
  };

  // Find accepted proposals: first check approved flag, then check vote percentages
  // This ensures proposals with 100% votes are shown as accepted even if backend flag isn't set yet
  const acceptedBodyProposal = bodySuggestions.find((s) => s.approved) 
    || bodySuggestions.find((s) => meetsAcceptanceThreshold(s));
  const acceptedTitleProposal = titleSuggestions.find((s) => s.approved)
    || titleSuggestions.find((s) => meetsAcceptanceThreshold(s));

  // Paragraphs can have a heading (title) and/or body (text)
  const fallbackHeading = paragraph.title && paragraph.title.trim().length > 0 
    ? paragraph.title 
    : (isDocumentTitle ? paragraph.text ?? "" : "");
  const fallbackBody = paragraph.text && paragraph.text.trim().length > 0 
    ? paragraph.text 
    : "";

  const acceptedHeadingText = acceptedTitleProposal ? acceptedTitleProposal.text : fallbackHeading;
  const acceptedBodyText = acceptedBodyProposal ? acceptedBodyProposal.text : fallbackBody;

  // Check if proposal cutoff has passed for organizational documents ONLY
  const proposalCutoffPassed = document.ownershipType === 'organizational' && 
    document.status === 'proposal' && 
    document.paragraphProposalsCutoff 
      ? new Date(document.paragraphProposalsCutoff) < new Date()
      : false;
  const canAddProposals = document.ownershipType === 'organizational'
    ? (document.status === 'proposal' && !proposalCutoffPassed) || (document.status === 'agreed' && document.amendmentsOpen)
    : (document.status !== 'agreed' && document.status !== 'rejected'); // Personal/shared: allow unless finalized

  // Determine paragraph type: heading (has title) or body (has text)
  const isHeadingParagraph = paragraph.title && paragraph.title.trim().length > 0;
  const isBodyParagraph = paragraph.text && paragraph.text.trim().length > 0;
  
  // Restrict proposal types to match paragraph type (no conversion allowed)
  const availableTypes: Array<'BODY' | 'TITLE'> = isDocumentTitle 
    ? ['TITLE'] 
    : isHeadingParagraph 
      ? ['TITLE'] 
      : isBodyParagraph 
        ? ['BODY'] 
        : ['BODY', 'TITLE']; // Fallback for edge cases (shouldn't happen after migration)

  // Default suggestion type should match paragraph type
  const defaultSuggestionType: 'BODY' | 'TITLE' = isDocumentTitle 
    ? 'TITLE' 
    : isHeadingParagraph 
      ? 'TITLE' 
      : 'BODY';
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
  // Separate selection state for headings and body
  const [selectedBodySuggestions, setSelectedBodySuggestions] = useState(() => [] as string[]);
  const [selectedHeadingSuggestions, setSelectedHeadingSuggestions] = useState(() => [] as string[]);
  
  // State for persisted diff view: when true and discussion is closed, shows inline diff in paragraph content
  const [showParagraphDiff, setShowParagraphDiff] = useState(false);
  // Persisted diff suggestion IDs: stores IDs of suggestions to show in diff when discussion area is closed
  // Separate arrays for body and heading
  const [persistedDiffBodySuggestionIds, setPersistedDiffBodySuggestionIds] = useState<string[]>([]);
  const [persistedDiffHeadingSuggestionIds, setPersistedDiffHeadingSuggestionIds] = useState<string[]>([]);

  // Synchronize showParagraphDiff state with persisted diff suggestion IDs
  // If persisted IDs become invalid, clear them (diff will fall back to displayed suggestion)
  useEffect(() => {
    if (showParagraphDiff) {
      // Validate body suggestion IDs
      if (persistedDiffBodySuggestionIds.length > 0) {
        const validBodyIds = persistedDiffBodySuggestionIds.filter(id => 
          bodySuggestions.some(s => s.id === id)
        );
        if (validBodyIds.length !== persistedDiffBodySuggestionIds.length) {
          setPersistedDiffBodySuggestionIds(validBodyIds);
        }
      }
      // Validate heading suggestion IDs
      if (persistedDiffHeadingSuggestionIds.length > 0) {
        const validHeadingIds = persistedDiffHeadingSuggestionIds.filter(id => 
          titleSuggestions.some(s => s.id === id)
        );
        if (validHeadingIds.length !== persistedDiffHeadingSuggestionIds.length) {
          setPersistedDiffHeadingSuggestionIds(validHeadingIds);
        }
      }
    }
  }, [showParagraphDiff, persistedDiffBodySuggestionIds, persistedDiffHeadingSuggestionIds, bodySuggestions, titleSuggestions]);

  const historyEntries = paragraph.history || [];
  const historyCount = historyEntries.length;

  // Find top-voted suggestion when no accepted version exists
  const getTopVotedSuggestion = useMemo(() => {
    if (acceptedBodyProposal || acceptedTitleProposal) return null;
    
    const allSuggestions = [...bodySuggestions, ...titleSuggestions];
    if (allSuggestions.length === 0) return null;
    
    // Sort by PRO vote count, then by date (latest first)
    const sorted = [...allSuggestions].sort((a, b) => {
      const aVoteCounts = calculateVoteCounts(a.votes);
      const bVoteCounts = calculateVoteCounts(b.votes);
      if (aVoteCounts.pro !== bVoteCounts.pro) return bVoteCounts.pro - aVoteCounts.pro;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    return sorted[0];
  }, [acceptedBodyProposal, acceptedTitleProposal, bodySuggestions, titleSuggestions]);

  const topVotedSuggestion = getTopVotedSuggestion;

  // Use top-voted suggestion when no accepted version
  const headingContent = (acceptedHeadingText || (topVotedSuggestion?.type === 'TITLE' ? topVotedSuggestion.text : '')).trim();
  const bodyContent = (acceptedBodyText || (topVotedSuggestion?.type === 'BODY' ? topVotedSuggestion.text : '')).trim();

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
          const calculationMethod = document.options?.thresholdCalculationMethod || 'all_members';
          const aVoteCounts = calculateVoteCounts(a.votes);
          const bVoteCounts = calculateVoteCounts(b.votes);
          const aVotePercentage = calculateApprovalPercentage({
            proVotes: aVoteCounts.pro,
            totalVotes: aVoteCounts.total,
            totalEligible: totalUsers,
            calculationMethod
          });
          const bVotePercentage = calculateApprovalPercentage({
            proVotes: bVoteCounts.pro,
            totalVotes: bVoteCounts.total,
            totalEligible: totalUsers,
            calculationMethod
          });
          
          // Sort by vote percentage descending, then by total votes descending
          if (Math.abs(aVotePercentage - bVotePercentage) < 0.1) {
            return bVoteCounts.total - aVoteCounts.total;
          }
          return bVotePercentage - aVotePercentage;
        }
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'status': {
          // Accepted first, then by vote percentage
          if (a.approved !== b.approved) {
            return a.approved ? -1 : 1;
          }
          const aVoteCounts = calculateVoteCounts(a.votes);
          const bVoteCounts = calculateVoteCounts(b.votes);
          return bVoteCounts.pro - aVoteCounts.pro;
        }
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [suggestions, filterBy, sortBy, totalUsers]);

  /**
   * Computes new selection array when toggling a suggestion
   * @param currentSelection - Current array of selected suggestion IDs
   * @param suggestionId - ID of suggestion being toggled
   * @returns New selection array
   */
  const computeNewSelection = (
    currentSelection: string[],
    suggestionId: string
  ): string[] => {
    const wasSelected = currentSelection.includes(suggestionId);
    
    if (wasSelected) {
      return currentSelection.filter((id) => id !== suggestionId);
    }
    
    // Selecting: add to selection (max 2)
    if (currentSelection.length < 2) {
      return [...currentSelection, suggestionId];
    }
    
    // Replace oldest selection with new one
    return [currentSelection[1], suggestionId];
  };

  /**
   * Updates persistent diff state based on selection changes
   */
  const updatePersistentDiffState = (
    newSelection: string[],
    wasPersistentDiffEnabled: boolean,
    wasSelected: boolean,
    isBody: boolean
  ): void => {
    if (!wasPersistentDiffEnabled && !wasSelected && newSelection.length > 0) {
      // Auto-enable when selecting first suggestion
      setShowParagraphDiff(true);
      if (isBody) {
        setPersistedDiffBodySuggestionIds(newSelection);
      } else {
        setPersistedDiffHeadingSuggestionIds(newSelection);
      }
    } else if (newSelection.length > 0) {
      // Update persisted IDs if persistent diff is already enabled
      if (isBody) {
        setPersistedDiffBodySuggestionIds(newSelection);
      } else {
        setPersistedDiffHeadingSuggestionIds(newSelection);
      }
    } else if (newSelection.length === 0 && wasPersistentDiffEnabled) {
      // Disable if all deselected
      setShowParagraphDiff(false);
      if (isBody) {
        setPersistedDiffBodySuggestionIds([]);
      } else {
        setPersistedDiffHeadingSuggestionIds([]);
      }
    }
  };

  const handleToggleSuggestion = (suggestionId: string, type: 'BODY' | 'TITLE') => {
    const isBody = type === 'BODY';
    const currentSelection = isBody ? selectedBodySuggestions : selectedHeadingSuggestions;
    const wasPersistentDiffEnabled = showParagraphDiff;
    const wasSelected = currentSelection.includes(suggestionId);
    
    // Step 1: Compute new selection (pure logic, no side effects)
    const newSelection = computeNewSelection(currentSelection, suggestionId);
    
    // Step 2: Update selection state (React will batch these)
    if (isBody) {
      setSelectedBodySuggestions(newSelection);
    } else {
      setSelectedHeadingSuggestions(newSelection);
    }
    
    // Step 3: Handle persistent diff state separately
    updatePersistentDiffState(
      newSelection,
      wasPersistentDiffEnabled,
      wasSelected,
      isBody
    );
  };

  // Get selected suggestions for body and heading separately
  const selectedBodySuggestion1 = bodySuggestions.find((p) => p.id === selectedBodySuggestions[0]);
  const selectedBodySuggestion2 = bodySuggestions.find((p) => p.id === selectedBodySuggestions[1]);
  const selectedHeadingSuggestion1 = titleSuggestions.find((p) => p.id === selectedHeadingSuggestions[0]);
  const selectedHeadingSuggestion2 = titleSuggestions.find((p) => p.id === selectedHeadingSuggestions[1]);

  // Get suggestions for diff view - handles both body and heading types
  const getSuggestionsForDiff = useMemo(() => {
    const result: { body?: { suggestion1: Proposal | null; suggestion2: Proposal | null }; heading?: { suggestion1: Proposal | null; suggestion2: Proposal | null } } = {};
    
    // Handle body suggestions
    if (showDiscussionArea && selectedBodySuggestions.length > 0) {
      const sel1 = bodySuggestions.find((p) => p.id === selectedBodySuggestions[0]);
      const sel2 = bodySuggestions.find((p) => p.id === selectedBodySuggestions[1]);
      result.body = { suggestion1: sel1 || null, suggestion2: sel2 || null };
    } else if (!showDiscussionArea && persistedDiffBodySuggestionIds.length > 0) {
      const sel1 = bodySuggestions.find((p) => p.id === persistedDiffBodySuggestionIds[0]);
      const sel2 = bodySuggestions.find((p) => p.id === persistedDiffBodySuggestionIds[1]);
      result.body = { suggestion1: sel1 || null, suggestion2: sel2 || null };
    } else {
      // Fallback: use displayed body suggestion (accepted or top-voted)
      const displayedSuggestion = acceptedBodyProposal || (topVotedSuggestion?.type === 'BODY' ? topVotedSuggestion : null);
      if (displayedSuggestion) {
        result.body = { suggestion1: displayedSuggestion, suggestion2: null };
      }
    }
    
    // Handle heading suggestions
    if (showDiscussionArea && selectedHeadingSuggestions.length > 0) {
      const sel1 = titleSuggestions.find((p) => p.id === selectedHeadingSuggestions[0]);
      const sel2 = titleSuggestions.find((p) => p.id === selectedHeadingSuggestions[1]);
      result.heading = { suggestion1: sel1 || null, suggestion2: sel2 || null };
    } else if (!showDiscussionArea && persistedDiffHeadingSuggestionIds.length > 0) {
      const sel1 = titleSuggestions.find((p) => p.id === persistedDiffHeadingSuggestionIds[0]);
      const sel2 = titleSuggestions.find((p) => p.id === persistedDiffHeadingSuggestionIds[1]);
      result.heading = { suggestion1: sel1 || null, suggestion2: sel2 || null };
    } else {
      // Fallback: use displayed heading suggestion (accepted or top-voted)
      const displayedSuggestion = acceptedTitleProposal || (topVotedSuggestion?.type === 'TITLE' ? topVotedSuggestion : null);
      if (displayedSuggestion) {
        result.heading = { suggestion1: displayedSuggestion, suggestion2: null };
      }
    }
    
    return result;
  }, [persistedDiffBodySuggestionIds, persistedDiffHeadingSuggestionIds, showDiscussionArea, selectedBodySuggestions, selectedHeadingSuggestions, bodySuggestions, titleSuggestions, acceptedBodyProposal, acceptedTitleProposal, topVotedSuggestion]);

  const toggleDiscussion = () => {
    setShowDiscussionArea((prev) => {
      const next = !prev;
      
      // When closing discussion area, persist current selections if persistent diff is enabled
      if (prev && !next && showParagraphDiff) {
        // Persist body selections
        setPersistedDiffBodySuggestionIds(selectedBodySuggestions.length > 0 ? [...selectedBodySuggestions] : []);
        // Persist heading selections
        setPersistedDiffHeadingSuggestionIds(selectedHeadingSuggestions.length > 0 ? [...selectedHeadingSuggestions] : []);
      }
      
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

  const findSimilarSuggestions = (newText: string): Proposal[] => {
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

  const handleDoubleClick = (event: React.MouseEvent, _textContent: string, isTitle: boolean = false) => {
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
    // setEditCursorPosition(cursorPosition); // Reserved for future feature

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
    trackSuggestion(); // Track suggestion for onboarding
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

  const renderContent = () => {
    const diffSuggestions = getSuggestionsForDiff;
    
    // Show diff if persistent diff is enabled
    if (showParagraphDiff) {
      const result: React.ReactNode[] = [];
      
      // Show hint when diff view is first enabled
      if (!hasSeenHint('diff-view-enabled')) {
        result.push(
          <OnboardingHint
            key="diff-view-enabled-hint"
            hintKey="diff-view-enabled"
            message={tOnboarding('diffViewEnabled')}
            variant="tip"
            position="inline"
            showOnce={true}
            delay={300}
          />
        );
      }
      
      // Render heading diff if we have heading suggestions
      if (diffSuggestions.heading?.suggestion1) {
        const { suggestion1, suggestion2 } = diffSuggestions.heading;
        const originalHeadingText = acceptedHeadingText || paragraph.title || '';
        result.push(
          <DiffViewer
            key="heading-diff"
            originalText={originalHeadingText}
            suggestion1Text={suggestion1.text}
            suggestion1Author={suggestion1.user.name}
            suggestion1UserId={suggestion1.user.id}
            suggestion2Text={suggestion2 ? suggestion2.text : undefined}
            suggestion2Author={suggestion2 ? suggestion2.user.name : undefined}
            suggestion2UserId={suggestion2 ? suggestion2.user.id : undefined}
            highlightColor={diffHighlightColor}
            originalLabel={acceptedHeadingText ? "Accepted Version" : "Original Text"}
            inline={true}
            isHeading={true}
            headingLevel={(paragraph.headingLevel as HeadingLevel) || acceptedHeadingLevel || (isDocumentTitle ? 'h1' : 'h2')}
          />
        );
      }
      
      // Render body diff if we have body suggestions
      if (diffSuggestions.body?.suggestion1) {
        const { suggestion1, suggestion2 } = diffSuggestions.body;
        const originalBodyText = acceptedBodyText || paragraph.text || '';
        result.push(
          <DiffViewer
            key="body-diff"
            originalText={originalBodyText}
            suggestion1Text={suggestion1.text}
            suggestion1Author={suggestion1.user.name}
            suggestion1UserId={suggestion1.user.id}
            suggestion2Text={suggestion2 ? suggestion2.text : undefined}
            suggestion2Author={suggestion2 ? suggestion2.user.name : undefined}
            suggestion2UserId={suggestion2 ? suggestion2.user.id : undefined}
            highlightColor={diffHighlightColor}
            originalLabel={acceptedBodyText ? "Accepted Version" : "Original Text"}
            inline={true}
          />
        );
      }
      
      // If we have diffs to show, return them
      if (result.length > 0) {
        return <>{result}</>;
      }
    }
    
    // Return original content using ProposalText component
    const headingIsTopVoted = topVotedSuggestion?.type === 'TITLE' && !acceptedTitleProposal;
    const bodyIsTopVoted = topVotedSuggestion?.type === 'BODY' && !acceptedBodyProposal;
    
    return (
      <>
        {headingContent && (
          <ProposalText
            content={headingContent}
            type="heading"
            headingLevel={(paragraph.headingLevel as HeadingLevel) || acceptedHeadingLevel || (isDocumentTitle ? 'h1' : 'h2')}
            isAccepted={!!acceptedTitleProposal}
            isPending={headingIsTopVoted}
            isDocumentTitle={isDocumentTitle}
            onDoubleClick={handleDoubleClick}
            organization={organization}
            document={document}
          />
        )}
        {bodyContent && (
          <ProposalText
            content={bodyContent}
            type="body"
            isAccepted={!!acceptedBodyProposal}
            isPending={bodyIsTopVoted}
            onDoubleClick={handleDoubleClick}
            organization={organization}
            document={document}
          />
        )}
        {!headingContent && !bodyContent && (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground italic text-center">Consensus open.</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className={documentSpacing.paragraph}>
      <div
        className={cn(
          cardStyles.discussion.base,
          "cursor-pointer",
          (showDiscussionArea || showHistory || isHovered) && cardStyles.discussion.expanded
        )}
        onClick={toggleDiscussion}
        role="button"
        tabIndex={0}
        aria-label={suggestions.length > 0 ? tCommon('aria.viewSuggestionsAndDiscussion') : tCommon('aria.openDiscussion')}
        onKeyDown={(e) => {
          // Don't handle spacebar/Enter if user is typing in an input field
          const target = e.target as HTMLElement;
          const isEditableElement = 
            target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' || 
            target.isContentEditable ||
            target.closest('input, textarea, [contenteditable="true"]');
          
          // Don't handle if editing or if focus is in an editable element
          if (isEditing || isEditableElement) {
            return;
          }
          
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDiscussion();
          }
        }}
      >
        {!isEditing ? (
          <div className={cn("flex gap-3", isDocumentTitle ? "items-center justify-center" : "items-start")}>
            <div className={cn("space-y-2", isDocumentTitle ? "w-full" : "flex-1")}>
              {renderContent()}
            </div>
            <div
              className={cn(
                "flex flex-col items-end gap-1.5 transition-all duration-150 md:flex-row md:items-center md:gap-1",
                showDiscussionArea || showHistory || isHovered || showParagraphDiff
                  ? "opacity-100 translate-y-0"
                  : "pointer-events-none opacity-0 -translate-y-0.5"
              )}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {suggestions.length > 0 && (isHovered || showDiscussionArea) && !hasSeenHint('diff-toggle-visible') ? (
                      <OnboardingHint
                        hintKey="diff-toggle-visible"
                        message={tOnboarding('diffToggleVisible')}
                        variant="info"
                        position="bottom"
                        showOnce={true}
                        delay={1000}
                      >
                        <Button
                          variant="ghost"
                          disabled={suggestions.length === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suggestions.length === 0) return;
                            if (showParagraphDiff) {
                              // Disable: clear persisted diff
                              setPersistedDiffBodySuggestionIds([]);
                              setPersistedDiffHeadingSuggestionIds([]);
                              setShowParagraphDiff(false);
                            } else {
                              // Enable: open discussion area and pre-select displayed suggestions
                              setShowDiscussionArea(true);
                              
                              // Determine which body suggestion is currently displayed
                              const displayedBodySuggestion = acceptedBodyProposal || (topVotedSuggestion?.type === 'BODY' ? topVotedSuggestion : null);
                              if (displayedBodySuggestion) {
                                setSelectedBodySuggestions([displayedBodySuggestion.id]);
                                setPersistedDiffBodySuggestionIds([displayedBodySuggestion.id]);
                              }
                              
                              // Determine which heading suggestion is currently displayed
                              const displayedHeadingSuggestion = acceptedTitleProposal || (topVotedSuggestion?.type === 'TITLE' ? topVotedSuggestion : null);
                              if (displayedHeadingSuggestion) {
                                setSelectedHeadingSuggestions([displayedHeadingSuggestion.id]);
                                setPersistedDiffHeadingSuggestionIds([displayedHeadingSuggestion.id]);
                              }
                              
                              setShowParagraphDiff(true);
                            }
                          }}
                          className={cn(
                            "h-5 w-5 sm:h-5 sm:w-5 border touch-manipulation", RADIUS.pill,
                            showParagraphDiff
                              ? "bg-primary border-primary text-primary-foreground hover:bg-primary/90"
                              : "border border-muted-foreground/30 hover:border-muted-foreground/50",
                            suggestions.length === 0 && "opacity-50 cursor-not-allowed"
                          )}
                          aria-label={showParagraphDiff ? tCommon('aria.disableDiffView') : suggestions.length === 0 ? tCommon('aria.addSuggestionFirstToEnableDiffView') : tCommon('aria.enableDiffView')}
                        >
                          <div
                            className={cn(
                              RADIUS.pill, "transition-all duration-200",
                              showParagraphDiff
                                ? "h-2.5 w-2.5 sm:h-2 sm:w-2 bg-primary-foreground"
                                : "h-2.5 w-2.5 sm:h-2 sm:w-2 bg-muted-foreground/50"
                            )}
                          />
                        </Button>
                      </OnboardingHint>
                    ) : (
                      <Button
                        variant="ghost"
                        disabled={suggestions.length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suggestions.length === 0) return;
                          if (showParagraphDiff) {
                            // Disable: clear persisted diff
                            setPersistedDiffBodySuggestionIds([]);
                            setPersistedDiffHeadingSuggestionIds([]);
                            setShowParagraphDiff(false);
                          } else {
                            // Enable: open discussion area and pre-select displayed suggestions
                            setShowDiscussionArea(true);
                            
                            // Determine which body suggestion is currently displayed
                            const displayedBodySuggestion = acceptedBodyProposal || (topVotedSuggestion?.type === 'BODY' ? topVotedSuggestion : null);
                            if (displayedBodySuggestion) {
                              setSelectedBodySuggestions([displayedBodySuggestion.id]);
                              setPersistedDiffBodySuggestionIds([displayedBodySuggestion.id]);
                            }
                            
                            // Determine which heading suggestion is currently displayed
                            const displayedHeadingSuggestion = acceptedTitleProposal || (topVotedSuggestion?.type === 'TITLE' ? topVotedSuggestion : null);
                            if (displayedHeadingSuggestion) {
                              setSelectedHeadingSuggestions([displayedHeadingSuggestion.id]);
                              setPersistedDiffHeadingSuggestionIds([displayedHeadingSuggestion.id]);
                            }
                            
                            setShowParagraphDiff(true);
                          }
                        }}
                        className={cn(
                          "h-5 w-5 sm:h-5 sm:w-5 border touch-manipulation", RADIUS.pill,
                          showParagraphDiff
                            ? "bg-primary border-primary text-primary-foreground hover:bg-primary/90"
                            : "border border-muted-foreground/30 hover:border-muted-foreground/50",
                          suggestions.length === 0 && "opacity-50 cursor-not-allowed"
                        )}
                        aria-label={showParagraphDiff ? tCommon('aria.disableDiffView') : suggestions.length === 0 ? tCommon('aria.addSuggestionFirstToEnableDiffView') : tCommon('aria.enableDiffView')}
                      >
                        <div
                          className={cn(
                            RADIUS.pill, "transition-all duration-200",
                            showParagraphDiff
                              ? "h-2.5 w-2.5 sm:h-2 sm:w-2 bg-primary-foreground"
                              : "h-2.5 w-2.5 sm:h-2 sm:w-2 bg-muted-foreground/50"
                          )}
                        />
                      </Button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{showParagraphDiff ? tCommon('aria.disableDiffView') : suggestions.length === 0 ? tCommon('aria.addSuggestionFirstToEnableDiffView') : tCommon('aria.enableDiffView')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDiscussion();
                }}
                className={cn("h-11 w-11 sm:h-10 sm:w-10 touch-manipulation", RADIUS.pill)}
                aria-label={tCommon('aria.toggleDiscussion')}
              >
                <Icon name="MessageSquare" className="h-5 w-5 sm:h-4 sm:w-4 text-foreground" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHistory();
                }}
                className={cn("h-11 w-11 sm:h-10 sm:w-10 touch-manipulation", RADIUS.pill)}
                aria-label={tCommon('aria.toggleHistory')}
              >
                <Icon name="History" className="h-5 w-5 sm:h-4 sm:w-4 text-foreground" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                className={cn("h-11 w-11 sm:h-10 sm:w-10 touch-manipulation", RADIUS.pill)}
                aria-label={tCommon('aria.suggestEdit')}
              >
                <Icon name="Edit" className="h-5 w-5 sm:h-4 sm:w-4 text-foreground" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex gap-2 flex-wrap items-center">
                {/* Toggle between Body and Heading */}
                {availableTypes.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {suggestionType === 'TITLE' ? (isDocumentTitle ? "Title" : "Heading") : "Body"}
                    </span>
                    <Switch
                      checked={suggestionType === 'TITLE'}
                      onCheckedChange={(checked) => {
                        const newType = checked ? 'TITLE' : 'BODY';
                        // Preserve text when switching - if user has typed something, keep it
                        // Otherwise, initialize with accepted text for the new type
                        if (!suggestionText.trim()) {
                          // No user input yet - initialize with accepted text for new type
                          setSuggestionText(newType === 'TITLE' ? acceptedHeadingText : acceptedBodyText);
                        }
                        // If user has typed something, preserve it (suggestionText state maintains value)
                        setSuggestionType(newType);
                        if (newType === 'TITLE') {
                          setSuggestionHeadingLevel(acceptedHeadingLevel);
                        }
                      }}
                    />
                  </div>
                ) : (
                  // Only one type available - show label without switch
                  <span className="text-sm text-muted-foreground">
                    {suggestionType === 'TITLE' ? (isDocumentTitle ? "Title" : "Heading") : "Body"}
                  </span>
                )}
                {suggestionType === 'TITLE' && (
                  <Select
                    value={suggestionHeadingLevel}
                    onValueChange={(value: HeadingLevel) => setSuggestionHeadingLevel(value)}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue placeholder={t('editor.headingLevelPlaceholder')} />
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
              {!canAddProposals && (
                <p className={`text-sm mr-auto ${COLORS.status.active}`}>
                  Proposal cutoff has passed. New proposals are disabled.
                </p>
              )}
              <Button 
                size="sm" 
                onClick={handleSubmitSuggestion}
                disabled={!canAddProposals}
              >
                <Icon name="PlusCircle" className="h-4 w-4 mr-1" />
                Submit Suggestion
              </Button>
            </div>
          </div>
        )}
      </div>

      {showDiscussionArea && (
        <div className={cn(documentSpacing.paragraph, "pl-6 border-l-2 border-primary/20")} onClick={(e) => e.stopPropagation()}>
          {suggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground italic text-center py-6">
              No suggestions yet. Use the edit button to add the first suggestion.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6">
                {/* Filter and sort controls use consistent spacing */}
                {/* Show hint for first suggestion */}
                {suggestions.length === 1 && !hasSeenHint('first-suggestion-shown') && (
                  <OnboardingHint
                    hintKey="first-suggestion-shown"
                    message={tOnboarding('firstSuggestionShown')}
                    variant="tip"
                    position="inline"
                    showOnce={true}
                    delay={500}
                  />
                )}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-muted-foreground">
                    {filteredAndSortedSuggestions.length} {filteredAndSortedSuggestions.length !== suggestions.length && `of ${suggestions.length} `}
                    Suggestion{suggestions.length !== 1 ? "s" : ""}
                    {suggestions.some((p) => p.approved) && " (including accepted)"}
                  </div>
                  {(selectedBodySuggestions.length > 0 || selectedHeadingSuggestions.length > 0) && (
                    <div className="text-xs text-muted-foreground">
                      {selectedBodySuggestions.length > 0 && `${selectedBodySuggestions.length}/2 body`}
                      {selectedBodySuggestions.length > 0 && selectedHeadingSuggestions.length > 0 && ' • '}
                      {selectedHeadingSuggestions.length > 0 && `${selectedHeadingSuggestions.length}/2 heading`}
                      {' selected for comparison'}
                    </div>
                  )}
                </div>
                
                {/* Onboarding hints for suggestion selection */}
                {((selectedBodySuggestions.length === 1 || selectedHeadingSuggestions.length === 1) && !hasSeenHint('suggestion-selected-for-comparison')) && (
                  <OnboardingHint
                    hintKey="suggestion-selected-for-comparison"
                    message={tOnboarding('suggestionSelectedForComparison')}
                    variant="info"
                    position="inline"
                    showOnce={true}
                    delay={300}
                  />
                )}
                {((selectedBodySuggestions.length === 2 || selectedHeadingSuggestions.length === 2) && !hasSeenHint('two-suggestions-compared')) && (
                  <OnboardingHint
                    hintKey="two-suggestions-compared"
                    message={tOnboarding('twoSuggestionsCompared')}
                    variant="highlight"
                    position="inline"
                    showOnce={true}
                    delay={300}
                  />
                )}
                
                {/* Filtering and Sorting Controls - Stack on mobile, inline on tablet+ */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name="Filter" className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterBy} onValueChange={(value: 'all' | 'accepted' | 'pending' | 'needsVotes') => setFilterBy(value)}>
                      <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('suggestions.filterAll')}</SelectItem>
                        <SelectItem value="pending">{t('suggestions.filterPending')}</SelectItem>
                        <SelectItem value="accepted">{t('suggestions.filterAccepted')}</SelectItem>
                        <SelectItem value="needsVotes">{t('suggestions.filterNeedsVotes')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Icon name="ArrowUpDown" className="h-4 w-4 text-muted-foreground" />
                    <Select value={sortBy} onValueChange={(value: 'votePercentage' | 'date' | 'status') => setSortBy(value)}>
                      <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="votePercentage">{t('suggestions.sortByVotes')}</SelectItem>
                        <SelectItem value="date">{t('suggestions.sortByDate')}</SelectItem>
                        <SelectItem value="status">{t('suggestions.sortByStatus')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Show View Full Context button whenever there are suggestions */}
              {(bodySuggestions.length > 0 || titleSuggestions.length > 0) && showContextButton && (
                <div className="flex justify-end mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Use the first available suggestion if none are selected
                      // Prefer body suggestions, then heading suggestions
                      const suggestionToExpand = selectedBodySuggestion1 || selectedHeadingSuggestion1 || bodySuggestions[0] || titleSuggestions[0];
                      if (suggestionToExpand) {
                        setEnhancedDiffSuggestion(suggestionToExpand);
                      }
                    }}
                    className="gap-2"
                  >
                    <Icon name="Expand" className="h-4 w-4" />
                    View Full Context
                  </Button>
                </div>
              )}


              {filteredAndSortedSuggestions.length === 0 ? (
                <div className="text-sm text-muted-foreground italic text-center py-6">
                  No suggestions match the current filter.
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {filteredAndSortedSuggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      totalUsers={totalUsers}
                      currentUser={currentUser}
                      allCollaborators={allCollaborators}
                      documentOptions={document.options}
                      isSelected={
                        suggestion.type === 'BODY' 
                          ? selectedBodySuggestions.includes(suggestion.id)
                          : selectedHeadingSuggestions.includes(suggestion.id)
                      }
                      selectionIndex={
                        suggestion.type === 'BODY'
                          ? selectedBodySuggestions.indexOf(suggestion.id)
                          : selectedHeadingSuggestions.indexOf(suggestion.id)
                      }
                      onToggleSelect={(id) => handleToggleSuggestion(id, suggestion.type)}
                      onVote={handleVote}
                      onComment={onComment}
                      onDeleteComment={onDeleteComment}
                      onDeleteProposal={onDeleteProposal}
                      onLoadMoreComments={onLoadMoreComments}
                      onUpvoteComment={onUpvoteComment}
                      originalText={suggestion.type === 'BODY' ? acceptedBodyText : acceptedHeadingText}
                      selectedSuggestion1={suggestion.type === 'BODY' ? selectedBodySuggestion1 : selectedHeadingSuggestion1}
                      selectedSuggestion2={suggestion.type === 'BODY' ? selectedBodySuggestion2 : selectedHeadingSuggestion2}
                      votingState={votingState}
                      setVotingState={setVotingState}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showHistory && (
        <div className={cn(documentSpacing.paragraph, "pl-6 border-l-2 border-primary/20")} onClick={(e) => e.stopPropagation()}>
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
                  : `${formatDate(acceptedAt)} ${formatTime(acceptedAt, { hour: '2-digit', minute: '2-digit' })}`;
                const isTitleChange = (entry.type || '').toUpperCase() === 'TITLE';
                const headingLevelLabel = entry.headingLevel ? entry.headingLevel.toUpperCase() : undefined;

                return (
                  <div
                    key={entry.id}
                    className={cn('p-4 bg-muted/40 space-y-2 min-w-0', RADIUS.control, !organization?.brandingColor && 'ring-1 ring-primary/10')}
                    style={organization?.brandingColor ? { borderColor: organization.brandingColor, borderWidth: '2px', borderStyle: 'solid' } : undefined}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {entry.user?.name || "Unknown collaborator"}
                      </span>
                      <span className="text-xs text-muted-foreground">{formattedDate}</span>
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground whitespace-normal min-w-0 max-w-full">
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
              {similarSuggestions.map((similar) => (
                <div key={similar.id} className={cn('p-3 border bg-muted/30', RADIUS.panel)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{similar.user.name}</span>
                    <div className="flex items-center gap-2">
                      {similar.approved && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Accepted</span>}
                      <span className="text-xs text-muted-foreground">
                        {calculateVoteCounts(similar.votes || []).pro} votes
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
