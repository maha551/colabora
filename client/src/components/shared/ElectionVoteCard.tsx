import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { StatusBadge } from './StatusBadge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { InlineVoteButtons } from './InlineVoteButtons';
import { CompleteVoteButton } from './CompleteVoteButton';
import { useTimezone } from '../../hooks/useTimezone';
import { Organization, RepresentativeElection, OrganizationVote, User } from '../../types';
import type { Comment } from '../../types';
import { SPACING, COLORS, HIERARCHY, NAVIGATION, RADIUS } from '../../lib/designSystem';
import { useDesignSystemLabels } from '../../hooks/useDesignSystemLabels';
import { getVoteTypeIconName } from '../../lib/voteUtils';
import { cn } from '../ui/utils';
import { Icon } from '../ui/Icon';
import { toOrgVote } from '../../utils/voteAdapter';
import { VoteProgressBar } from '../ui/VoteProgressBar';
import { governanceApi, organizationsApi } from '../../lib/api';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

interface ElectionVoteCardProps {
  type: 'election' | 'organization-vote';
  data: RepresentativeElection | OrganizationVote;
  currentUser: User;
  organization: Organization;
  /** For organization votes: pass vote value for inline voting, or call with no args to open dialog */
  onVote?: (voteValue?: 'yes' | 'no' | 'abstain') => void | Promise<void>;
  onViewDetails?: () => void;
  onComplete?: () => void;
  /** When provided, proposed org votes show Approve + Decline (rep only) */
  onApproveVote?: (voteId: string) => void | Promise<void>;
  onDeclineVote?: (vote: OrganizationVote) => void;
  variant?: 'compact' | 'detailed';
  isRepresentative?: boolean;
  isActiveMember?: boolean;
  completingVoteId?: string | null;
  approvingVoteId?: string | null;
  /**
   * Current user's vote (for organization votes with inline UI).
   * Note: getOrganizationVotes returns only aggregates (resultYes/No/Abstain), not ballots.
   * "You voted" highlight will not show until backend adds user's vote to the response.
   */
  userVote?: 'yes' | 'no' | 'abstain' | null;
  /** Vote ID being submitted (for loading state) */
  submittingVoteId?: string | null;
  /** Custom confirmation description for Complete button (e.g. mistrust vote warning) */
  completeConfirmDescription?: string;
  /** For organization votes: whether participation threshold (quorum) is met for Complete button */
  quorumMet?: boolean;
  /** When provided, elections show Cancel button (rep or creator); (electionId, organizationId) => call after cancel to refresh */
  onCancelElection?: (electionId: string, organizationId: string) => void | Promise<void>;
}

export function ElectionVoteCard({
  type,
  data,
  currentUser,
  organization,
  onVote,
  onViewDetails,
  onComplete,
  onApproveVote,
  onDeclineVote,
  variant = 'compact',
  isRepresentative = false,
  isActiveMember = false,
  completingVoteId = null,
  approvingVoteId = null,
  userVote = null,
  submittingVoteId = null,
  completeConfirmDescription,
  quorumMet = false,
  onCancelElection,
}: ElectionVoteCardProps) {
  const { t } = useTranslation('governance');
  const { cardActions } = useDesignSystemLabels();
  const { formatRelativeTime } = useTimezone();
  const cardStyle = organization?.brandingColor ? { borderColor: organization.brandingColor, borderWidth: '2px' as const } : undefined;

  const entityId = type === 'election' ? (data as RepresentativeElection).id : (data as OrganizationVote).id;
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadComments = useCallback(async () => {
    if (!organization?.id || !entityId) return;
    setCommentsLoading(true);
    try {
      if (type === 'election') {
        const res = await governanceApi.electionsApi.getComments(organization.id, entityId, { limit: 50 });
        setComments(res.comments);
      } else {
        const res = await organizationsApi.getVoteComments(organization.id, entityId, { limit: 50 });
        setComments(res.comments);
      }
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [type, organization?.id, entityId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleAddComment = useCallback(async () => {
    const trimmed = newCommentText.trim();
    if (!trimmed || !organization?.id || !entityId) return;
    setSubmittingComment(true);
    try {
      if (type === 'election') {
        await governanceApi.electionsApi.addComment(organization.id, entityId, { text: trimmed });
      } else {
        await organizationsApi.addVoteComment(organization.id, entityId, { text: trimmed });
      }
      setNewCommentText('');
      await loadComments();
      toast.success('Comment added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  }, [type, organization?.id, entityId, newCommentText, loadComments]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!organization?.id || !entityId) return;
    try {
      if (type === 'election') {
        await governanceApi.electionsApi.deleteComment(organization.id, entityId, commentId);
      } else {
        await organizationsApi.deleteVoteComment(organization.id, entityId, commentId);
      }
      await loadComments();
      toast.success('Comment deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete comment');
    }
  }, [type, organization?.id, entityId, loadComments]);

  const topLevelComments = comments.filter(c => !c.parentId);
  const label = type === 'election' ? 'election' : 'vote';

  const DiscussionSection = () => (
    <div className={cn(HIERARCHY.majorSection)}>
      <div className={cn(RADIUS.panel, 'bg-muted/40 border border-border/40 overflow-hidden')}>
        <button
          type="button"
          onClick={() => setCommentsExpanded((e) => !e)}
          className={cn(
            'flex items-center gap-2 p-3 w-full text-left',
            SPACING.content.inline,
            'hover:bg-muted/60 transition-colors'
          )}
        >
          <Icon name="MessageSquare" className={cn('h-4 w-4 flex-shrink-0', COLORS.text.secondary)} />
          <span className={cn('text-sm font-medium', COLORS.text.primary)}>
            Discussion {commentsLoading ? '…' : `(${topLevelComments.length})`}
          </span>
        </button>
        {commentsExpanded && (
          <div className={cn('border-t border-border/40 p-3', SPACING.content.gap)}>
            {commentsLoading ? (
              <p className={cn('text-sm', COLORS.text.secondary)}>Loading comments…</p>
            ) : (
              <>
                {topLevelComments.length === 0 ? (
                  <p className={cn('text-sm', COLORS.text.secondary)}>No comments yet. Be the first to share your thoughts.</p>
                ) : (
                  <ul className={cn('space-y-2', SPACING.content.gap)}>
                    {topLevelComments.map((c) => (
                      <li key={c.id} className={cn('text-sm', COLORS.text.primary)}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-medium">{c.user?.name ?? 'Unknown'}</span>
                            <span className={cn('text-xs ml-2', COLORS.text.secondary)}>
                              {formatRelativeTime(c.createdAt)}
                            </span>
                            <p className="mt-0.5 break-words">{c.text}</p>
                          </div>
                          {c.userId === currentUser.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteComment(c.id)}
                              aria-label={t('deleteComment')}
                            >
                              <Icon name="Trash2" className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pt-2">
                  <Textarea
                    placeholder={`Add a comment on this ${label}…`}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    rows={2}
                    className="mb-2"
                    maxLength={1000}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={!newCommentText.trim() || submittingComment}
                  >
                    {submittingComment ? 'Posting…' : 'Post'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (type === 'election') {
    const election = data as RepresentativeElection;
    const candidatesCount = election.candidates?.filter(c => c.acceptedNomination).length || 0;
    const timeRemaining = election.votingEndsAt && new Date(election.votingEndsAt) > new Date()
      ? formatRelativeTime(election.votingEndsAt)
      : null;
    const isActive = election.status === 'active' || election.status === 'voting';
    const isAnnounced = election.status === 'announced' || election.status === 'nomination';
    const isDraft = election.status === 'draft';
    const canCancelElection =
      onCancelElection &&
      (isRepresentative || election.createdBy === currentUser.id) &&
      ['draft', 'announced', 'nomination', 'active', 'voting'].includes(election.status);

    const createdByMember = organization.members?.find(m => m.user.id === election.createdBy);
    const createdByUser = createdByMember?.user;

    return (
      <Card className="hover:shadow-md transition-shadow overflow-hidden" style={cardStyle}>
        {isActive && (
          <VoteProgressBar
            variant="election"
            votesCast={election.votesCast}
            totalVoters={election.totalVoters}
            totalEligibleVoters={election.totalVoters || 1}
          />
        )}

        <CardContent className={SPACING.card.padding}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-lg">{election.electionTitle}</h4>
              {isDraft && <StatusBadge status="draft" />}
              {isAnnounced && <StatusBadge status="announced" icon={<Icon name="Clock" className="h-3 w-3" />} />}
              {isActive && <StatusBadge status="active" icon={<Icon name="Clock" className="h-3 w-3" />} label={t('active')} />}
            </div>
            {election.electionDescription && (
              <p className="text-sm text-muted-foreground">{election.electionDescription}</p>
            )}
            {/* Same-line row: creator (optional) + meta + actions — aligned with SuggestionCard / org-vote */}
            <div className={cn("flex flex-wrap items-center gap-2", SPACING.content.responsive)}>
              {createdByUser && (
                <>
                  <Avatar className="h-9 w-9 flex-shrink-0 border-2 shadow-sm">
                    <AvatarImage src={createdByUser.avatar} />
                    <AvatarFallback className="text-xs font-medium">
                      {createdByUser.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn("text-sm font-semibold", COLORS.text.primary)}>{createdByUser.name}</span>
                  <div className="h-6 w-px bg-border/60 mx-1" aria-hidden="true" />
                </>
              )}
              <div className={cn("flex items-center", SPACING.content.inline, "text-xs text-muted-foreground")}>
                <span className="flex items-center gap-1">
                  <Icon name="Users" className="h-3 w-3" />
                  {candidatesCount} candidate{candidatesCount !== 1 ? 's' : ''}
                </span>
                {timeRemaining && (
                  <span className="flex items-center gap-1">
                    <Icon name="Clock" className="h-3 w-3" />
                    Ends {timeRemaining}
                  </span>
                )}
                {election.positionsAvailable > 1 && (
                  <span className="flex items-center gap-1">
                    <Icon name="CheckCircle" className="h-3 w-3" />
                    {election.positionsAvailable} positions
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0" />
              <div className={cn("flex items-center flex-shrink-0 gap-2", SPACING.content.inline)}>
                {isActive && isActiveMember && onVote && (
                  <Button size="sm" variant="default" onClick={onVote}>
                    <Icon name="Vote" className="h-4 w-4 mr-1" />
                    {cardActions.voteNow}
                  </Button>
                )}
                {isActive && isRepresentative && onComplete && (
                  <Button size="sm" variant="default" onClick={onComplete}>
                    <Icon name="CheckCircle" className="h-4 w-4 mr-1" />
                    View Results & Complete
                  </Button>
                )}
                {canCancelElection && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Icon name="XCircle" className="h-4 w-4 mr-1" />
                        Cancel election
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this election?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will end the election and set its status to cancelled. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep election</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => onCancelElection?.(election.id, organization.id)}
                        >
                          Cancel election
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {onViewDetails && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onViewDetails}
                    className={cn("px-3 text-xs font-medium", COLORS.text.secondary, "hover:" + COLORS.text.primary)}
                    title={t('viewFullElectionDetails')}
                  >
                    Details
                  </Button>
                )}
              </div>
            </div>
            {!isActive && isAnnounced && (
              <div className="text-xs text-muted-foreground">
                Voting will begin {election.votingStartsAt
                  ? formatRelativeTime(election.votingStartsAt)
                  : 'soon'}
              </div>
            )}

            <DiscussionSection />
          </div>
        </CardContent>
      </Card>
    );
  } else {
    const vote = data as OrganizationVote;
    const totalVotes = vote.resultYes + vote.resultNo + vote.resultAbstain;
    const totalEligibleVoters = organization.members?.filter(m => m.status === 'active').length || 0;
    const isMistrustVote = vote.voteType === 'representative_removal';
    const isProposed = vote.status === 'proposed';
    const isActive = vote.status === 'approved' || vote.status === 'voting';

    const allCollaborators = organization.members?.filter(m => m.status === 'active').map(m => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email
    })) || [];

    const proposedByMember = organization.members?.find(m => m.user.id === vote.proposedByUserId);
    const proposedBy = proposedByMember?.user;
    const isApproving = approvingVoteId === vote.id;

    return (
      <Card className="hover:shadow-md transition-shadow overflow-hidden" style={cardStyle}>
        {/* 4-segment status bar — only when vote is active (not proposed) */}
        {isActive && (
          <VoteProgressBar
            aggregatedCounts={{
              pro: vote.resultYes,
              neutral: vote.resultAbstain,
              contra: vote.resultNo,
            }}
            totalEligibleVoters={totalEligibleVoters || 1}
            allCollaborators={allCollaborators}
            isAnonymous={false}
          />
        )}

        <CardContent className={SPACING.card.padding}>
          <div className="flex flex-col gap-3">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Icon name={getVoteTypeIconName(vote.voteType)} size="md" aria-hidden />
              <h4 className="font-semibold text-lg">{vote.title}</h4>
              {isProposed && (
                <StatusBadge status="proposed" label={t('proposed')} />
              )}
              {isMistrustVote && (
                <StatusBadge status="pending" icon={<Icon name="AlertTriangle" className="h-3 w-3" />} label={t('mistrustVote')} />
              )}
              {isActive && (
                <StatusBadge status="active" icon={<Icon name="Clock" className="h-3 w-3" />} label={t('active')} />
              )}
            </div>
            {vote.description && (
              <p className="text-sm text-muted-foreground">{vote.description}</p>
            )}
            {isProposed && (
              <p className="text-xs text-muted-foreground">
                Threshold: {Math.round(vote.threshold)}% approval needed
              </p>
            )}

            {/* Same-line row: proposer + meta + vote buttons / Approve+Decline + Details — aligned with SuggestionCard */}
            <div className={cn("flex flex-wrap items-center gap-2", SPACING.content.responsive)}>
              {proposedBy && (
                <>
                  <Avatar className="h-9 w-9 flex-shrink-0 border-2 shadow-sm">
                    <AvatarImage src={proposedBy.avatar} />
                    <AvatarFallback className="text-xs font-medium">
                      {proposedBy.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn("text-sm font-semibold", COLORS.text.primary)}>{proposedBy.name}</span>
                  <div className="h-6 w-px bg-border/60 mx-1" aria-hidden="true" />
                </>
              )}
              {!isProposed && (
                <div className={cn("flex items-center", SPACING.content.inline, "text-xs text-muted-foreground")}>
                  <span className="flex items-center gap-1">
                    <Icon name="Vote" className="h-3 w-3" />
                    {totalVotes} of {totalEligibleVoters} votes cast
                  </span>
                  {vote.votingEndsAt && (
                    <span className="flex items-center gap-1">
                      <Icon name="Clock" className="h-3 w-3" />
                      Ends {formatRelativeTime(vote.votingEndsAt)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0" />
              <div className={cn("flex items-center flex-shrink-0 gap-2", SPACING.content.inline)}>
                {/* Proposed: Approve + Decline (icon) for reps */}
                {isProposed && isRepresentative && (
                  <>
                    {onApproveVote && (
                      <Button
                        size="sm"
                        onClick={() => onApproveVote(vote.id)}
                        disabled={isApproving}
                        className="gap-1.5"
                      >
                        <Icon name="CheckCircle" className="h-4 w-4" />
                        {isApproving ? 'Approving...' : 'Approve Vote'}
                      </Button>
                    )}
                    {onDeclineVote && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDeclineVote(vote)}
                              disabled={isApproving}
                              className={cn("size-9 shrink-0", RADIUS.control, COLORS.text.secondary, "hover:bg-destructive/10 hover:text-destructive")}
                              aria-label={t('declineVote')}
                              title={t('declineVote')}
                            >
                              <Icon name="Trash2" className={NAVIGATION.icon.sm} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Decline this vote (representative only)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </>
                )}
                {isActive && isActiveMember && onVote && (
                  <InlineVoteButtons
                    userVote={userVote === 'yes' ? 'PRO' : userVote === 'no' ? 'CONTRA' : userVote === 'abstain' ? 'NEUTRAL' : null}
                    onVote={(v) => onVote(toOrgVote(v))}
                    disabled={completingVoteId === vote.id}
                    loading={submittingVoteId === vote.id}
                  />
                )}
                {onViewDetails && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onViewDetails}
                    className={cn("px-3 text-xs font-medium", COLORS.text.secondary, "hover:" + COLORS.text.primary)}
                    title={t('viewFullVoteDetails')}
                  >
                    Details
                  </Button>
                )}
              </div>
            </div>

            {/* Rep-only: complete vote on its own row so it is not clipped beside inline vote buttons */}
            {isActive && isRepresentative && onComplete && (
              <div className={cn('flex items-center flex-wrap', SPACING.content.inline)}>
                <CompleteVoteButton
                  quorumMet={quorumMet}
                  onComplete={onComplete}
                  label={t('complete')}
                  confirmDescription={completeConfirmDescription ?? t('completeVoteConfirmDescription')}
                  disabled={completingVoteId === vote.id}
                  loading={completingVoteId === vote.id}
                />
              </div>
            )}

            <DiscussionSection />
          </div>
        </CardContent>
      </Card>
    );
  }
}

