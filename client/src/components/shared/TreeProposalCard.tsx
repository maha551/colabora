import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Icon } from '../ui/Icon';
import { SHADOWS, SPACING, COLORS, HIERARCHY, NAVIGATION, RADIUS } from '../../lib/designSystem';
import { useTimezone } from '../../hooks/useTimezone';
import { useDesignSystemLabels } from '../../hooks/useDesignSystemLabels';
import { cn } from '../ui/utils';
import { DocumentTreeProposal, Document, Organization, User } from '../../types';
import { VoteProgressBar } from '../ui/VoteProgressBar';
import { CompleteVoteButton } from './CompleteVoteButton';
import { InlineVoteButtons } from './InlineVoteButtons';
import { documentTreeProposalsApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { getVoteErrorMessage, getUserFriendlyErrorMessage } from '../../utils/errorMessages';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export type TreeProposalCardMode = 'rep' | 'member';

export interface TreeProposalCardProps {
  proposal: DocumentTreeProposal;
  document?: Document;
  currentUser: User;
  allCollaborators: User[];
  /** Rep mode: show CompleteVoteButton. Member mode: show VoteProgressBar + InlineVoteButtons */
  mode: TreeProposalCardMode;
  onVote?: () => void;
  onComplete?: () => void;
  onRefreshDocuments?: () => void;
  onNavigateToDocument?: (documentId: string) => void;
  /** When provided, card border uses organization branding color */
  organization?: Organization | null;
  /** When true, current user can cancel the proposal (rep). In rep mode this is implicitly true. */
  isRepresentative?: boolean;
}

/**
 * Shared card for displaying document tree proposals.
 * Used in RepresentativesTab (rep mode) and DashboardTab (member mode).
 */
function TreeProposalCardComponent({
  proposal,
  document,
  currentUser,
  allCollaborators,
  mode,
  onVote,
  onComplete,
  onRefreshDocuments,
  onNavigateToDocument,
  organization,
  isRepresentative: isRepresentativeProp,
}: TreeProposalCardProps) {
  const { cardActions } = useDesignSystemLabels();
  const { formatRelativeTime } = useTimezone();
  const cardStyle = organization?.brandingColor ? { borderColor: organization.brandingColor, borderWidth: '2px' as const } : undefined;
  const quorumMet = proposal.quorumMet ?? false;
  const canComplete = mode === 'rep' && quorumMet;
  const isRep = mode === 'rep' || isRepresentativeProp === true;
  const isCreator = proposal.proposedByUserId === currentUser?.id;
  const canWithdrawOrCancel = proposal.status === 'pending' && (isCreator || isRep);
  const userVote = proposal.votes?.find(v => v.userId === currentUser?.id)?.vote;
  const proposalVotes =
    proposal.votes?.map(v => ({
      userId: v.userId,
      vote: v.vote,
      user: (v as { user?: { id: string; name: string } }).user,
    })) ?? [];
  const totalEligible = allCollaborators.length;
  const proposerUser = allCollaborators.find(c => c.id === proposal.proposedByUserId);
  const proposerName = proposal.proposedByName ?? proposerUser?.name ?? undefined;
  const votingDeadline = proposal.votingDeadline ?? undefined;
  const deadlineNotPassed = votingDeadline && new Date(votingDeadline) > new Date();

  const handleComplete = async () => {
    await documentTreeProposalsApi.completeTreeProposal(proposal.id);
    toast.success('Vote completed successfully');
    onComplete?.();
    onVote?.();
    onRefreshDocuments?.();
  };

  const [submittingVote, setSubmittingVote] = useState<'PRO' | 'NEUTRAL' | 'CONTRA' | null>(null);

  const handleVote = async (vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    setSubmittingVote(vote);
    try {
      await documentTreeProposalsApi.voteOnProposal(proposal.id, vote);
      toast.success('Vote recorded');
      onVote?.();
    } catch (error) {
      logger.error('Failed to vote on tree proposal', error);
      const displayMessage =
        error && typeof error === 'object' && 'code' in error
          ? getVoteErrorMessage((error as { code?: string }).code, (error instanceof Error ? error.message : null) || 'Failed to cast vote')
          : getUserFriendlyErrorMessage(error, 'Failed to cast vote');
      toast.error(displayMessage);
    } finally {
      setSubmittingVote(null);
    }
  };

  const handleWithdrawOrCancel = async () => {
    try {
      await documentTreeProposalsApi.cancelProposal(proposal.id);
      toast.success(isCreator ? 'Proposal withdrawn' : 'Proposal cancelled');
      onVote?.();
      onRefreshDocuments?.();
    } catch (error) {
      logger.error('Failed to withdraw/cancel tree proposal', error);
      toast.error('Failed to withdraw or cancel proposal');
    }
  };

  /** Discussion placeholder — same pattern as ElectionVoteCard / SuggestionCard */
  const DiscussionSection = () => (
    <div className={cn(HIERARCHY.majorSection)}>
      <div className={cn('flex items-center gap-2 p-3 bg-muted/40 border border-border/40', RADIUS.panel, SPACING.content.inline)}>
        <Icon name="MessageSquare" className={cn('h-4 w-4 flex-shrink-0', COLORS.text.secondary)} />
        <span className={cn('text-sm', COLORS.text.secondary)}>
          Discussion for this proposal takes place on the document. Use View to open and participate.
        </span>
      </div>
    </div>
  );

  if (mode === 'rep') {
    return (
      <Card className={cn('overflow-hidden', SHADOWS.md)} style={cardStyle}>
        <div className={cn(SPACING.card.padding, 'flex flex-col gap-3')}>
          {deadlineNotPassed && (
            <p className={cn('text-xs text-muted-foreground flex items-center gap-1')}>
              <Icon name="Clock" className="h-3 w-3" />
              Voting ends {formatRelativeTime(votingDeadline!)}
            </p>
          )}
          {(proposerName || proposerUser) && (
            <div className={cn('flex items-center gap-2', SPACING.content.inline)}>
              <Avatar className="h-9 w-9 flex-shrink-0 border-2 shadow-sm">
                <AvatarImage src={proposerUser?.avatar} />
                <AvatarFallback className="text-xs font-medium">
                  {(proposerName ?? proposerUser?.name)?.split(' ').map((n: string) => n[0]).join('') || '?'}
                </AvatarFallback>
              </Avatar>
              <span className={cn('text-sm font-semibold', COLORS.text.primary)}>{proposerName ?? proposerUser?.name}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium">
                Tree {proposal.operationType}: {proposal.reason || 'No reason'}
              </h4>
              {document && <p className="text-sm text-muted-foreground">Document: {document.title}</p>}
            </div>
            <div className={cn('flex items-center', SPACING.content.inline)}>
          {canComplete && (
            <CompleteVoteButton
              quorumMet={quorumMet}
              onComplete={handleComplete}
              confirmDescription="This will close voting and apply the tree structure change if the proposal is approved."
            />
          )}
          {canWithdrawOrCancel && (
            <TooltipProvider>
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className={cn(COLORS.text.secondary, 'shrink-0')} aria-label={isCreator ? 'Withdraw proposal' : 'Cancel proposal'}>
                        <Icon name="Trash2" className={NAVIGATION.icon.sm} />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isCreator ? 'Withdraw proposal' : 'Cancel proposal'}</p>
                  </TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{isCreator ? 'Withdraw proposal?' : 'Cancel proposal?'}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isCreator
                        ? 'This will withdraw your tree proposal. Voting will end and the proposal will be removed.'
                        : 'This will cancel this tree proposal. Voting will end and the proposal will be removed.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction onClick={handleWithdrawOrCancel}>{isCreator ? 'Withdraw' : 'Cancel'}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TooltipProvider>
          )}
          {document && onNavigateToDocument && (
            <Button size="sm" variant="outline" onClick={() => onNavigateToDocument(document.id)}>
              <Icon name="ArrowRight" className="h-4 w-4 ml-1" />
              View
            </Button>
          )}
            </div>
          </div>
          <DiscussionSection />
        </div>
      </Card>
    );
  }

  // Member mode: full voting UI
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow" style={cardStyle}>
      <VoteProgressBar
        votes={proposalVotes}
        totalEligibleVoters={totalEligible}
        allCollaborators={allCollaborators}
        isAnonymous={document?.options?.votingAnonymous ?? false}
      />
      <CardContent className={cn(SPACING.card.padding, 'flex flex-col gap-3')}>
        {deadlineNotPassed && (
          <p className={cn('text-xs text-muted-foreground flex items-center gap-1')}>
            <Icon name="Clock" className="h-3 w-3" />
            Voting ends {formatRelativeTime(votingDeadline!)}
          </p>
        )}
        {(proposerName || proposerUser) && (
          <div className={cn('flex items-center gap-2', SPACING.content.inline)}>
            <Avatar className="h-9 w-9 flex-shrink-0 border-2 shadow-sm">
              <AvatarImage src={proposerUser?.avatar} />
              <AvatarFallback className="text-xs font-medium">
                {(proposerName ?? proposerUser?.name)?.split(' ').map((n: string) => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <span className={cn('text-sm font-semibold', COLORS.text.primary)}>{proposerName ?? proposerUser?.name}</span>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold">
                Tree {proposal.operationType}: {proposal.reason || 'No reason provided'}
              </h4>
              <Badge variant="outline" className="text-xs">
                {proposal.status}
              </Badge>
            </div>
            {document && (
              <p className="text-xs text-muted-foreground mb-2">Document: {document.title}</p>
            )}
            {!userVote && (
              <InlineVoteButtons
                userVote={null}
                onVote={handleVote}
                disabled={false}
                loading={false}
                submittingVote={submittingVote}
              />
            )}
            {userVote && (
              <p className="text-xs text-muted-foreground mt-2">
                Your vote: <span className="font-medium">{userVote}</span>
              </p>
            )}
          </div>
          <div className={cn('flex items-center', SPACING.content.inline)}>
            {canWithdrawOrCancel && (
              <TooltipProvider>
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className={cn(COLORS.text.secondary, 'shrink-0')} aria-label={isCreator ? 'Withdraw proposal' : 'Cancel proposal'}>
                          <Icon name="Trash2" className={NAVIGATION.icon.sm} />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isCreator ? 'Withdraw proposal' : 'Cancel proposal'}</p>
                    </TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{isCreator ? 'Withdraw proposal?' : 'Cancel proposal?'}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {isCreator
                          ? 'This will withdraw your tree proposal. Voting will end and the proposal will be removed.'
                          : 'This will cancel this tree proposal. Voting will end and the proposal will be removed.'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={handleWithdrawOrCancel}>{isCreator ? 'Withdraw' : 'Cancel'}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TooltipProvider>
            )}
            {document && onNavigateToDocument && (
              <Button size="sm" variant="outline" onClick={() => onNavigateToDocument(document.id)}>
                {cardActions.view}
                <Icon name="ArrowRight" className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
        <DiscussionSection />
      </CardContent>
    </Card>
  );
}

export const TreeProposalCard = React.memo(TreeProposalCardComponent);
