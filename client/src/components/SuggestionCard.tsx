import { Suggestion, User, DocumentOptions, Organization, Comment } from "../types";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Icon } from "./ui/Icon";
import { Textarea } from "./ui/textarea";
import { DiffViewer } from "./DiffViewer";
import { Switch } from "./ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "./ui/utils";
import { toast } from "sonner";
import { getUserColor, getUserColorForText } from "../lib/userColors";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useScreenSize } from "../contexts/ScreenSizeContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useTimezone } from "../hooks/useTimezone";
import { SPACING, COLORS, HIERARCHY, TOUCH_TARGETS, NAVIGATION, VOTE, RADIUS } from "../lib/designSystem";
import { useDesignSystemLabels } from "../hooks/useDesignSystemLabels";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { logger } from "../lib/logger";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingHint } from "./OnboardingHint";
import { normalizeComment, isOptimisticComment } from "../utils/optimisticUpdates";
import { useVoteButtonHandler } from "../hooks/useVoteButtonHandler";
import { calculateVoteCounts, calculateApprovalPercentage } from "../utils/voteCalculations";
import { commentsApi } from "../lib/api";

interface SuggestionCardProps {
  suggestion: Suggestion;
  totalUsers: number;
  currentUser: User;
  allCollaborators?: User[];
  isSelected?: boolean;
  selectionIndex?: number;
  onToggleSelect?: (suggestionId: string) => void;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void> | void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
  onDeleteComment?: (suggestionId: string, commentId: string) => Promise<void>;
  onEditComment?: (suggestionId: string, commentId: string, text: string) => Promise<void>;
  onLoadMoreComments?: (suggestionId: string, offset: number) => Promise<Comment[]>;
  originalText?: string;
  showDiffInline?: boolean;
  documentContext?: { documentId: string; documentTitle: string; paragraphTitle?: string };
  onNavigateToDocument?: (documentId: string) => void;
  tabBadge?: React.ReactNode;
  showHistoryButton?: boolean;
  historyCount?: number;
  onToggleHistory?: () => void;
  diffHighlightColor?: 'yellow' | 'green';
  key?: React.Key;
  documentOptions?: DocumentOptions;
  organization?: Organization | null;
  organizationBorderColor?: string | null;
  ranking?: {
    index: number;
    score: number;
    isControversial?: boolean;
  };
  selectedSuggestion1?: Suggestion;  // For comparison
  selectedSuggestion2?: Suggestion;  // For comparison (optional)
  customContentSection?: React.ReactNode; // Custom content to replace text/diff section
  customActions?: React.ReactNode; // Custom action buttons to add after voting section
  /** Optional extra actions (e.g. icon-only delete) on the same row as Details / vote buttons */
  extraActionsInRow?: React.ReactNode;
  onDeleteProposal?: (suggestionId: string) => Promise<void>; // Optional delete handler
  /** Called after upvote/remove so parent can update local state (document or structure proposals). */
  onUpvoteComment?: (suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => void;
  // Optional: Voting state management (only needed for document proposals)
  votingState?: Set<string>;
  setVotingState?: React.Dispatch<React.SetStateAction<Set<string>>>;
}


function SuggestionCardComponent({
  suggestion,
  totalUsers,
  currentUser,
  allCollaborators = [],
  isSelected = false,
  documentOptions,
  selectionIndex: _selectionIndex = -1,
  onToggleSelect,
  onVote,
  onComment,
  onDeleteComment,
  onEditComment,
  onLoadMoreComments,
  originalText,
  showDiffInline = false,
  documentContext,
  onNavigateToDocument,
  tabBadge,
  showHistoryButton,
  historyCount,
  onToggleHistory,
  diffHighlightColor = 'yellow',
  organization,
  organizationBorderColor,
  ranking,
  selectedSuggestion1,
  selectedSuggestion2,
  customContentSection,
  customActions,
  extraActionsInRow,
  onDeleteProposal,
  onUpvoteComment,
  votingState,
  setVotingState,
}: SuggestionCardProps) {
  const { isMobile } = useScreenSize();
  useOnboarding();
  const { t } = useTranslation('common');
  const { t: tDoc } = useTranslation('documents');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { voteLabels } = useDesignSystemLabels();
  
  const [commentText, setCommentText] = useState("");
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [isThreadExpanded, setIsThreadExpanded] = useState(false);
  const [commentSort, setCommentSort] = useState<'newest' | 'top'>('newest');
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(() => {
    // Auto-expand replies for comments with 3 or fewer replies
    const autoExpanded = new Set<string>();
    const topLevel = suggestion.comments.filter(c => !c.parentId);
    topLevel.forEach(comment => {
      const replyCount = suggestion.comments.filter(c => c.parentId === comment.id).length;
      if (replyCount > 0 && replyCount <= 3) {
        autoExpanded.add(comment.id);
      }
    });
    return autoExpanded;
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [loadedCommentCount, setLoadedCommentCount] = useState(() => {
    // Initialize with actual loaded comments count
    return suggestion.comments.filter(c => !c.deletedAt).length;
  });
  const [commentFieldErrors, setCommentFieldErrors] = useState<Record<string, string>>({});
  const [replyFieldErrors, setReplyFieldErrors] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [commentToDeleteId, setCommentToDeleteId] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const { t: tCommon } = useTranslation('common');
  
  // Update loaded count when comments change (e.g., via WebSocket)
  useEffect(() => {
    const currentCount = suggestion.comments.filter(c => !c.deletedAt).length;
    if (currentCount > loadedCommentCount) {
      setLoadedCommentCount(currentCount);
    }
  }, [suggestion.comments.length, loadedCommentCount]);

  // Track vote changes to ensure re-renders when votes update via WebSocket
  // Create a dependency string from vote IDs and counts to detect changes
  const voteChangeKey = `${suggestion.votes.length}-${suggestion.votes.map(v => `${v.id}:${v.vote}`).join(',')}`;
  
  // Track partial vote counts from WebSocket updates (typed property)
  // This ensures the vote bar updates immediately when updates arrive
  const partialCounts = suggestion.partialVoteCounts;
  const voteCountsKey = partialCounts 
    ? `${partialCounts.pro || 0}-${partialCounts.contra || 0}-${partialCounts.neutral || 0}-${partialCounts.total || 0}`
    : '';
  
  // Use a ref to track the previous voteChangeKey to only update when it actually changes
  const prevVoteChangeKeyRef = useRef<string>('');
  const prevVoteCountsKeyRef = useRef<string>('');
  
  // Get timezone-aware date formatting functions
  const { formatRelativeTime, formatDateTime } = useTimezone();
  
  // Force re-render when votes change by using a state variable that updates
  // This ensures the component always re-renders when vote data changes
  const [, setVoteUpdateTrigger] = useState(0);
  
  useEffect(() => {
    // Update if voteChangeKey changed (full vote updates)
    if (voteChangeKey && voteChangeKey !== prevVoteChangeKeyRef.current) {
      prevVoteChangeKeyRef.current = voteChangeKey;
      setVoteUpdateTrigger(prev => prev + 1);
    }
    
    // Also update if voteCountsKey changed (partial vote count updates)
    // This ensures the vote bar updates immediately when partial WebSocket updates arrive
    if (voteCountsKey && voteCountsKey !== prevVoteCountsKeyRef.current) {
      prevVoteCountsKeyRef.current = voteCountsKey;
      setVoteUpdateTrigger(prev => prev + 1);
    }
  }, [voteChangeKey, voteCountsKey]);

  // Define vote arrays outside useMemo so they're always available for JSX
  // These are used for displaying vote details (user names, etc.)
  const proVotes = (suggestion.votes || []).filter((v) => v.vote === 'PRO');
  const neutralVotes = (suggestion.votes || []).filter((v) => v.vote === 'NEUTRAL');
  const contraVotes = (suggestion.votes || []).filter((v) => v.vote === 'CONTRA');

  // Memoize vote count calculations to prevent unnecessary recalculations
  // Use partial vote counts from WebSocket if available (for instant status bar updates)
  // Always validate partial counts against votes array (source of truth)
  const voteCounts = useMemo(() => {
    // Calculate actual counts from votes array (source of truth) using utility
    const actualCounts = calculateVoteCounts(suggestion.votes);
    const actualProCount = actualCounts.pro;
    const actualNeutralCount = actualCounts.neutral;
    const actualContraCount = actualCounts.contra;
    const actualTotalVotes = actualCounts.total;
    
    // Use typed partial vote counts from WebSocket update if available
    const partialCountsForMemo = suggestion.partialVoteCounts;
    
    let proCount: number;
    let neutralCount: number;
    let contraCount: number;
    let totalVotes: number;
    
    if (partialCountsForMemo) {
      // Validate partial counts against votes array (source of truth)
      const partialTotal = partialCountsForMemo.total || 0;
      const partialPro = partialCountsForMemo.pro || 0;
      const partialNeutral = partialCountsForMemo.neutral || 0;
      const partialContra = partialCountsForMemo.contra || 0;
      
      // Check if partial counts match actual votes array
      const countsMatch = 
        partialTotal === actualTotalVotes &&
        partialPro === actualProCount &&
        partialNeutral === actualNeutralCount &&
        partialContra === actualContraCount;
      
      if (countsMatch) {
        // Use partial counts (faster, from WebSocket, validated)
        proCount = partialPro;
        neutralCount = partialNeutral;
        contraCount = partialContra;
        totalVotes = partialTotal;
      } else {
        // Mismatch detected - use votes array (source of truth)
        logger.warn('Vote counts mismatch, using votes array as source of truth', {
          proposalId: suggestion.id,
          partial: { pro: partialPro, neutral: partialNeutral, contra: partialContra, total: partialTotal },
          actual: { pro: actualProCount, neutral: actualNeutralCount, contra: actualContraCount, total: actualTotalVotes }
        });
        proCount = actualProCount;
        neutralCount = actualNeutralCount;
        contraCount = actualContraCount;
        totalVotes = actualTotalVotes;
      }
    } else {
      // No partial counts - calculate from votes array (source of truth)
      proCount = actualProCount;
      neutralCount = actualNeutralCount;
      contraCount = actualContraCount;
      totalVotes = actualTotalVotes;
    }
    
    const acceptanceThreshold = documentOptions?.acceptanceThreshold || 75;
    
    // Determine threshold calculation method: 'all_members' (default) or 'all_votes'
    // 'all_members': percentage of all eligible members
    // 'all_votes': percentage of actual votes cast
    const calculationMethod = documentOptions?.thresholdCalculationMethod || 'all_members';
    
    // Calculate approval percentage based on calculation method
    // For accepted proposals, always use all_votes (show actual vote distribution)
    let approvalPercentage: number;
    if (suggestion.approved && totalVotes > 0) {
      // Accepted proposals: use totalVotes as denominator (all_votes method)
      approvalPercentage = (proCount / totalVotes) * 100;
    } else {
      // Use utility function for consistency with backend
      approvalPercentage = calculateApprovalPercentage({
        proVotes: proCount,
        totalVotes: totalVotes,
        totalEligible: totalUsers,
        calculationMethod
      });
    }
    
    // A proposal is "accepted" (in agreed view) if:
    // 1. It has the approved flag set, AND
    // 2. Its text matches the paragraph content (originalText is the accepted text from paragraph)
    // 3. Both originalText and suggestion.text exist (safety checks)
    const isAccepted = suggestion.approved && 
      originalText !== undefined && 
      originalText !== null &&
      suggestion.text !== undefined &&
      suggestion.text !== null &&
      String(suggestion.text).trim() === String(originalText).trim();
    
    // For accepted proposals, don't show "not voted" section - show only actual vote distribution
    const notVotedCount = suggestion.approved 
      ? 0  // Don't show "not voted" for accepted proposals
      : Math.max(totalUsers - totalVotes, 0);

    // Calculate percentages for status bar
    // Use the SAME denominator as approval calculation for consistency
    // This ensures vote bar percentages match approval percentages
    let denominator: number;
    let notVotedDenominator: number; // Separate denominator for not-voted percentage
    
    if (suggestion.approved && totalVotes > 0) {
      // Accepted: show actual vote distribution (use totalVotes)
      denominator = totalVotes;
      notVotedDenominator = totalVotes; // Not shown anyway for accepted
    } else if (calculationMethod === 'all_members') {
      // all_members: use totalUsers (all eligible members) - same as approval calculation
      // Ensure we have a valid denominator
      denominator = totalUsers > 0 ? totalUsers : 1; // Fallback to 1 to prevent division by zero
      notVotedDenominator = totalUsers > 0 ? totalUsers : 1; // Same for not-voted
    } else {
      // all_votes: use totalVotes (actual votes cast) - same as approval calculation
      // If no votes yet, use totalUsers to show "not voted" section
      denominator = totalVotes > 0 ? totalVotes : (totalUsers > 0 ? totalUsers : 1);
      // For all_votes, don't show not-voted section (it's based on votes cast, not all members)
      notVotedDenominator = 1; // Will result in 0% when notVotedCount is divided by this
    }
    
    // Ensure denominator is never 0
    if (denominator === 0) {
      denominator = 1; // Prevent division by zero
    }
    if (notVotedDenominator === 0) {
      notVotedDenominator = 1;
    }
    
    const proPercentage = denominator > 0 ? (proCount / denominator) * 100 : 0;
    const neutralPercentage = denominator > 0 ? (neutralCount / denominator) * 100 : 0;
    const contraPercentage = denominator > 0 ? (contraCount / denominator) * 100 : 0;
    // For all_votes method, notVotedPercentage should be 0 (only show votes cast)
    // For all_members method, show not-voted as percentage of all members
    const notVotedPercentage = suggestion.approved 
      ? 0  // Don't show for accepted
      : (calculationMethod === 'all_votes' 
          ? 0  // Don't show not-voted section when using all_votes method
          : (notVotedDenominator > 0 ? (notVotedCount / notVotedDenominator) * 100 : 0));
    
    return {
      proCount,
      neutralCount,
      contraCount,
      totalVotes,
      approvalPercentage,
      isAccepted,
      notVotedCount,
      proPercentage,
      neutralPercentage,
      contraPercentage,
      notVotedPercentage,
      acceptanceThreshold,
      calculationMethod,
    };
  }, [suggestion.votes, suggestion.partialVoteCounts, suggestion.approved, suggestion.text, originalText, totalUsers, documentOptions?.acceptanceThreshold, documentOptions?.thresholdCalculationMethod]);

  // Use memoized vote counts
  const { proCount, neutralCount, contraCount, totalVotes, approvalPercentage, isAccepted, notVotedCount, proPercentage, neutralPercentage, contraPercentage, notVotedPercentage, acceptanceThreshold, calculationMethod } = voteCounts;

  // Use actual vote from proposal
  const currentUserVote = suggestion.votes.find((v) => v.userId === currentUser.id);
  
  // Check if current user voted during update (before full vote data arrives)
  // The server includes userId and vote in WebSocket updates
  const partialUpdateUserVote = partialCounts?.userId === currentUser.id 
    ? { userId: partialCounts.userId, vote: partialCounts.vote as 'PRO' | 'NEUTRAL' | 'CONTRA' }
    : null;
  
  // Use vote from array if available, otherwise use partial update vote
  // This ensures vote buttons show correct state even during updates
  const effectiveUserVote = currentUserVote || partialUpdateUserVote;
  
  // User has voted if we have their vote in the votes array OR in the partial update
  const hasVoted = !!effectiveUserVote;
  
  // Note: isVoting state is now managed by useVoteButtonHandler hook
  // The hook has a fallback timeout to clear isVoting after 1 second
  // WebSocket updates will update the vote in the UI, and the timeout will clear the loading state

  // Auto-expand comment thread when new comments arrive via WebSocket or optimistic updates, but only if:
  // 1. Thread is already expanded (user is viewing comments)
  // 2. It's a reply to a comment the current user made
  // 3. It's a reply to a comment the user is currently replying to
  // 4. It's an optimistic comment from the current user (they just posted it)
  const previousCommentCountRef = useRef(suggestion.comments.length);
  const previousCommentsRef = useRef<typeof suggestion.comments>([]);
  
  useEffect(() => {
    const currentCommentCount = suggestion.comments.length;
    const previousCommentCount = previousCommentCountRef.current;
    
    // Auto-expand comment threads that receive new replies
    if (currentCommentCount > previousCommentCount && isThreadExpanded) {
      const previousComments = previousCommentsRef.current;
      const newComments = suggestion.comments.filter(
        comment => !previousComments.some(prev => prev.id === comment.id)
      );
      
      // Expand parent comments that have new replies (including optimistic comments)
      newComments.forEach(newComment => {
        // Ensure parentId is a valid string (not null, undefined, or empty)
        const parentId = newComment.parentId;
        if (parentId && typeof parentId === 'string' && parentId.trim() !== '') {
          setExpandedReplies(prev => new Set([...prev, parentId]));
        }
      });
    }
    
    // Handle new comments (including optimistic comments)
    if (currentCommentCount > previousCommentCount) {
      const previousComments = previousCommentsRef.current;
      const newComments = suggestion.comments.filter(
        comment => !previousComments.some(prev => prev.id === comment.id)
      );
      
      // Check if any new comment should trigger expansion:
      // 1. Optimistic comment from current user (they just posted it)
      // 2. A reply to a comment the current user made
      // 3. A reply to the comment the user is currently replying to
      // 4. Top-level comment (if thread is expanded)
      const shouldExpand = newComments.some(newComment => {
        // If it's an optimistic comment from the current user, always expand
        if (isOptimisticComment(newComment.id) && newComment.userId === currentUser.id) {
          return true;
        }
        
        // Top-level comment, expand if thread is already expanded
        if (!newComment.parentId && isThreadExpanded) {
          return true;
        }
        
        // Check if it's a reply to user's comment
        if (newComment.parentId) {
          const parentComment = suggestion.comments.find(c => c.id === newComment.parentId);
          if (parentComment?.userId === currentUser.id) return true;
          
          // Check if it's a reply to the comment user is currently replying to
          if (replyingTo && newComment.parentId === replyingTo) return true;
        }
        
        return false;
      });
      
      // Expand thread if relevant
      if (shouldExpand) {
        setIsThreadExpanded(true);
      }
    }
    
    previousCommentCountRef.current = currentCommentCount;
    previousCommentsRef.current = [...suggestion.comments];
  }, [suggestion.comments, isThreadExpanded, currentUser.id, replyingTo]);

  // Auto-expand replies for comments with 3 or fewer replies when comments change
  // DISABLED: User preference is to keep comments closed by default
  // useEffect(() => {
  //   const topLevel = suggestion.comments.filter(c => !c.parentId);
  //   const newAutoExpanded = new Set<string>();
  //   topLevel.forEach(comment => {
  //     const replyCount = suggestion.comments.filter(c => c.parentId === comment.id).length;
  //     if (replyCount > 0 && replyCount <= 3) {
  //       newAutoExpanded.add(comment.id);
  //     }
  //   });
  //   // Merge with existing expanded (don't collapse what user manually expanded)
  //   setExpandedReplies(prev => new Set([...prev, ...newAutoExpanded]));
  // }, [suggestion.comments]);
  
  // Check if vote changes are allowed
  const voteChangeAllowed = documentOptions?.voteChangeAllowed !== false; // Default to true
  const isVoteLocked = hasVoted && !voteChangeAllowed;
  
  // Check if voting is anonymous
  const isAnonymous = documentOptions?.votingAnonymous === true;

  // Use vote button handler hook to consolidate vote button logic
  const { handleVoteClick, isVoting } = useVoteButtonHandler({
    suggestionId: suggestion.id,
    onVote,
    votingState,
    setVotingState,
    isVoteLocked,
  });
  
  // Get users who haven't voted yet (exclude placeholder votes synthesized from counts)
  // Handle anonymous voting where userId might be undefined
  const votedUserIds = new Set(
    suggestion.votes.filter(v => !v.isPlaceholder).map(v => v.userId).filter((id): id is string => !!id)
  );
  const usersWhoHaventVoted = allCollaborators.filter(user => !votedUserIds.has(user.id));

  // Organize comments into threads (memoized for performance)
  const topLevelComments = useMemo(() => {
    const list = suggestion.comments
      .map(c => normalizeComment(c)) // Normalize before filtering (converts null to undefined)
      .filter(c => {
        // A comment is top-level ONLY if parentId is undefined or empty string
        const parentId = c.parentId;
        const isTopLevel = parentId === undefined || parentId === '' ||
                           (typeof parentId === 'string' && parentId.trim() === '');
        return isTopLevel && !c.deletedAt;
      });
    if (commentSort === 'top') {
      return [...list].sort((a, b) => {
        const uA = a.upvoteCount ?? 0;
        const uB = b.upvoteCount ?? 0;
        if (uB !== uA) return uB - uA;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }
    return [...list].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [suggestion.comments, commentSort]);
  
  const repliesMap = useMemo(() => {
    const map = new Map<string, Comment[]>();
    suggestion.comments
      .map(c => normalizeComment(c)) // Normalize before processing
      .forEach(c => {
        // Include comments with valid parentId (must be a non-empty string)
        // Handle both normalized (undefined) and unnormalized (null) cases
        const parentId = c.parentId;
        if (parentId != null && typeof parentId === 'string' && parentId.trim() !== '' && !c.deletedAt) {
          // CRITICAL: Use trimmed parentId as key to ensure consistent matching
          // This prevents issues where parentId might have whitespace
          const normalizedParentId = parentId.trim();
          if (!map.has(normalizedParentId)) {
            map.set(normalizedParentId, []);
          }
          map.get(normalizedParentId)!.push(c);
        }
      });
    return map;
  }, [suggestion.comments]);
  
  const getReplies = (commentId: string) => {
    const normalizedId = commentId.trim();
    const replies = repliesMap.get(normalizedId) || [];
    if (commentSort === 'top') {
      return [...replies].sort((a, b) => {
        const uA = a.upvoteCount ?? 0;
        const uB = b.upvoteCount ?? 0;
        if (uB !== uA) return uB - uA;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }
    return [...replies].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  };

  const handleComment = () => {
    // Client-side validation
    const trimmedText = commentText.trim();
    if (!trimmedText) {
      setCommentFieldErrors({ text: 'Comment text is required' });
      return;
    }
    if (trimmedText.length > 1000) {
      setCommentFieldErrors({ text: 'Comment must be between 1 and 1000 characters' });
      return;
    }
    
    // Clear errors and submit
    setCommentFieldErrors({});
    onComment(suggestion.id, trimmedText);
    setCommentText("");
    setIsThreadExpanded(true); // Auto-expand after posting
  };

  const handleReply = (parentId: string) => {
    // Client-side validation
    const trimmedText = replyText.trim();
    if (!trimmedText) {
      setReplyFieldErrors({ text: 'Reply text is required' });
      return;
    }
    if (trimmedText.length > 1000) {
      setReplyFieldErrors({ text: 'Reply must be between 1 and 1000 characters' });
      return;
    }
    
    // Clear errors and submit
    setReplyFieldErrors({});
    // Ensure parent comment is expanded so reply will be visible when it arrives
    setExpandedReplies(prev => new Set([...prev, parentId]));
    setIsThreadExpanded(true);
    onComment(suggestion.id, trimmedText, parentId);
    setReplyText("");
    setReplyingTo(null);
  };

  const handleUpvoteClick = async (comment: Comment) => {
    if (comment.deletedAt || upvotingCommentId === comment.id) return;
    setUpvotingCommentId(comment.id);
    try {
      const data = comment.userUpvoted
        ? await commentsApi.removeUpvoteComment(comment.id)
        : await commentsApi.upvoteComment(comment.id);
      onUpvoteComment?.(suggestion.id, comment.id, data);
    } catch (err) {
      logger.error('Comment upvote failed', err);
      toast.error(t('toasts.failedToUpdateUpvote'));
    } finally {
      setUpvotingCommentId(null);
    }
  };

  const startReply = (commentId: string) => {
    setReplyingTo(commentId);
    setReplyText("");
    setIsThreadExpanded(true);
  };

  const startEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.text);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditText("");
  };

  const handleSaveEdit = async () => {
    if (!editingCommentId || !onEditComment) return;
    
    const trimmedText = editText.trim();
    if (!trimmedText) {
      toast.error(t('validation.commentRequired'));
      return;
    }
    if (trimmedText.length > 1000) {
      toast.error(t('validation.commentLength'));
      return;
    }

    try {
      await onEditComment(suggestion.id, editingCommentId, trimmedText);
      setEditingCommentId(null);
      setEditText("");
      toast.success(t('toasts.commentUpdated'));
    } catch (err) {
      logger.error('Failed to update comment:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('15 minutes')) {
        toast.error(t('toasts.commentsEditWindow'));
      } else {
        toast.error(t('toasts.failedToUpdateComment'));
      }
    }
  };

  const getRemainingEditTime = (createdAt: string): number | null => {
    const created = new Date(createdAt);
    const now = new Date();
    const editWindowMs = 15 * 60 * 1000; // 15 minutes
    const elapsed = now.getTime() - created.getTime();
    const remaining = editWindowMs - elapsed;
    return remaining > 0 ? Math.ceil(remaining / 60000) : null; // Return minutes remaining
  };

  const handleDelete = (commentId: string) => {
    if (!onDeleteComment) return;
    setCommentToDeleteId(commentId);
  };

  const confirmDeleteComment = async () => {
    if (!onDeleteComment || !commentToDeleteId) return;
    setIsDeletingComment(true);
    try {
      await onDeleteComment(suggestion.id, commentToDeleteId);
      setCommentToDeleteId(null);
    } finally {
      setIsDeletingComment(false);
    }
  };

  const handleLoadMoreComments = async () => {
    if (!onLoadMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const newComments = await onLoadMoreComments!(suggestion.id, loadedCommentCount);
      setLoadedCommentCount(prev => prev + newComments.length);
    } catch (err) {
      toast.error(t('toasts.failedToLoadMoreComments'));
    } finally {
      setLoadingMoreComments(false);
    }
  };

  const handleDeleteProposal = async () => {
    if (!onDeleteProposal) return;
    setIsDeleting(true);
    try {
      await onDeleteProposal(suggestion.id);
      setShowDeleteConfirm(false);
    } catch (err) {
      // Error already handled in handleProposalDelete utility
      logger.error('Failed to delete proposal:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Check if user is creator and proposal is not approved
  const isCreator = suggestion.user.id === currentUser?.id;
  const canDelete = onDeleteProposal && isCreator && !suggestion.approved;

  const totalCommentCount = suggestion.commentCount || suggestion.comments.length;
  const hasMoreComments = totalCommentCount > loadedCommentCount;

  // Get user color for this suggestion
  const userColor = getUserColor(suggestion.user.id);
  const userTextColor = getUserColorForText(suggestion.user.id);
  const paragraphTitleDistinct =
    documentContext?.paragraphTitle &&
    documentContext?.paragraphTitle.trim() &&
    documentContext?.documentTitle &&
    documentContext.documentTitle.trim() &&
    documentContext.paragraphTitle.trim() !== documentContext.documentTitle.trim();

  // Determine card border style
  const getCardStyle = () => {
    if (organizationBorderColor) {
      return { borderColor: organizationBorderColor, borderWidth: '2px' };
    }
    if (isSelected) {
      return { borderColor: userColor, borderWidth: '2px' };
    }
    return undefined;
  };

  const cardStyle = getCardStyle();

  return (
    <Card 
      className="p-0 overflow-hidden transition-all"
      style={cardStyle}
    >
      {/* Progress Bar at the very top */}
      <div 
        key={`progress-${suggestion.id}`}
        className="flex h-2.5 w-full overflow-hidden cursor-pointer group relative"
        style={{ backgroundColor: 'var(--vote-background)', minHeight: '10px' }}
        onClick={() => setShowVoteDetails(!showVoteDetails)}
        title={tDoc('suggestions.votingDetailsTitle')}
        aria-label={tDoc('suggestions.votingProgressAria')}
      >
        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground font-medium bg-background/90 px-2 py-0.5 rounded">
            Click for details
          </span>
        </div>
        {/* Not voted first (gray) */}
        {notVotedPercentage > 0 && (
          <div
            key={`not-voted-${suggestion.id}-${notVotedCount}`}
            className="transition-all duration-300"
            style={{ 
              width: `${notVotedPercentage}%`,
              backgroundColor: 'var(--vote-not-voted)',
              flex: `0 0 ${notVotedPercentage}%`
            }}
            title={isAnonymous 
              ? `Not voted: ${notVotedCount}` 
              : `Not voted: ${notVotedCount} - ${usersWhoHaventVoted.map(u => u.name).join(', ')}`}
          />
        )}
        {/* Reject votes */}
        {contraPercentage > 0 && (
          <div
            key={`contra-${suggestion.id}-${contraCount}`}
            className="transition-all duration-300"
            style={{ 
              width: `${contraPercentage}%`,
              backgroundColor: 'var(--vote-contra)',
              flex: `0 0 ${contraPercentage}%`
            }}
            title={isAnonymous 
              ? `Reject: ${contraCount}` 
              : `Reject: ${contraCount} - ${contraVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
          />
        )}
        {/* Neutral votes */}
        {neutralPercentage > 0 && (
          <div
            key={`neutral-${suggestion.id}-${neutralCount}`}
            className="transition-all duration-300"
            style={{ 
              width: `${neutralPercentage}%`,
              backgroundColor: 'var(--vote-neutral)',
              flex: `0 0 ${neutralPercentage}%`
            }}
            title={isAnonymous 
              ? `Neutral: ${neutralCount}` 
              : `Neutral: ${neutralCount} - ${neutralVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
          />
        )}
        {/* Approve votes */}
        {proPercentage > 0 && (
          <div
            key={`pro-${suggestion.id}-${proCount}`}
            className="transition-all duration-300"
            style={{ 
              width: `${proPercentage}%`,
              backgroundColor: 'var(--vote-pro)',
              flex: `0 0 ${proPercentage}%`
            }}
            title={isAnonymous 
              ? `Approve: ${proCount}` 
              : `Approve: ${proCount} - ${proVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
          />
        )}
        {/* Fallback: Show message when vote bar is empty but votes should exist */}
        {proPercentage === 0 && neutralPercentage === 0 && contraPercentage === 0 && notVotedPercentage === 0 && (
          <div className="flex items-center justify-center h-2.5 px-2">
            <span className="text-[10px] text-muted-foreground">
              {isVoteLocked ? 'Vote locked - loading vote data...' : 'No votes yet'}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <div className="p-4 md:p-6 min-w-0">
        {/* Document Context - Prominent header section */}
        {/* Border opacity /60: Standard border for main sections */}
        {documentContext && (
          <div className="mb-6 border-b border-border/60">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon name="FileText" className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <button
                    onClick={() => onNavigateToDocument?.(documentContext.documentId)}
                    className={cn('font-semibold hover:underline transition-colors text-left text-sm leading-tight truncate min-w-0 max-w-full', COLORS.status.info, 'hover:opacity-90')}
                  >
                    {documentContext.documentTitle}
                  </button>
                  {paragraphTitleDistinct && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">•</span>
                      <span className="text-muted-foreground text-sm">{documentContext.paragraphTitle}</span>
                    </>
                  )}
                  {organization && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">•</span>
                      <Badge
                        className="text-xs px-2.5 py-1 font-medium border"
                        style={{
                          backgroundColor: organization.brandingColor ? `${organization.brandingColor}15` : undefined,
                          borderColor: organization.brandingColor || undefined,
                          color: organization.brandingColor || undefined,
                        }}
                      >
                        {organization.name}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                {ranking && (
                  <div className="flex items-center gap-3 text-xs">
                    <Badge className="font-bold bg-purple-100 text-purple-700 border-purple-200 px-2.5 py-1 text-xs">
                      #{ranking.index}
                    </Badge>
                    <Icon name="TrendingUp" className="h-3 w-3 text-[var(--badge-purple-text)]" />
                    <span className="text-muted-foreground">Score: {ranking.score}</span>
                    {ranking.isControversial && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1">
                          <Icon name="AlertTriangle" className="h-3 w-3" />
                          Controversial
                        </Badge>
                      </>
                    )}
                  </div>
                )}
                {tabBadge && tabBadge}
                {showHistoryButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleHistory}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Icon name="History" className="h-3.5 w-3.5 mr-1.5" />
                    History ({historyCount})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Proposal Title & Description - for rule proposals, structure proposals, etc. */}
        {(suggestion.title || suggestion.description) && (
          <div className="mb-4">
            {suggestion.title && (
              <h3 className="font-semibold text-lg text-foreground mb-2">{suggestion.title}</h3>
            )}
            {suggestion.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{suggestion.description}</p>
            )}
          </div>
        )}
        
        {/* Info & Voting Section */}
        <div className={cn("flex flex-col", SPACING.content.gap, SPACING.section.margin)}>
          {/* Row 1: Checkbox + Avatar + Name + Badges + Voting buttons + Details button */}
          <div className={cn("flex items-center flex-wrap gap-2", SPACING.content.responsive)}>
            {/* Checkbox */}
            {onToggleSelect && (
              <OnboardingHint
                hintKey="suggestion-checkbox-explanation"
                message={tOnboarding('suggestionCheckboxExplanation')}
                variant="info"
                position="right"
                showOnce={true}
                delay={500}
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(suggestion.id)}
                    className={cn(
                      isSelected && "border-2"
                    )}
                    style={isSelected ? {
                      borderColor: userColor,
                      backgroundColor: isSelected ? userColor : undefined,
                      color: userTextColor
                    } : undefined}
                  />
                </div>
              </OnboardingHint>
            )}
            {/* Avatar */}
            <Avatar className="h-9 w-9 flex-shrink-0 border-2 shadow-sm" style={{ borderColor: getUserColor(suggestion.user.id) }}>
              <AvatarImage src={suggestion.user.avatar} />
              <AvatarFallback className="text-xs font-medium">
                {suggestion.user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            {/* Name */}
            <span className={cn("text-sm font-semibold", COLORS.text.primary)}>{suggestion.user.name}</span>
            {/* Heading Badge */}
            {suggestion.type === 'TITLE' && (
              <Badge variant="outline" className="text-xs px-2.5 py-1 font-medium">
                Heading{suggestion.headingLevel ? ` (${suggestion.headingLevel.toUpperCase()})` : ''}
              </Badge>
            )}
            {/* Accepted Badge */}
            {isAccepted && (
              <Badge variant="success" className="text-xs px-2.5 py-1 font-medium">
                Accepted ({Math.round(approvalPercentage)}%)
              </Badge>
            )}
            {/* Compare Badge */}
            {isSelected && (
              <Badge 
                className="text-xs px-2.5 py-1 font-medium"
                style={{
                  backgroundColor: userColor,
                  color: userTextColor
                }}
              >
                Compare
              </Badge>
            )}
            {/* Diff Preview Toggle - Only show if originalText is available */}
            {originalText !== undefined && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Switch
                        checked={showDiffPreview}
                        onCheckedChange={setShowDiffPreview}
                        className="h-4 w-7"
                        aria-label={showDiffPreview ? tDoc('suggestions.hideDiffView') : tDoc('suggestions.showDiffView')}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{showDiffPreview ? "Hide diff view" : "Show diff view"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Vote Actions */}
            <div className={cn("flex items-center flex-shrink-0 whitespace-nowrap", SPACING.content.responsive)}>
              {isVoteLocked ? (
                <div className={cn("text-xs px-2.5 py-1.5 whitespace-nowrap bg-muted/50", RADIUS.control, COLORS.text.secondary)}>
                  Vote locked
                </div>
              ) : (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant={effectiveUserVote?.vote === 'PRO' ? "default" : "ghost"}
                          onClick={() => handleVoteClick('PRO')}
                          disabled={isVoteLocked || isVoting}
                          aria-label={voteLabels.pro}
                          className={cn(
                            "size-9 shrink-0", RADIUS.control,
                            effectiveUserVote?.vote !== 'PRO' && "text-foreground dark:text-foreground border border-border/50 dark:border-border/50 hover:border-border dark:hover:border-border",
                            effectiveUserVote?.vote === 'PRO' && cn(VOTE.buttonPro, "shadow-sm border-0"),
                            (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isVoting ? (
                            <div className={cn(NAVIGATION.icon.sm, "border-2 border-current border-t-transparent animate-spin", RADIUS.pill)} />
                          ) : (
                            <Icon name="ThumbsUp" className={NAVIGATION.icon.sm} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{voteLabels.pro} this suggestion ({proCount} approved)</p>
                        <p className="text-xs mt-1 opacity-90">Suggestions need {acceptanceThreshold}% approval to be automatically accepted</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant={effectiveUserVote?.vote === 'NEUTRAL' ? "secondary" : "ghost"}
                          onClick={() => handleVoteClick('NEUTRAL')}
                          disabled={isVoteLocked || isVoting}
                          aria-label={voteLabels.neutral}
                          className={cn(
                            "size-9 shrink-0", RADIUS.control,
                            effectiveUserVote?.vote !== 'NEUTRAL' && "text-foreground dark:text-foreground border border-border/50 dark:border-border/50 hover:border-border dark:hover:border-border",
                            effectiveUserVote?.vote === 'NEUTRAL' && "bg-[var(--vote-neutral)]/20 hover:bg-[var(--vote-neutral)]/30 text-foreground border border-[var(--vote-neutral)]/40 dark:bg-[var(--vote-neutral)]/25 dark:border-[var(--vote-neutral)]/50",
                            (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isVoting ? (
                            <div className={cn(NAVIGATION.icon.sm, "border-2 border-current border-t-transparent animate-spin", RADIUS.pill)} />
                          ) : (
                            <Icon name="Minus" className={NAVIGATION.icon.sm} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{voteLabels.neutral} — neither approve nor reject ({neutralCount})</p>
                        <p className="text-xs mt-1 opacity-90">Use this if you're unsure or want to abstain</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant={effectiveUserVote?.vote === 'CONTRA' ? "destructive" : "ghost"}
                          onClick={() => handleVoteClick('CONTRA')}
                          disabled={isVoteLocked || isVoting}
                          aria-label={voteLabels.contra}
                          className={cn(
                            "size-9 shrink-0", RADIUS.control,
                            effectiveUserVote?.vote !== 'CONTRA' && "text-foreground dark:text-foreground border border-border/50 dark:border-border/50 hover:border-border dark:hover:border-border",
                            effectiveUserVote?.vote === 'CONTRA' && cn(VOTE.buttonContra, "shadow-sm border-0"),
                            (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isVoting ? (
                            <div className={cn(NAVIGATION.icon.sm, "border-2 border-current border-t-transparent animate-spin", RADIUS.pill)} />
                          ) : (
                            <Icon name="ThumbsDown" className={NAVIGATION.icon.sm} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{voteLabels.contra} this suggestion ({contraCount} rejected)</p>
                        <p className="text-xs mt-1 opacity-90">Rejected suggestions won't be automatically accepted</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              <div className="h-6 w-px bg-border/60 mx-1.5" aria-hidden="true" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVoteDetails(!showVoteDetails)}
                className={cn(NAVIGATION.button.icon, "px-3 text-xs font-medium", COLORS.text.secondary, "hover:" + COLORS.text.primary)}
                title={tDoc('suggestions.showVotingDetails')}
              >
                Details
              </Button>
              {canDelete && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        className={cn("size-9 shrink-0", RADIUS.control, COLORS.text.secondary, "hover:bg-destructive/10 hover:text-destructive")}
                        aria-label={isDeleting ? tDoc('suggestions.deletingAria') : tDoc('suggestions.deleteProposalAria')}
                        title={isDeleting ? 'Deleting...' : 'Delete proposal'}
                      >
                        {isDeleting ? (
                          <div className={cn(NAVIGATION.icon.sm, "border-2 border-current border-t-transparent animate-spin", RADIUS.pill)} />
                        ) : (
                          <Icon name="Trash2" className={NAVIGATION.icon.sm} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isDeleting ? 'Deleting...' : 'Delete this proposal'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {extraActionsInRow}
            </div>
          </div>
        </div>

        {/* Custom Actions */}
        {customActions && (
          <div className="w-full mb-6">
            {customActions}
          </div>
        )}

        {/* Text Content Section */}
        {customContentSection ? (
          <div className="w-full mb-6">
            {customContentSection}
          </div>
        ) : (
          <div className="w-full mb-6">
            {/* Suggestion Text or Diff */}
            {(showDiffInline || showDiffPreview) && originalText !== undefined ? (
              <div className="space-y-3">
                {/* Diff Viewer */}
                <div>
                  <DiffViewer
                    originalText={originalText || ''}
                    suggestion1Text={
                      selectedSuggestion1 && selectedSuggestion1.id !== suggestion.id
                        ? selectedSuggestion1.text
                        : suggestion.text
                    }
                    suggestion1Author={
                      selectedSuggestion1 && selectedSuggestion1.id !== suggestion.id
                        ? selectedSuggestion1.user.name
                        : suggestion.user.name
                    }
                    suggestion1UserId={
                      selectedSuggestion1 && selectedSuggestion1.id !== suggestion.id
                        ? selectedSuggestion1.user.id
                        : suggestion.user.id
                    }
                    suggestion2Text={
                      selectedSuggestion2 && selectedSuggestion2.id !== suggestion.id
                        ? selectedSuggestion2.text
                        : undefined
                    }
                    suggestion2Author={
                      selectedSuggestion2 && selectedSuggestion2.id !== suggestion.id
                        ? selectedSuggestion2.user.name
                        : undefined
                    }
                    suggestion2UserId={
                      selectedSuggestion2 && selectedSuggestion2.id !== suggestion.id
                        ? selectedSuggestion2.user.id
                        : undefined
                    }
                    highlightColor={diffHighlightColor}
                    inline={true}
                    showStatistics={false}
                  />
                </div>
              </div>
            ) : (
              <p className="text-base text-foreground font-medium leading-relaxed">
                "{suggestion.text}"
              </p>
            )}
          </div>
        )}

        {/* Vote Details (collapsible) */}
        {/* Border opacity /60: Standard border for main sections */}
        {/* mt-6: Creates space above the border, pt-6: Creates space below the border */}
        {showVoteDetails && (
          <div className="mt-6 space-y-4 border-t border-border/60 pt-6 animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground">
                  Requires {acceptanceThreshold}% approval
                  {calculationMethod === 'all_members' && (
                    <span className="ml-1 text-muted-foreground/70">
                      (of all {totalUsers} member{totalUsers === 1 ? '' : 's'})
                    </span>
                  )}
                  {calculationMethod === 'all_votes' && totalVotes > 0 && (
                    <span className="ml-1 text-muted-foreground/70">
                      (of {totalVotes} vote{totalVotes === 1 ? '' : 's'} cast)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 bg-[var(--status-approved-solid)]", RADIUS.pill)}></span>
                  <span className="font-medium">Approve</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 bg-[var(--status-active-solid)]", RADIUS.pill)}></span>
                  <span>Neutral</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 bg-[var(--status-rejected-solid)]", RADIUS.pill)}></span>
                  <span>Reject</span>
                </div>
                {!suggestion.approved && (
                  <div className="flex items-center gap-1">
                    <span className={cn("inline-block h-2 w-2 bg-muted", RADIUS.pill)}></span>
                    <span>Not voted</span>
                  </div>
                )}
              </div>
            </div>

            {/* Vote details expansion */}
            {/* Border opacity /40: Nested element borders (vote detail boxes) */}
            <div className={cn("space-y-4 p-6 bg-muted/40 text-xs border border-border/40", RADIUS.panel)}>
              {proVotes.length > 0 && (
                <div className="space-y-2">
                  <p className={cn('font-semibold text-xs', COLORS.status.success)}>
                    {isAnonymous ? `Approved: ${proCount}` : `Approved by:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-3">
                      {proVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className={cn(COLORS.statusBadge.success, 'text-xs px-2.5 py-1')}>
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {neutralVotes.length > 0 && (
                <div className="space-y-2">
                  <p className={cn('font-semibold text-xs', COLORS.status.info)}>
                    {isAnonymous ? `Neutral: ${neutralCount}` : `Neutral:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-3">
                      {neutralVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className={cn(COLORS.statusBadge.info, 'text-xs px-2.5 py-1')}>
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {contraVotes.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold text-red-700 dark:text-red-400 text-xs">
                    {isAnonymous ? `Rejected: ${contraCount}` : `Rejected by:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-3">
                      {contraVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className={cn(COLORS.statusBadge.error, 'text-xs px-2.5 py-1')}>
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {usersWhoHaventVoted.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold text-muted-foreground text-xs">Waiting for:</p>
                  <div className="flex flex-wrap gap-3">
                    {usersWhoHaventVoted.map(user => (
                      <Badge key={user.id} variant="outline" className="bg-muted border-border text-xs px-2.5 py-1">
                        {user.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Acceptance Status Messages */}
            {isAccepted && (
              <div className={cn('flex items-center gap-3 text-sm p-6 border', RADIUS.panel, COLORS.status.success, COLORS.statusBg.success, 'border-[var(--status-approved-border)]')}>
                <Icon name="CheckCircle2" className="h-4 w-4 flex-shrink-0" />
                <span className="font-semibold">This suggestion has been accepted and applied to the document!</span>
              </div>
            )}

            {approvalPercentage >= 50 && !isAccepted && (
              <div className={cn('flex items-center gap-3 text-sm p-6 border', RADIUS.panel, COLORS.status.info, COLORS.statusBg.info, 'border-[var(--status-active-border)]')}>
                <span className="font-medium">
                  Halfway to acceptance. {Math.max(acceptanceThreshold - approvalPercentage, 0).toFixed(0)}% more PRO needed.
                  {calculationMethod === 'all_members' && (
                    <span className="ml-1 opacity-90">
                      ({Math.ceil((acceptanceThreshold / 100) * totalUsers - proCount)} more PRO vote{Math.ceil((acceptanceThreshold / 100) * totalUsers - proCount) === 1 ? '' : 's'} needed)
                    </span>
                  )}
                </span>
              </div>
            )}
            
            {notVotedCount > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Icon name="Users" className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{notVotedCount} collaborator{notVotedCount === 1 ? '' : 's'} still need to vote.</span>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Comment Section */}
        <div className={cn(HIERARCHY.majorSection)}>
          <button
            onClick={() => setIsThreadExpanded(!isThreadExpanded)}
            className={cn("flex items-center justify-between w-full text-sm font-medium transition-colors py-2.5", COLORS.text.secondary, "hover:" + COLORS.text.primary)}
            aria-expanded={isThreadExpanded}
            aria-label={`${isThreadExpanded ? 'Hide' : 'Show'} discussion thread with ${totalCommentCount} comment${totalCommentCount === 1 ? '' : 's'}`}
          >
            <div className={cn("flex items-center", SPACING.content.inline)}>
              <Icon name="MessageSquare" className="h-4 w-4" />
              <span>Discussion ({totalCommentCount})</span>
            </div>
            <span className="text-xs">
              {isThreadExpanded ? "▲ Hide thread" : "▼ Show thread"}
            </span>
          </button>
          {totalCommentCount === 0 && (
            <div className="mt-1 flex justify-center">
              <button
                type="button"
                onClick={() => setIsThreadExpanded(true)}
                className={cn("text-xs font-medium text-center transition-colors", COLORS.text.secondary, "hover:" + COLORS.text.primary, TOUCH_TARGETS.button)}
                aria-label="Write the first comment"
              >
                No comments yet. Be the first to share your thoughts!
              </button>
            </div>
          )}

          {/* Expanded Discussion Thread */}
          {isThreadExpanded && (
          <div className={cn("pt-2", SPACING.content.gap, "animate-in slide-in-from-top-2 duration-200")}>
            {suggestion.comments.length > 0 ? (
              <div className={SPACING.content.gap}>
                <div className={cn("flex items-center justify-between flex-wrap", SPACING.tight.inline)}>
                  <span className={cn("text-xs", COLORS.text.secondary)}>Sort:</span>
                  <div className={cn("flex border", RADIUS.control, COLORS.border.subtle, "p-0.5")}>
                    <button
                      type="button"
                      onClick={() => setCommentSort('newest')}
                      className={cn("px-2 py-1 text-xs font-medium rounded transition-colors", TOUCH_TARGETS.button, commentSort === 'newest' ? "bg-primary text-primary-foreground" : COLORS.text.secondary, "hover:" + COLORS.text.primary)}
                      aria-pressed={commentSort === 'newest'}
                    >
                      Newest
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentSort('top')}
                      className={cn("px-2 py-1 text-xs font-medium rounded transition-colors", TOUCH_TARGETS.button, commentSort === 'top' ? "bg-primary text-primary-foreground" : COLORS.text.secondary, "hover:" + COLORS.text.primary)}
                      aria-pressed={commentSort === 'top'}
                    >
                      Most upvoted
                    </button>
                  </div>
                </div>
                {topLevelComments.map((comment) => {
                  const commentDate = comment.createdAt;
                  const timeAgo = formatRelativeTime(commentDate) || 'recently';
                  const replies = getReplies(comment.id);
                  
                  return (
                    <div key={comment.id} className={cn(SPACING.tight.gap)}>
                      {/* Top-level Comment */}
                      <div className={cn("flex relative shadow-sm transition-all hover:shadow-md", RADIUS.panel, SPACING.content.inline, SPACING.card.padding, COLORS.bg.surface, "border", COLORS.border.subtle)}>
                        <Avatar className={cn("h-10 w-10 flex-shrink-0 border shadow-sm", isMobile ? "h-9 w-9" : "")} style={{ borderColor: getUserColor(comment.user.id) }}>
                          <AvatarImage src={comment.user.avatar} />
                          <AvatarFallback className="bg-primary/10 text-xs font-medium">
                            {comment.user.name?.split(' ').map(n => n[0]).join('') || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn("flex-1 min-w-0", SPACING.tight.gap)}>
                          <div className="flex items-center justify-between">
                            <div className={cn("flex items-center flex-wrap", SPACING.content.inline)}>
                              <span className={cn("text-sm font-semibold", COLORS.text.primary)}>{comment.user.name}</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={cn("text-xs cursor-help", COLORS.text.secondary)}>• {timeAgo}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{formatDateTime(comment.createdAt)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {comment.editedAt && (
                                <span className={cn("text-xs italic", COLORS.text.secondary)}>(edited)</span>
                              )}
                            </div>
                            {comment.userId === currentUser.id && !comment.deletedAt && (
                              <div className={cn("flex items-center", SPACING.tight.inline)}>
                                {onEditComment && (() => {
                                  const remainingMinutes = getRemainingEditTime(comment.createdAt);
                                  const canEdit = remainingMinutes !== null;
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => canEdit ? startEdit(comment) : undefined}
                                            disabled={!canEdit}
                                            className={cn("transition-colors p-1.5 rounded hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed", COLORS.text.secondary, "hover:text-primary", TOUCH_TARGETS.button)}
                                            title={canEdit ? `Edit comment (${remainingMinutes} min left)` : "Edit window expired (15 minutes)"}
                                            aria-label={canEdit ? "Edit comment" : "Edit window expired"}
                                          >
                                            <Icon name="Pencil" className="h-3.5 w-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{canEdit ? `Editable for ${remainingMinutes} more minute${remainingMinutes === 1 ? '' : 's'}` : "Edit window expired (15 minutes)"}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                })()}
                                {onDeleteComment && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => handleDelete(comment.id)}
                                          className={cn("transition-colors p-1.5 rounded hover:bg-muted/60", COLORS.text.secondary, "hover:text-destructive", TOUCH_TARGETS.button)}
                                          title={tDoc('suggestions.deleteComment')}
                                          aria-label={tDoc('suggestions.deleteComment')}
                                        >
                                          <Icon name="Trash2" className="h-3.5 w-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Delete comment</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            )}
                          </div>
                          {comment.deletedAt ? (
                            <p className={cn("text-sm italic", COLORS.text.secondary)}>[deleted]</p>
                          ) : editingCommentId === comment.id ? (
                            <div className={SPACING.tight.gap}>
                              <Textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSaveEdit();
                                  }
                                  if (e.key === 'Escape') {
                                    cancelEdit();
                                  }
                                }}
                                className={cn("min-h-[60px] text-sm", editText.length > 1000 && "border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]")}
                                autoFocus
                              />
                              {editText.length > 0 && (
                                <p className={cn("text-xs", editText.length > 1000 ? COLORS.status.error : editText.length > 900 ? COLORS.status.warning : COLORS.text.secondary)}>
                                  {editText.length}/1000 characters
                                </p>
                              )}
                              <div className={cn("flex justify-end", SPACING.tight.inline)}>
                                <button
                                  onClick={cancelEdit}
                                  className={cn("text-xs transition-colors", COLORS.text.secondary, "hover:" + COLORS.text.primary, TOUCH_TARGETS.button, "px-3 py-1.5 flex items-center gap-1.5")}
                                  aria-label={tDoc('suggestions.cancelEdit')}
                                >
                                  <Icon name="X" className="h-3.5 w-3.5" />
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={!editText.trim() || editText.length > 1000}
                                  className={cn("text-xs transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed", COLORS.text.primary, "bg-primary text-primary-foreground hover:bg-primary/90", TOUCH_TARGETS.button, "px-3 py-1.5 flex items-center gap-1.5")}
                                  aria-label={tDoc('suggestions.saveEdit')}
                                >
                                  <Icon name="Check" className="h-3.5 w-3.5" />
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className={cn("text-sm leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert", COLORS.text.primary)}>
                              <ReactMarkdown
                                rehypePlugins={[rehypeSanitize]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                  em: ({ children }) => <em className="italic">{children}</em>,
                                  code: ({ children, className }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                      <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                    ) : (
                                      <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto">{children}</code>
                                    );
                                  },
                                  a: ({ href, children }) => (
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      {children}
                                    </a>
                                  ),
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                  li: ({ children }) => <li className="ml-2">{children}</li>,
                                }}
                              >
                                {comment.text}
                              </ReactMarkdown>
                            </div>
                          )}
                          <div className={cn("flex items-center", SPACING.content.inline)}>
                            {!comment.deletedAt && (
                              <>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => handleUpvoteClick(comment)}
                                        disabled={upvotingCommentId === comment.id}
                                        className={cn("flex items-center transition-colors rounded hover:bg-muted/60 dark:hover:bg-muted/50", SPACING.tight.inline, "text-xs font-medium px-2 py-1 min-h-8", comment.userUpvoted ? COLORS.status.success : cn(COLORS.text.secondary, "dark:text-muted-foreground"), "hover:text-primary dark:hover:text-foreground disabled:opacity-50")}
                                        aria-label={comment.userUpvoted ? "Remove upvote" : "Upvote comment"}
                                      >
                                        <Icon name="ThumbsUp" className={cn(NAVIGATION.icon.xs, comment.userUpvoted && "fill-current")} />
                                        <span>{comment.upvoteCount ?? 0}</span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{comment.userUpvoted ? "Remove upvote" : "Upvote"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => !isOptimisticComment(comment.id) && startReply(comment.id)}
                                        disabled={isOptimisticComment(comment.id)}
                                        className={cn("flex items-center transition-colors rounded hover:bg-muted/60", SPACING.tight.inline, "text-xs font-medium px-2 py-1", COLORS.text.secondary, "hover:text-primary", TOUCH_TARGETS.button, isOptimisticComment(comment.id) && "opacity-50 cursor-not-allowed hover:bg-transparent")}
                                        aria-label={isOptimisticComment(comment.id) ? "Wait for comment to save before replying" : "Reply to comment"}
                                      >
                                        <Icon name="CornerDownRight" className="h-3.5 w-3.5" />
                                        Reply
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{isOptimisticComment(comment.id) ? "Saving... Try replying in a moment." : "Reply to comment"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                            {replies.length > 0 && (
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedReplies);
                                  if (newExpanded.has(comment.id)) {
                                    newExpanded.delete(comment.id);
                                  } else {
                                    newExpanded.add(comment.id);
                                  }
                                  setExpandedReplies(newExpanded);
                                }}
                                className={cn("flex items-center transition-colors rounded hover:bg-muted/60", SPACING.tight.inline, "text-xs font-medium px-2 py-1", COLORS.text.secondary, "hover:text-primary", TOUCH_TARGETS.button)}
                                aria-label={`${expandedReplies.has(comment.id) ? 'Collapse' : 'Expand'} ${replies.length} reply${replies.length === 1 ? '' : 'ies'}`}
                              >
                                <Icon name="MessageSquare" className="h-3.5 w-3.5" />
                                <span>{replies.length}</span>
                                {expandedReplies.has(comment.id) ? (
                                  <Icon name="ChevronUp" className="h-3.5 w-3.5 transition-transform duration-200" />
                                ) : (
                                  <Icon name="ChevronDown" className="h-3.5 w-3.5 transition-transform duration-200" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Replies (one level deep) - Indented with visual connection */}
                      {replies.length > 0 && expandedReplies.has(comment.id) && (
                        <div className={cn(SPACING.indent.reply, SPACING.tight.gap, SPACING.indent.replyPadding, SPACING.border.left, "animate-in slide-in-from-top-2 duration-200")}>
                          {replies.map((reply) => {
                            const replyDate = reply.createdAt;
                            const replyTimeAgo = formatRelativeTime(replyDate) || 'recently';
                            
                            return (
                              <div key={reply.id} className={cn("flex rounded-r-lg transition-all hover:bg-muted/30", SPACING.content.inline, SPACING.card.padding, COLORS.bg.surface, "border border-l-0", COLORS.border.subtle)}>
                                <Avatar className={cn("flex-shrink-0 border shadow-sm", isMobile ? "h-7 w-7" : "h-8 w-8")} style={{ borderColor: getUserColor(reply.user.id) }}>
                                  <AvatarImage src={reply.user.avatar} />
                                  <AvatarFallback className="bg-primary/10 text-[10px] font-medium">
                                    {reply.user.name?.split(' ').map(n => n[0]).join('') || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className={cn("flex-1 min-w-0", SPACING.tight.gap)}>
                                  <div className="flex items-center justify-between">
                                    <div className={cn("flex items-center flex-wrap", SPACING.tight.inline)}>
                                      <span className={cn("text-sm font-semibold", COLORS.text.primary)}>{reply.user.name}</span>
                                      <span className={cn("text-xs", COLORS.text.secondary)}>replied to {comment.user.name}</span>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className={cn("text-xs cursor-help", COLORS.text.secondary)}>• {replyTimeAgo}</span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{formatDateTime(reply.createdAt)}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      {reply.editedAt && (
                                        <span className={cn("text-xs italic", COLORS.text.secondary)}>(edited)</span>
                                      )}
                                    </div>
                                    <div className={cn("flex items-center", SPACING.tight.inline)}>
                                      {!reply.deletedAt && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                onClick={() => handleUpvoteClick(reply)}
                                                disabled={upvotingCommentId === reply.id}
                                                className={cn("flex items-center transition-colors rounded hover:bg-muted/60 dark:hover:bg-muted/50", SPACING.tight.inline, "text-xs font-medium px-2 py-1 min-h-8", reply.userUpvoted ? COLORS.status.success : cn(COLORS.text.secondary, "dark:text-muted-foreground"), "hover:text-primary dark:hover:text-foreground disabled:opacity-50")}
                                                aria-label={reply.userUpvoted ? "Remove upvote" : "Upvote reply"}
                                              >
                                                <Icon name="ThumbsUp" className={cn(NAVIGATION.icon.xs, reply.userUpvoted && "fill-current")} />
                                                <span>{reply.upvoteCount ?? 0}</span>
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{reply.userUpvoted ? "Remove upvote" : "Upvote"}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {reply.userId === currentUser.id && !reply.deletedAt && (
                                        <>
                                        {onEditComment && (() => {
                                          const remainingMinutes = getRemainingEditTime(reply.createdAt);
                                          const canEdit = remainingMinutes !== null;
                                          return (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    onClick={() => canEdit ? startEdit(reply) : undefined}
                                                    disabled={!canEdit}
                                                    className={cn("transition-colors rounded hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed p-1.5", COLORS.text.secondary, "hover:text-primary", TOUCH_TARGETS.button)}
                                                    title={canEdit ? `Edit reply (${remainingMinutes} min left)` : "Edit window expired (15 minutes)"}
                                                    aria-label={canEdit ? "Edit reply" : "Edit window expired"}
                                                  >
                                                    <Icon name="Pencil" className="h-3.5 w-3.5" />
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>{canEdit ? `Editable for ${remainingMinutes} more minute${remainingMinutes === 1 ? '' : 's'}` : "Edit window expired (15 minutes)"}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        })()}
                                        {onDeleteComment && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  onClick={() => handleDelete(reply.id)}
                                                  className={cn("transition-colors rounded hover:bg-muted/60 p-1.5", COLORS.text.secondary, "hover:text-destructive", TOUCH_TARGETS.button)}
                                                  title={tDoc('suggestions.deleteReply')}
                                                  aria-label={tDoc('suggestions.deleteReply')}
                                                >
                                                  <Icon name="Trash2" className="h-3.5 w-3.5" />
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Delete reply</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {reply.deletedAt ? (
                                    <p className={cn("text-sm italic", COLORS.text.secondary)}>[deleted]</p>
                                  ) : editingCommentId === reply.id ? (
                                    <div className={SPACING.tight.gap}>
                                      <Textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleSaveEdit();
                                          }
                                          if (e.key === 'Escape') {
                                            cancelEdit();
                                          }
                                        }}
                                        className={cn("min-h-[60px] text-sm", editText.length > 1000 && "border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]")}
                                        autoFocus
                                      />
                                      {editText.length > 0 && (
                                        <p className={cn("text-xs", editText.length > 1000 ? COLORS.status.error : editText.length > 900 ? COLORS.status.warning : COLORS.text.secondary)}>
                                          {editText.length}/1000 characters
                                        </p>
                                      )}
                                      <div className={cn("flex justify-end", SPACING.tight.inline)}>
                                        <button
                                          onClick={cancelEdit}
                                          className={cn("text-xs transition-colors", COLORS.text.secondary, "hover:" + COLORS.text.primary, TOUCH_TARGETS.button, "px-3 py-1.5 flex items-center gap-1.5")}
                                          aria-label={tDoc('suggestions.cancelEdit')}
                                        >
                                          <Icon name="X" className="h-3.5 w-3.5" />
                                          Cancel
                                        </button>
                                        <button
                                          onClick={handleSaveEdit}
                                          disabled={!editText.trim() || editText.length > 1000}
                                          className={cn("text-xs transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed", COLORS.text.primary, "bg-primary text-primary-foreground hover:bg-primary/90", TOUCH_TARGETS.button, "px-3 py-1.5 flex items-center gap-1.5")}
                                          aria-label={tDoc('suggestions.saveEdit')}
                                        >
                                          <Icon name="Check" className="h-3.5 w-3.5" />
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={cn("text-sm leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert", COLORS.text.primary, "opacity-90")}>
                                      <ReactMarkdown
                                        rehypePlugins={[rehypeSanitize]}
                                        components={{
                                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                          em: ({ children }) => <em className="italic">{children}</em>,
                                          code: ({ children, className }) => {
                                            const isInline = !className;
                                            return isInline ? (
                                              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                            ) : (
                                              <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto">{children}</code>
                                            );
                                          },
                                          a: ({ href, children }) => (
                                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                              {children}
                                            </a>
                                          ),
                                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                          li: ({ children }) => <li className="ml-2">{children}</li>,
                                        }}
                                      >
                                        {reply.text}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply Form */}
                      {replyingTo === comment.id && (
                        <div className={cn(SPACING.indent.reply, SPACING.indent.replyPadding, SPACING.border.left, SPACING.tight.gap, "animate-in slide-in-from-top-2 duration-200")}>
                          <div className={cn("flex rounded-r-lg border border-l-0", SPACING.content.inline, SPACING.card.padding, COLORS.bg.surface, COLORS.border.subtle)}>
                            <Textarea
                              placeholder={`Reply to ${comment.user.name}...`}
                              value={replyText}
                              onChange={(e) => {
                                setReplyText(e.target.value);
                                // Clear error when user starts typing
                                if (replyFieldErrors.text) {
                                  setReplyFieldErrors(prev => {
                                    const next = { ...prev };
                                    delete next.text;
                                    return next;
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleReply(comment.id);
                                }
                                if (e.key === 'Escape') {
                                  setReplyingTo(null);
                                  setReplyText("");
                                  setReplyFieldErrors({});
                                }
                              }}
                              className={cn("min-h-[60px] flex-1 text-sm", replyFieldErrors.text && "border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]")}
                              autoFocus
                              aria-invalid={!!replyFieldErrors.text}
                            />
                          </div>
                          {replyFieldErrors.text && (
                            <p className={cn('text-sm ml-4', COLORS.status.error)}>{replyFieldErrors.text}</p>
                          )}
                          {!replyFieldErrors.text && replyText.length > 0 && (
                            <p className={cn("text-xs ml-4", replyText.length > 1000 ? COLORS.status.error : replyText.length > 900 ? COLORS.status.warning : COLORS.text.secondary)}>
                              {replyText.length}/1000 characters
                            </p>
                          )}
                          <div className={cn("flex justify-end", SPACING.content.inline)}>
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                                setReplyFieldErrors({});
                              }}
                              className={cn("text-xs transition-colors", COLORS.text.secondary, "hover:" + COLORS.text.primary, TOUCH_TARGETS.button, "px-3.5 py-1.5")}
                              aria-label={tDoc('suggestions.cancelReply')}
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleReply(comment.id)}
                              disabled={!replyText.trim() || replyText.length > 1000}
                              className={cn("text-xs transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed", COLORS.text.primary, "hover:opacity-80 bg-foreground/10", TOUCH_TARGETS.button, "px-3.5 py-1.5")}
                              aria-label={tDoc('suggestions.sendReply')}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={cn("py-1")} />
            )}

            {/* Load More Comments Button */}
            {hasMoreComments && isThreadExpanded && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMoreComments}
                  disabled={loadingMoreComments}
                  className={cn("text-xs font-medium transition-colors border hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed", RADIUS.control, COLORS.text.secondary, "hover:" + COLORS.text.primary, COLORS.border.standard, TOUCH_TARGETS.button, "px-4 py-2")}
                  aria-label={`Load ${totalCommentCount - loadedCommentCount} more comment${totalCommentCount - loadedCommentCount === 1 ? '' : 's'}`}
                >
                  {loadingMoreComments ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner className="h-3 w-3" />
                      Loading...
                    </span>
                  ) : (
                    `Load ${totalCommentCount - loadedCommentCount} more comment${totalCommentCount - loadedCommentCount === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            )}

            {/* New Comment Form */}
            <div className={cn(SPACING.content.gap, HIERARCHY.majorSection)}>
              <div className={cn(SPACING.card.padding, COLORS.bg.muted, "border", RADIUS.panel, COLORS.border.subtle)}>
                <Textarea
                  placeholder={tDoc('suggestions.writeComment')}
                  value={commentText}
                  onChange={(e) => {
                    setCommentText(e.target.value);
                    // Clear error when user starts typing
                    if (commentFieldErrors.text) {
                      setCommentFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.text;
                        return next;
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleComment();
                    }
                  }}
                  className={cn("min-h-[60px] text-sm", commentFieldErrors.text && "border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]")}
                  aria-invalid={!!commentFieldErrors.text}
                />
                {commentFieldErrors.text && (
                  <p className={cn('text-sm mt-1', COLORS.status.error)}>{commentFieldErrors.text}</p>
                )}
                {!commentFieldErrors.text && commentText.length > 0 && (
                  <p className={cn("text-xs mt-1", commentText.length > 1000 ? COLORS.status.error : commentText.length > 900 ? COLORS.status.warning : COLORS.text.secondary)}>
                    {commentText.length}/1000 characters
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center">
                <p className={cn("text-xs", COLORS.text.secondary)}>
                  Tip: Press Cmd/Ctrl+Enter to post
                </p>
                <button 
                  onClick={handleComment}
                  disabled={!commentText.trim() || commentText.length > 1000}
                  className={cn("text-xs font-medium transition-colors px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary", RADIUS.control, TOUCH_TARGETS.button)}
                  aria-label={tDoc('suggestions.postComment')}
                >
                  Post Comment
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Delete Proposal Confirmation Dialog */}
      {onDeleteProposal && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this proposal? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProposal}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Comment Confirmation Dialog */}
      {onDeleteComment && (
        <AlertDialog open={!!commentToDeleteId} onOpenChange={(open) => !open && setCommentToDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete comment?</AlertDialogTitle>
              <AlertDialogDescription>
                {tCommon('confirm.deleteComment')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingComment}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteComment}
                disabled={isDeletingComment}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingComment ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}

// Memoize component to prevent unnecessary re-renders
// Only re-render if critical props actually change
export const SuggestionCard = React.memo(SuggestionCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Return true if props are equal (skip re-render), false if different (re-render)
  try {
    // Check basic props first (fast path)
    if (
      prevProps.suggestion.id !== nextProps.suggestion.id ||
      prevProps.currentUser?.id !== nextProps.currentUser?.id ||
      prevProps.isSelected !== nextProps.isSelected ||
      prevProps.suggestion.approved !== nextProps.suggestion.approved ||
      prevProps.totalUsers !== nextProps.totalUsers ||
      prevProps.suggestion.comments.length !== nextProps.suggestion.comments.length
    ) {
      return false; // Re-render needed
    }

    // Check votes array - compare IDs and vote types, not just length
    const prevVotes = prevProps.suggestion.votes || [];
    const nextVotes = nextProps.suggestion.votes || [];
    
    if (prevVotes.length !== nextVotes.length) {
      return false; // Re-render if length changed
    }

    // Check if vote content changed (same length but different votes)
    // Create a signature for each vote: userId + vote type
    const prevVoteSignatures = prevVotes
      .map(v => `${v.userId}:${v.vote}`)
      .sort()
      .join(',');
    const nextVoteSignatures = nextVotes
      .map(v => `${v.userId}:${v.vote}`)
      .sort()
      .join(',');
    
    if (prevVoteSignatures !== nextVoteSignatures) {
      return false; // Re-render if vote content changed
    }

    // Check partialVoteCounts (used for optimistic updates)
    const prevCounts = prevProps.suggestion.partialVoteCounts;
    const nextCounts = nextProps.suggestion.partialVoteCounts;
    
    if (prevCounts !== nextCounts) {
      // If one is null/undefined and the other isn't, they're different
      if (!prevCounts !== !nextCounts) {
        return false;
      }
      // If both exist, compare their values
      if (prevCounts && nextCounts) {
        if (
          prevCounts.pro !== nextCounts.pro ||
          prevCounts.contra !== nextCounts.contra ||
          prevCounts.neutral !== nextCounts.neutral ||
          prevCounts.total !== nextCounts.total
        ) {
          return false; // Re-render if counts changed
        }
      }
    }

    // extraActionsInRow (e.g. structure delete button with loading state)
    if (prevProps.extraActionsInRow !== nextProps.extraActionsInRow) {
      return false;
    }

    // All checks passed - props are equal, skip re-render
    return true;
  } catch (error) {
    // If comparison fails, allow re-render (safer fallback)
    return false;
  }
});
