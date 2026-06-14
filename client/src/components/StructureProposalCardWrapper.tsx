import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SuggestionCard } from './SuggestionCard';
import { StructureOperationsSummary } from './shared/StructureOperationsSummary';
import { CompleteVoteButton } from './shared/CompleteVoteButton';
import { Button } from './ui/button';
import { StatusBadge } from './shared/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Alert, AlertDescription } from './ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Organization, StructureProposal, User } from '../types';
import { adaptStructureProposalToSuggestion } from '../utils/proposalAdapter';
import { handleStructureVote, handleStructureComment, handleStructureComplete, handleStructureDelete } from '../utils/structureProposalAdapter';
import { SPACING, COLORS, TOUCH_TARGETS, NAVIGATION, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { Icon } from './ui/Icon';
import { useTimezone } from '../hooks/useTimezone';

interface StructureProposalCardWrapperProps {
  structureProposal: StructureProposal;
  documentId: string;
  currentUser: User;
  allCollaborators: User[];
  onVote: () => void; // Refresh callback
  onComplete?: () => void;
  canComplete?: boolean;
  onDelete?: () => void; // Optional delete callback
  /** When provided, card uses organization branding color for border */
  organization?: Organization | null;
}

/**
 * Wrapper component that adapts StructureProposal to use SuggestionCard
 * Follows the same pattern as ActivityFeedProposalCard
 */
export function StructureProposalCardWrapper({
  structureProposal,
  documentId,
  currentUser,
  allCollaborators,
  onVote,
  onComplete,
  canComplete = false,
  onDelete,
  organization,
}: StructureProposalCardWrapperProps) {
  const { t } = useTranslation('documents');
  const { formatRelativeTime } = useTimezone();
  const [isVoting, setIsVoting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showViewChanges, setShowViewChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Convert structure proposal to Suggestion format
  const suggestion = useMemo(() => {
    return adaptStructureProposalToSuggestion(structureProposal, documentId, allCollaborators);
  }, [structureProposal, documentId, allCollaborators]);

  const isApproved = structureProposal.approved;
  const isApplied = structureProposal.applied;
  const isCreator = structureProposal.user.id === currentUser.id;
  const totalUsers = allCollaborators.length;

  // Handle vote
  const handleVote = async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (isVoting || isApplied) return;
    setIsVoting(true);
    try {
      await handleStructureVote(suggestionId, documentId, voteType);
      onVote();
    } catch (error) {
      // Error already handled in adapter
    } finally {
      setIsVoting(false);
    }
  };

  // Handle comment
  const handleComment = async (suggestionId: string, text: string, parentId?: string) => {
    try {
      await handleStructureComment(suggestionId, documentId, text, parentId);
      onVote(); // Refresh to show new comment
    } catch (error) {
      // Error already handled in adapter
    }
  };

  // Handle complete vote
  const quorumMet = structureProposal.quorumMet ?? false;
  const votingDeadline = structureProposal.votingDeadline ?? (structureProposal as { voting_deadline?: string }).voting_deadline;
  const votingClosed = votingDeadline && new Date(votingDeadline) <= new Date();
  const canCompleteVote = canComplete && !isApplied && !votingClosed && quorumMet;

  const confirmCompleteVote = async () => {
    if (isApplying || !canCompleteVote) return;
    setIsApplying(true);
    try {
      await handleStructureComplete(structureProposal.id, documentId);
      onComplete?.();
      onVote(); // Refresh
    } catch (error) {
      // Error already handled in adapter
    } finally {
      setIsApplying(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (isDeleting || isApplied) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await handleStructureDelete(structureProposal.id, documentId);
      onDelete?.();
      onVote(); // Refresh
    } catch (error) {
      // Error already handled in adapter
    } finally {
      setIsDeleting(false);
    }
  };

  // Get status badge
  const getStatusBadge = () => {
    if (isApplied) {
      return <StatusBadge status="applied" icon={<Icon name="CheckCircle2" className="w-3 h-3" />} label={t('structure.applied')} />;
    }
    if (isApproved) {
      return <StatusBadge status="approved" icon={<Icon name="CheckCircle2" className="w-3 h-3" />} label={t('structure.approved')} />;
    }
    return <StatusBadge status="active" icon={<Icon name="Clock" className="w-3 h-3" />} label={t('structure.voting')} />;
  };

  // Custom content section (operations summary + deadline when set)
  const customContentSection = (
    <div className={cn(SPACING.content.gap)}>
      {votingDeadline && !votingClosed && (
        <p className={cn('text-xs text-muted-foreground flex items-center gap-1')}>
          <Icon name="Clock" className="h-3 w-3" />
          {t('votingEndsIn', { relative: formatRelativeTime(votingDeadline) })}
        </p>
      )}
      <div className={cn('flex items-center gap-2', SPACING.tight.inline)}>
        <Icon name="Network" className={cn('w-5 h-5', COLORS.text.primary)} />
        <h4 className={cn('font-medium', COLORS.text.primary)}>
          Structural Changes ({structureProposal.operations.length})
        </h4>
      </div>
      <div className={cn(COLORS.bg.muted, SPACING.card.padding, RADIUS.panel)}>
        <StructureOperationsSummary
          operations={structureProposal.operations}
          expandable={true}
          maxVisible={3}
        />
      </div>
    </div>
  );

  // Custom actions (Apply, Delete, View Changes)
  const customActions = (
    <div className={cn('flex flex-wrap gap-2', SPACING.tight.inline, 'pt-4 mt-4', COLORS.border.standard, 'border-t')}>
      <Dialog open={showViewChanges} onOpenChange={setShowViewChanges}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className={cn(TOUCH_TARGETS.button)}>
            <Icon name="Eye" className="w-4 h-4 mr-1" /> View Changes
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('structure.structuralChangesPreview')}</DialogTitle>
          </DialogHeader>
          <div className={cn(SPACING.content.gap)}>
            {structureProposal.operations.map((op, index) => (
              <Alert key={op.id || `op-${index}`}>
                <AlertDescription>
                  <strong>{op.operationType}:</strong>{' '}
                  {op.operationType === 'MOVE' && `Move section to position ${op.newPositionIndex}`}
                  {op.operationType === 'MERGE' && `Merge ${op.sourceParagraphIds?.length || 0} sections into one`}
                  {op.operationType === 'DELETE' && 'Mark section for deletion'}
                  {op.operationType === 'RENAME_HEADING' && `Rename heading to "${op.newText}"`}
                  {op.operationType === 'CHANGE_HEADING_LEVEL' && `Change heading level to ${op.newHeadingLevel}`}
                  {op.operationType === 'INSERT_NEW' && 'Insert new section'}
                  {!['MOVE', 'MERGE', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'].includes(op.operationType) && op.operationType}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {canComplete && !isApplied && !votingClosed && (
        <CompleteVoteButton
          quorumMet={quorumMet}
          onComplete={confirmCompleteVote}
          confirmDescription={t('structure.completeVoteDescription')}
          disabled={isApplying}
          loading={isApplying}
          label={t('structure.completeVote')}
        />
      )}
    </div>
  );

  return (
    <>
      <SuggestionCard
      suggestion={suggestion}
      totalUsers={totalUsers}
      currentUser={currentUser}
      allCollaborators={allCollaborators}
      onVote={handleVote}
      onComment={handleComment}
      onUpvoteComment={() => onVote()}
      customContentSection={customContentSection}
      customActions={customActions}
      extraActionsInRow={isCreator && !isApplied ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                disabled={isDeleting}
                className={cn("size-9 shrink-0", RADIUS.control, COLORS.text.secondary, "hover:bg-destructive/10 hover:text-destructive")}
                aria-label={isDeleting ? t('structure.deleting') : t('delete')}
                title={isDeleting ? t('structure.deleting') : t('delete')}
              >
                {isDeleting ? (
                  <div className={cn(NAVIGATION.icon.sm, "border-2 border-current border-t-transparent animate-spin", RADIUS.pill)} />
                ) : (
                  <Icon name="Trash2" className={NAVIGATION.icon.sm} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isDeleting ? t('structure.deleting') : t('structure.deleteStructureProposal')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : undefined}
      tabBadge={getStatusBadge()}
      showDiffInline={false}
      organization={organization ?? undefined}
      organizationBorderColor={organization?.brandingColor ?? null}
    />

      {/* Confirmation Dialogs */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('structure.deleteStructureProposal')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('structure.deleteStructureProposalConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('createDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}

