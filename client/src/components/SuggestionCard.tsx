import { Suggestion, User, HeadingLevel, DocumentOptions, Organization } from "../types";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { ThumbsUp, ThumbsDown, MessageSquare, CheckCircle2, Users, FileText, History, TrendingUp } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { DiffViewer } from "./DiffViewer";
import { useState, useEffect, useRef } from "react";
import { cn } from "./ui/utils";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface SuggestionCardProps {
  suggestion: Suggestion;
  totalUsers: number;
  currentUser: User;
  allCollaborators?: User[];
  versionHistory?: VersionHistory[];
  isSelected?: boolean;
  selectionIndex?: number;
  onToggleSelect?: (suggestionId: string) => void;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void> | void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
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
}

// Helper function to get relative time
function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SuggestionCard({
  suggestion,
  totalUsers,
  currentUser,
  allCollaborators = [],
  isSelected = false,
  documentOptions,
  selectionIndex = -1,
  onToggleSelect,
  onVote,
  onComment,
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
}: SuggestionCardProps) {
  const [commentText, setCommentText] = useState("");
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [lastVoteTime, setLastVoteTime] = useState<number>(0);
  const [optimisticVote, setOptimisticVote] = useState<'PRO' | 'NEUTRAL' | 'CONTRA' | null>(null);
  const [isThreadExpanded, setIsThreadExpanded] = useState(() => {
    // Auto-expand comment thread for deletion suggestions
    if (originalText && suggestion.text.trim()) {
      const originalLength = originalText.trim().length;
      const suggestionLength = suggestion.text.trim().length;
      const originalWords = originalText.trim().split(/\s+/).length;
      const suggestionWords = suggestion.text.trim().split(/\s+/).length;

      // Consider it a deletion if significantly shorter (more than 20% shorter in length or words)
      const isDeletion = suggestionLength < originalLength * 0.8 || suggestionWords < originalWords * 0.8;
      return isDeletion;
    }
    return false;
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Count votes by type (PRO = approve, NEUTRAL/CONTRA = not approve)
  const proVotes = suggestion.votes.filter((v) => v.vote === 'PRO');
  const neutralVotes = suggestion.votes.filter((v) => v.vote === 'NEUTRAL');
  const contraVotes = suggestion.votes.filter((v) => v.vote === 'CONTRA');
  
  const proCount = proVotes.length;
  const neutralCount = neutralVotes.length;
  const contraCount = contraVotes.length;
  
  const approvalPercentage = totalUsers > 0 ? (proCount / totalUsers) * 100 : 0;
  const acceptanceThreshold = documentOptions?.acceptanceThreshold || 75;
  const isAccepted = approvalPercentage >= acceptanceThreshold;
  const totalVotes = proCount + neutralCount + contraCount;
  const notVotedCount = Math.max(totalUsers - totalVotes, 0);

  const proPercentage = totalUsers > 0 ? (proCount / totalUsers) * 100 : 0;
  const neutralPercentage = totalUsers > 0 ? (neutralCount / totalUsers) * 100 : 0;
  const contraPercentage = totalUsers > 0 ? (contraCount / totalUsers) * 100 : 0;
  const notVotedPercentage = totalUsers > 0 ? (notVotedCount / totalUsers) * 100 : 0;

  // Use optimistic vote if present, otherwise use actual vote
  const actualUserVote = suggestion.votes.find((v) => v.userId === currentUser.id);
  const currentUserVote = optimisticVote 
    ? { userId: currentUser.id, vote: optimisticVote, id: 'optimistic' }
    : actualUserVote;
  const hasVoted = !!currentUserVote;
  
  // Clear loading state and optimistic vote when WebSocket update arrives
  // This allows the button to immediately show the colored state (voted) instead of spinner
  useEffect(() => {
    if (actualUserVote && actualUserVote.id !== 'optimistic') {
      // Vote has been updated via WebSocket, immediately clear loading state and optimistic vote
      // This makes the button change color to reflect the actual vote state
      if (isVoting) {
      setIsVoting(false);
      }
      if (optimisticVote) {
      setOptimisticVote(null);
    }
    }
  }, [actualUserVote?.id, actualUserVote?.vote, isVoting, optimisticVote]);

  // Auto-expand comment thread when new comments arrive via WebSocket, but only if:
  // 1. Thread is already expanded (user is viewing comments)
  // 2. It's a reply to a comment the current user made
  // 3. It's a reply to a comment the user is currently replying to
  const previousCommentCountRef = useRef(suggestion.comments.length);
  const previousCommentsRef = useRef<typeof suggestion.comments>([]);
  
  useEffect(() => {
    const currentCommentCount = suggestion.comments.length;
    const previousCommentCount = previousCommentCountRef.current;
    
    // Only act if comment count increased and thread is already expanded
    if (currentCommentCount > previousCommentCount && isThreadExpanded) {
      const previousComments = previousCommentsRef.current;
      const newComments = suggestion.comments.filter(
        comment => !previousComments.some(prev => prev.id === comment.id)
      );
      
      // Check if any new comment is:
      // 1. A reply to a comment the current user made
      // 2. A reply to the comment the user is currently replying to
      const shouldKeepExpanded = newComments.some(newComment => {
        if (!newComment.parentId) return true; // Top-level comment, keep expanded
        
        // Check if it's a reply to user's comment
        const parentComment = suggestion.comments.find(c => c.id === newComment.parentId);
        if (parentComment?.userId === currentUser.id) return true;
        
        // Check if it's a reply to the comment user is currently replying to
        if (replyingTo && newComment.parentId === replyingTo) return true;
        
        return false;
      });
      
      // Keep thread expanded if relevant, but don't force expand if collapsed
      if (shouldKeepExpanded) {
        setIsThreadExpanded(true);
      }
    }
    
    previousCommentCountRef.current = currentCommentCount;
    previousCommentsRef.current = [...suggestion.comments];
  }, [suggestion.comments, isThreadExpanded, currentUser.id, replyingTo]);
  
  // Check if vote changes are allowed
  const voteChangeAllowed = documentOptions?.voteChangeAllowed !== false; // Default to true
  const isVoteLocked = hasVoted && !voteChangeAllowed;
  
  // Check if voting is anonymous
  const isAnonymous = documentOptions?.votingAnonymous === true;
  
  // Get users who haven't voted yet
  // Handle anonymous voting where userId might be undefined
  const votedUserIds = new Set(suggestion.votes.map(v => v.userId).filter((id): id is string => !!id));
  const usersWhoHaventVoted = allCollaborators.filter(user => !votedUserIds.has(user.id));

  // Organize comments into threads
  const topLevelComments = suggestion.comments.filter(c => !c.parentId);
  const getReplies = (commentId: string) => 
    suggestion.comments.filter(c => c.parentId === commentId);

  const handleComment = () => {
    if (commentText.trim()) {
      onComment(suggestion.id, commentText);
      setCommentText("");
      setIsThreadExpanded(true); // Auto-expand after posting
    }
  };

  const handleReply = (parentId: string) => {
    if (replyText.trim()) {
      onComment(suggestion.id, replyText, parentId);
      setReplyText("");
      setReplyingTo(null);
    }
  };

  const startReply = (commentId: string) => {
    setReplyingTo(commentId);
    setReplyText("");
    setIsThreadExpanded(true);
  };

  const getBorderColor = () => {
    if (!isSelected) return "";
    if (selectionIndex === 0) return "border-amber-500 border-2";
    if (selectionIndex === 1) return "border-blue-500 border-2";
    return "";
  };

  const cardStyle = organizationBorderColor 
    ? { borderColor: organizationBorderColor, borderWidth: '2px' }
    : undefined;

  return (
    <Card 
      className={cn("p-0 overflow-hidden transition-all", getBorderColor())}
      style={cardStyle}
    >
      {/* Progress Bar at the very top */}
      <div 
        className="flex h-3 w-full overflow-hidden cursor-pointer border-b"
        style={{ backgroundColor: '#e5e7eb', minHeight: '12px' }}
        onClick={() => setShowVoteDetails(!showVoteDetails)}
        title="Click to show/hide voting details"
      >
        {/* Not voted first (gray) */}
        {notVotedPercentage > 0 && (
          <div
            className="transition-all duration-300"
            style={{ 
              width: `${notVotedPercentage}%`,
              backgroundColor: '#9ca3af',
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
            className="transition-all duration-300"
            style={{ 
              width: `${contraPercentage}%`,
              backgroundColor: '#ef4444',
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
            className="transition-all duration-300"
            style={{ 
              width: `${neutralPercentage}%`,
              backgroundColor: '#3b82f6',
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
            className="transition-all duration-300"
            style={{ 
              width: `${proPercentage}%`,
              backgroundColor: '#22c55e',
              flex: `0 0 ${proPercentage}%`
            }}
            title={isAnonymous 
              ? `Approve: ${proCount}` 
              : `Approve: ${proCount} - ${proVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
          />
        )}
      </div>

      {/* Compact Header with inline vote buttons */}
      <div className="p-3">
        {/* Document Context - Integrated into header */}
        {documentContext && (
          <div className="flex items-center gap-2 text-xs mb-2 pb-1.5 border-b flex-wrap">
            <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <button
              onClick={() => onNavigateToDocument?.(documentContext.documentId)}
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left cursor-pointer text-sm"
            >
              {documentContext.documentTitle}
            </button>
            {organization && (
              <Badge
                className="text-xs px-2 py-0.5 font-medium border"
                style={{
                  backgroundColor: organization.brandingColor ? `${organization.brandingColor}15` : undefined,
                  borderColor: organization.brandingColor || undefined,
                  color: organization.brandingColor || undefined,
                }}
              >
                {organization.name}
              </Badge>
            )}
            {documentContext.paragraphTitle && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-muted-foreground">{documentContext.paragraphTitle}</span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {ranking && (
                <div className="flex items-center gap-1.5 text-xs text-purple-700">
                  <Badge className="font-bold bg-purple-100 text-purple-700 border-purple-200 px-1.5 py-0.5 text-xs">
                    #{ranking.index}
                  </Badge>
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-muted-foreground">Score: {ranking.score}</span>
                  {ranking.isControversial && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 px-1.5 py-0.5 text-xs font-semibold">
                        ⚖️ Controversial
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
                  className="h-6 px-2 text-xs"
                >
                  <History className="h-3 w-3 mr-1" />
                  History ({historyCount})
                </Button>
              )}
            </div>
          </div>
        )}
        
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {onToggleSelect && (
              <div className="pt-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(suggestion.id)}
                  className={cn(
                    isSelected && selectionIndex === 0 && "border-amber-500 data-[state=checked]:bg-amber-500",
                    isSelected && selectionIndex === 1 && "border-blue-500 data-[state=checked]:bg-blue-500"
                  )}
                />
              </div>
            )}
            <Avatar className="h-7 w-7 flex-shrink-0">
              <AvatarFallback className="text-xs">
                {suggestion.user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-sm font-medium text-foreground">{suggestion.user.name}</span>
                {suggestion.type === 'TITLE' && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    Heading{suggestion.headingLevel ? ` (${suggestion.headingLevel.toUpperCase()})` : ''}
                  </Badge>
                )}
                {isAccepted && (
                  <Badge variant="default" className="bg-green-600 text-xs px-1.5 py-0">
                    Accepted ({Math.round(approvalPercentage)}%)
                  </Badge>
                )}
                {isSelected && selectionIndex === 0 && (
                  <Badge className="bg-amber-500 text-xs px-1.5 py-0">Compare 1</Badge>
                )}
                {isSelected && selectionIndex === 1 && (
                  <Badge className="bg-blue-500 text-xs px-1.5 py-0">Compare 2</Badge>
                )}
              </div>
              {showDiffInline && originalText !== undefined ? (
                <div className="mt-1">
                  <DiffViewer
                    originalText={originalText || ''}
                    suggestion1Text={suggestion.text}
                    suggestion1Author={suggestion.user.name}
                    highlightColor={diffHighlightColor}
                  />
                </div>
              ) : (
                <p className="text-sm text-foreground font-normal line-clamp-2 mt-0.5">
                  "{suggestion.text}"
                </p>
              )}
            </div>
          </div>

          {/* Inline Vote Buttons - Icon Only */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isVoteLocked ? (
              <div className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                Vote locked
              </div>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={currentUserVote?.vote === 'PRO' ? "default" : "ghost"}
                  onClick={async () => {
                    // Check cooldown period (2 seconds)
                    const now = Date.now();
                    const timeSinceLastVote = now - lastVoteTime;
                    if (timeSinceLastVote < 2000) {
                      const remainingSeconds = ((2000 - timeSinceLastVote) / 1000).toFixed(1);
                      toast.info(`Please wait ${remainingSeconds}s before voting again`, { duration: 1500 });
                      return;
                    }
                    
                    if (isVoting) return;
                    
                    // Optimistic update - change color instantly
                    setOptimisticVote('PRO');
                    setLastVoteTime(now);
                    setIsVoting(true);
                    
                    try {
                      await onVote(suggestion.id, 'PRO');
                    } catch (error) {
                      // Rollback optimistic update on error
                      setOptimisticVote(null);
                      throw error;
                    } finally {
                      // WebSocket update will clear this immediately (see useEffect above)
                      // Fallback timeout only if WebSocket is slow (reduced to 1 second)
                      setTimeout(() => {
                        setIsVoting(false);
                        setOptimisticVote((prev) => prev === 'PRO' ? null : prev);
                      }, 1000);
                    }
                  }}
                  disabled={isVoteLocked || isVoting}
                  className={cn(
                    "h-8 w-8 p-0",
                    currentUserVote?.vote === 'PRO' && "bg-green-600 hover:bg-green-700 text-white",
                    (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                  )}
                  title={`Approve (${proCount})`}
                >
                  {isVoting ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ThumbsUp className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={currentUserVote?.vote === 'NEUTRAL' ? "secondary" : "ghost"}
                  onClick={async () => {
                    // Check cooldown period (2 seconds)
                    const now = Date.now();
                    const timeSinceLastVote = now - lastVoteTime;
                    if (timeSinceLastVote < 2000) {
                      const remainingSeconds = ((2000 - timeSinceLastVote) / 1000).toFixed(1);
                      toast.info(`Please wait ${remainingSeconds}s before voting again`, { duration: 1500 });
                      return;
                    }
                    
                    if (isVoting) return;
                    
                    // Optimistic update - change color instantly
                    setOptimisticVote('NEUTRAL');
                    setLastVoteTime(now);
                    setIsVoting(true);
                    
                    try {
                      await onVote(suggestion.id, 'NEUTRAL');
                    } catch (error) {
                      // Rollback optimistic update on error
                      setOptimisticVote(null);
                      throw error;
                    } finally {
                      // WebSocket update will clear this immediately (see useEffect above)
                      // Fallback timeout only if WebSocket is slow (reduced to 1 second)
                      setTimeout(() => {
                        setIsVoting(false);
                        setOptimisticVote((prev) => prev === 'NEUTRAL' ? null : prev);
                      }, 1000);
                    }
                  }}
                  disabled={isVoteLocked || isVoting}
                  className={cn(
                    "h-8 w-8 p-0",
                    (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                  )}
                  title={`Neutral (${neutralCount})`}
                >
                  {isVoting ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-lg leading-none">○</span>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={currentUserVote?.vote === 'CONTRA' ? "destructive" : "ghost"}
                  onClick={async () => {
                    // Check cooldown period (2 seconds)
                    const now = Date.now();
                    const timeSinceLastVote = now - lastVoteTime;
                    if (timeSinceLastVote < 2000) {
                      const remainingSeconds = ((2000 - timeSinceLastVote) / 1000).toFixed(1);
                      toast.info(`Please wait ${remainingSeconds}s before voting again`, { duration: 1500 });
                      return;
                    }
                    
                    if (isVoting) return;
                    
                    // Optimistic update - change color instantly
                    setOptimisticVote('CONTRA');
                    setLastVoteTime(now);
                    setIsVoting(true);
                    
                    try {
                      await onVote(suggestion.id, 'CONTRA');
                    } catch (error) {
                      // Rollback optimistic update on error
                      setOptimisticVote(null);
                      throw error;
                    } finally {
                      // WebSocket update will clear this immediately (see useEffect above)
                      // Fallback timeout only if WebSocket is slow (reduced to 1 second)
                      setTimeout(() => {
                        setIsVoting(false);
                        setOptimisticVote((prev) => prev === 'CONTRA' ? null : prev);
                      }, 1000);
                    }
                  }}
                  disabled={isVoteLocked || isVoting}
                  className={cn(
                    "h-8 w-8 p-0",
                    (isVoteLocked || isVoting) && "opacity-50 cursor-not-allowed"
                  )}
                  title={`Reject (${contraCount})`}
                >
                  {isVoting ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ThumbsDown className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
            <div className="h-4 w-px bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVoteDetails(!showVoteDetails)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Show voting details"
            >
              Details
            </Button>
          </div>
        </div>

        {/* Vote Details (collapsible) */}
        {showVoteDetails && (
          <div className="space-y-2 pb-2.5 border-b animate-in slide-in-from-top-2 duration-200 mt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">Requires {acceptanceThreshold}% approval</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
                <span className="font-medium">Approve</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                <span>Neutral</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500"></span>
                <span>Reject</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-slate-600"></span>
                <span>Not voted</span>
              </div>
            </div>
            </div>

            {/* Vote details expansion */}
            <div className="space-y-2 p-2.5 bg-muted/30 rounded-lg text-xs">
              {proVotes.length > 0 && (
                <div>
                  <p className="font-medium text-green-600 dark:text-green-400 mb-1">
                    {isAnonymous ? `Approved: ${proCount}` : `Approved by:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-1">
                      {proVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className="bg-green-50 dark:bg-green-900/20 border-green-200">
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {neutralVotes.length > 0 && (
                <div>
                  <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                    {isAnonymous ? `Neutral: ${neutralCount}` : `Neutral:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-1">
                      {neutralVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {contraVotes.length > 0 && (
                <div>
                  <p className="font-medium text-red-600 dark:text-red-400 mb-1">
                    {isAnonymous ? `Rejected: ${contraCount}` : `Rejected by:`}
                  </p>
                  {!isAnonymous && (
                    <div className="flex flex-wrap gap-1">
                      {contraVotes.map(vote => (
                        <Badge key={vote.id} variant="outline" className="bg-red-50 dark:bg-red-900/20 border-red-200">
                          {vote.user?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {usersWhoHaventVoted.length > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Waiting for:</p>
                  <div className="flex flex-wrap gap-1">
                    {usersWhoHaventVoted.map(user => (
                      <Badge key={user.id} variant="outline" className="bg-gray-50 dark:bg-slate-800 border-gray-200">
                        {user.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Acceptance Status Messages */}
            {isAccepted && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">This suggestion has been accepted and applied to the document!</span>
              </div>
            )}

            {approvalPercentage >= 50 && !isAccepted && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                <span className="font-medium">Halfway to acceptance. {Math.max(acceptanceThreshold - approvalPercentage, 0).toFixed(0)}% more PRO needed.</span>
              </div>
            )}
            
            {notVotedCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{notVotedCount} collaborator{notVotedCount === 1 ? '' : 's'} still need to vote.</span>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Comment Section */}
        <div className="border-t pt-2">
        <button
          onClick={() => setIsThreadExpanded(!isThreadExpanded)}
          className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-0.5"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>
              {suggestion.comments.length === 0 
                ? "No comments yet. Be the first to share your thoughts!" 
                : `Discussion (${suggestion.comments.length})`}
            </span>
            {suggestion.comments.length > 0 && (
              <Badge variant="secondary" className="h-5 text-xs">
                {suggestion.comments.length}
              </Badge>
            )}
          </div>
          <span className="text-xs">
            {isThreadExpanded ? "▲ Hide thread" : "▼ Show thread"}
          </span>
        </button>

        {/* Expanded Discussion Thread */}
        {isThreadExpanded && (
          <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {suggestion.comments.length > 0 && (
              <div className="space-y-3">
                {topLevelComments.map((comment) => {
                  const commentDate = new Date(comment.createdAt);
                  const timeAgo = getTimeAgo(commentDate);
                  const replies = getReplies(comment.id);
                  
                  return (
                    <div key={comment.id} className="space-y-2">
                      {/* Top-level Comment */}
                      <div className="flex gap-2.5 p-2.5 rounded-lg bg-muted/30">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-primary/10 text-xs">
                            {comment.user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{comment.user.name}</span>
                            <span className="text-xs text-muted-foreground">• {timeAgo}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed break-words">{comment.text}</p>
                          <button
                            onClick={() => startReply(comment.id)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Reply
                          </button>
                        </div>
                      </div>

                      {/* Replies (one level deep) - Indented with visual connection */}
                      {replies.length > 0 && (
                        <div className="ml-12 space-y-2 pl-6 border-l-2 border-border/50">
                          {replies.map((reply) => {
                            const replyDate = new Date(reply.createdAt);
                            const replyTimeAgo = getTimeAgo(replyDate);
                            
                            return (
                              <div key={reply.id} className="flex gap-3 p-2 rounded bg-background">
                                <Avatar className="h-6 w-6 flex-shrink-0">
                                  <AvatarFallback className="bg-primary/10 text-xs">
                                    {reply.user.name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{reply.user.name}</span>
                                    <span className="text-xs text-muted-foreground">• {replyTimeAgo}</span>
                                  </div>
                                  <p className="text-sm text-muted-foreground leading-relaxed break-words">{reply.text}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply Form */}
                      {replyingTo === comment.id && (
                        <div className="ml-12 pl-6 border-l-2 border-border/50 space-y-2 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex gap-2 p-2.5 bg-background rounded-lg border border-border">
                            <Textarea
                              placeholder={`Reply to ${comment.user.name}...`}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleReply(comment.id);
                                }
                                if (e.key === 'Escape') {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }
                              }}
                              className="min-h-[60px] flex-1 text-sm"
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleReply(comment.id)}
                              disabled={!replyText.trim()}
                              className="text-xs text-foreground hover:text-foreground/80 transition-colors px-3 py-1 bg-foreground/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
            )}

            {/* New Comment Form */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex gap-2 p-2.5 bg-muted/30 rounded-lg border border-border">
                <Textarea
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleComment();
                    }
                  }}
                  className="min-h-[60px] text-sm"
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Tip: Press Cmd/Ctrl+Enter to post
                </p>
                <button 
                  onClick={handleComment}
                  disabled={!commentText.trim()}
                  className="text-xs text-foreground hover:text-foreground/80 transition-colors px-3 py-1 bg-foreground/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Post Comment
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </Card>
  );
}
