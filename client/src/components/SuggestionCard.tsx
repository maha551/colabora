import { Suggestion, User, HeadingLevel } from "../types";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { ThumbsUp, ThumbsDown, MessageSquare, CheckCircle2, Users } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { useState } from "react";
import { cn } from "./ui/utils";
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
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
  key?: React.Key;
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
  selectionIndex = -1,
  onToggleSelect,
  onVote,
  onComment,
}: SuggestionCardProps) {
  const [commentText, setCommentText] = useState("");
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [isThreadExpanded, setIsThreadExpanded] = useState(false);
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
  const isAccepted = approvalPercentage >= 75;
  const totalVotes = proCount + neutralCount + contraCount;
  const notVotedCount = Math.max(totalUsers - totalVotes, 0);

  const proPercentage = totalUsers > 0 ? (proCount / totalUsers) * 100 : 0;
  const neutralPercentage = totalUsers > 0 ? (neutralCount / totalUsers) * 100 : 0;
  const contraPercentage = totalUsers > 0 ? (contraCount / totalUsers) * 100 : 0;
  const notVotedPercentage = totalUsers > 0 ? (notVotedCount / totalUsers) * 100 : 0;

  const currentUserVote = suggestion.votes.find((v) => v.userId === currentUser.id);
  
  // Get users who haven't voted yet
  const votedUserIds = new Set(suggestion.votes.map(v => v.userId));
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

  return (
    <Card className={cn("p-0 overflow-hidden transition-all", getBorderColor())}>
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
            title={`Not voted: ${notVotedCount} - ${usersWhoHaventVoted.map(u => u.name).join(', ')}`}
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
            title={`Reject: ${contraCount} - ${contraVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
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
            title={`Neutral: ${neutralCount} - ${neutralVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
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
            title={`Approve: ${proCount} - ${proVotes.map(v => v.user?.name || 'Unknown').join(', ')}`}
          />
        )}
      </div>

      {/* Compact Header with inline vote buttons */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
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
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback>
                {suggestion.user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-normal text-muted-foreground">{suggestion.user.name}</span>
                {suggestion.type === 'TITLE' && (
                  <Badge variant="outline" className="text-xs">
                    Heading{suggestion.headingLevel ? ` (${suggestion.headingLevel.toUpperCase()})` : ''}
                  </Badge>
                )}
                {isAccepted && (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    Accepted
                  </Badge>
                )}
                {isSelected && selectionIndex === 0 && (
                  <Badge className="bg-amber-500 text-xs">Compare 1</Badge>
                )}
                {isSelected && selectionIndex === 1 && (
                  <Badge className="bg-blue-500 text-xs">Compare 2</Badge>
                )}
              </div>
              <p className="text-sm text-gray-900 font-normal line-clamp-2">
                "{suggestion.text}"
              </p>
            </div>
          </div>

          {/* Inline Vote Buttons - Icon Only */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant={currentUserVote?.vote === 'PRO' ? "default" : "ghost"}
              onClick={() => onVote(suggestion.id, 'PRO')}
              className={cn(
                "h-8 w-8 p-0",
                currentUserVote?.vote === 'PRO' && "bg-green-600 hover:bg-green-700 text-white"
              )}
              title={`Approve (${proCount})`}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={currentUserVote?.vote === 'NEUTRAL' ? "secondary" : "ghost"}
              onClick={() => onVote(suggestion.id, 'NEUTRAL')}
              className="h-8 w-8 p-0"
              title={`Neutral (${neutralCount})`}
            >
              <span className="text-lg leading-none">○</span>
            </Button>
            <Button
              size="sm"
              variant={currentUserVote?.vote === 'CONTRA' ? "destructive" : "ghost"}
              onClick={() => onVote(suggestion.id, 'CONTRA')}
              className="h-8 w-8 p-0"
              title={`Reject (${contraCount})`}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
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
          <div className="space-y-2 pb-3 border-b animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg text-xs">
              {proVotes.length > 0 && (
                <div>
                  <p className="font-medium text-green-600 dark:text-green-400 mb-1">Approved by:</p>
                  <div className="flex flex-wrap gap-1">
                    {proVotes.map(vote => (
                      <Badge key={vote.id} variant="outline" className="bg-green-50 dark:bg-green-900/20 border-green-200">
                        {vote.user?.name || 'Unknown'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {neutralVotes.length > 0 && (
                <div>
                  <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">Neutral:</p>
                  <div className="flex flex-wrap gap-1">
                    {neutralVotes.map(vote => (
                      <Badge key={vote.id} variant="outline" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                        {vote.user?.name || 'Unknown'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {contraVotes.length > 0 && (
                <div>
                  <p className="font-medium text-red-600 dark:text-red-400 mb-1">Rejected by:</p>
                  <div className="flex flex-wrap gap-1">
                    {contraVotes.map(vote => (
                      <Badge key={vote.id} variant="outline" className="bg-red-50 dark:bg-red-900/20 border-red-200">
                        {vote.user?.name || 'Unknown'}
                      </Badge>
                    ))}
                  </div>
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
                <span className="font-medium">Halfway to acceptance. {Math.max(75 - approvalPercentage, 0).toFixed(0)}% more PRO needed.</span>
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
        <div className="border-t pt-3">
        <button
          onClick={() => setIsThreadExpanded(!isThreadExpanded)}
          className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>
              {suggestion.comments.length === 0 
                ? "No comments yet" 
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
          <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {suggestion.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 italic">
                No comments yet. Be the first to share your thoughts!
              </p>
            ) : (
              <div className="space-y-3">
                {topLevelComments.map((comment) => {
                  const commentDate = new Date(comment.createdAt);
                  const timeAgo = getTimeAgo(commentDate);
                  const replies = getReplies(comment.id);
                  
                  return (
                    <div key={comment.id} className="space-y-2">
                      {/* Top-level Comment */}
                      <div className="flex gap-3 p-3 rounded-lg bg-muted/30">
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
                          <div className="flex gap-2 p-3 bg-background rounded-lg border border-border">
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
              <div className="flex gap-2 p-3 bg-muted/30 rounded-lg border border-border">
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
