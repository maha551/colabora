import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Progress } from '../ui/progress';
import { BaseProposal, ProposalType } from './proposalTypes';
import { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';
import { Icon } from '../ui/Icon';
import { useTimezone } from '../../hooks/useTimezone';
import { VoteProgressBar } from '../ui/VoteProgressBar';
import { VoteButtonGroup } from './VoteButtonGroup';
import { normalizeVoteStatus, getVoteStatusLabel, isVoteActive } from '../../lib/voting';
import { cn } from '../ui/utils';
import { COLORS, NAVIGATION } from '../../lib/designSystem';
import { useTranslation } from 'react-i18next';

interface ProposalDetailsDialogProps {
  proposal: BaseProposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId?: string;
  onVote?: (proposalId: string, proposalType: ProposalType, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  fullProposalData?: {
    rule?: RuleProposal;
    structure?: StructureProposal;
    tree?: DocumentTreeProposal;
    deletion?: Document;
  };
  totalEligibleVoters?: number;
  allCollaborators?: Array<{ id: string; name: string; email?: string }>;
}

function ProposalDetailsDialogComponent({
  proposal,
  open,
  onOpenChange,
  currentUserId,
  onVote,
  fullProposalData,
  totalEligibleVoters: propTotalEligible,
  allCollaborators = [],
}: ProposalDetailsDialogProps) {
  const { t } = useTranslation('governance');
  const [isVoting, setIsVoting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const { formatDateTime, formatRelativeTime } = useTimezone();

  const getStatusLabel = (status?: string | null) => {
    const normalized = normalizeVoteStatus(status);
    const key = ['draft', 'active', 'approved', 'rejected', 'expired', 'implemented', 'pending', 'verified', 'completed', 'applied', 'cancelled'].includes(normalized)
      ? `proposalStatusBadge.${normalized === 'pending' ? 'draft' : normalized === 'verified' ? 'active' : normalized === 'completed' ? 'approved' : normalized === 'cancelled' ? 'rejected' : normalized}.label`
      : null;
    return key ? t(key) : getVoteStatusLabel(status);
  };

  const getProposalTypeLabel = (type: string) =>
    t(`proposalDetailsDialog.types.${type}`, { defaultValue: `${type.charAt(0).toUpperCase() + type.slice(1)} Proposal` });

  const handleVote = async (vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (!onVote || isVoting) return;
    setIsVoting(true);
    try {
      await onVote(proposal.id, proposal.type, vote);
    } finally {
      setIsVoting(false);
    }
  };

  const getStatusIcon = () => {
    switch (normalizeVoteStatus(proposal.status)) {
      case 'approved':
      case 'implemented':
      case 'applied':
      case 'completed':
        return <Icon name="CheckCircle2" className={cn('h-5 w-5', COLORS.status.success)} />;
      case 'rejected':
      case 'cancelled':
      case 'expired':
        return <Icon name="XCircle" className={cn('h-5 w-5', COLORS.status.error)} />;
      default:
        return <Icon name="Clock" className={cn('h-5 w-5', COLORS.status.warning)} />;
    }
  };


  const getTimeRemaining = () => {
    if (!proposal.deadline) return null;
    try {
      const deadline = new Date(proposal.deadline);
      const now = new Date();
      if (deadline < now) return t('proposalDetailsDialog.expired');
      return formatRelativeTime(deadline);
    } catch {
      return null;
    }
  };

  const approvalPercentage = proposal.approvalPercentage ?? 
    (proposal.votes && proposal.votes.total > 0 
      ? (proposal.votes.pro / proposal.votes.total) * 100 
      : 0);

  const normalizedStatus = normalizeVoteStatus(proposal.status);
  const statusClassName =
    ['approved', 'implemented', 'applied', 'completed'].includes(normalizedStatus)
      ? cn(COLORS.statusBg.success, COLORS.status.success)
      : ['rejected', 'expired', 'cancelled'].includes(normalizedStatus)
      ? cn(COLORS.statusBg.error, COLORS.status.error)
      : cn(COLORS.statusBg.warning, COLORS.status.warning);

  const canVote = isVoteActive(proposal.status);

  // Build vote data for VoteProgressBar
  const voteTotalEligible = propTotalEligible ?? Math.max(proposal.votes?.total ?? 0, 1);
  const aggregatedCounts = proposal.votes ? {
    pro: proposal.votes.pro,
    neutral: proposal.votes.neutral,
    contra: proposal.votes.contra,
  } : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">
                  {getProposalTypeLabel(proposal.type)}
                </Badge>
                <Badge
                  variant="secondary"
                  className={statusClassName}
                >
                  {getStatusLabel(proposal.status)}
                </Badge>
                {getStatusIcon()}
              </div>
              <DialogTitle className="text-2xl mt-2">
                {proposal.title || t('proposalDetailsDialog.fallbackTitle', { id: proposal.id.slice(0, 8) })}
              </DialogTitle>
              {proposal.description && (
                <DialogDescription className="mt-2 text-base">
                  {proposal.description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {aggregatedCounts && (
          <VoteProgressBar
            aggregatedCounts={aggregatedCounts}
            totalEligibleVoters={voteTotalEligible}
            allCollaborators={allCollaborators}
            isAnonymous={false}
            hideExpandedCounter={proposal.type === 'structure'}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className={NAVIGATION.tabs.trigger}>{t('proposalDetailsDialog.tabOverview')}</TabsTrigger>
            <TabsTrigger value="votes" className={NAVIGATION.tabs.trigger}>{t('proposalDetailsDialog.tabVotes', { count: proposal.votes?.total || 0 })}</TabsTrigger>
            <TabsTrigger value="details" className={NAVIGATION.tabs.trigger}>{t('proposalDetailsDialog.tabDetails')}</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="overview" className="space-y-4">
              {/* Status and Progress */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.statusProgress')}</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('proposalDetailsDialog.approvalRate')}</span>
                    <span className="font-medium">{approvalPercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={approvalPercentage} className="h-3" />
                  {proposal.quorumMet !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t('proposalDetailsDialog.quorum')}</span>
                      <span className={cn('font-medium', proposal.quorumMet ? COLORS.status.success : COLORS.status.warning)}>
                        {proposal.quorumMet ? t('proposalDetailsDialog.quorumMet') : t('proposalDetailsDialog.quorumPending')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Timeline */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.timeline')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Icon name="Calendar" className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('proposalDetailsDialog.created')}</span>
                    <span>{formatDateTime(proposal.createdAt)}</span>
                  </div>
                  {proposal.deadline && (
                    <div className="flex items-center gap-2">
                      <Icon name="Clock" className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t('proposalDetailsDialog.deadline')}</span>
                      <span>{formatDateTime(proposal.deadline)}</span>
                      <span className="text-muted-foreground">({getTimeRemaining()})</span>
                    </div>
                  )}
                  {proposal.createdBy && (
                    <div className="flex items-center gap-2">
                      <Icon name="User" className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t('proposalDetailsDialog.createdBy')}</span>
                      <span>{proposal.createdBy.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Proposal-Specific Details */}
              {proposal.type === 'rule' && fullProposalData?.rule && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.ruleChange')}</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">{t('proposalDetailsDialog.field')}</span> {fullProposalData.rule.ruleField}
                      </div>
                      {fullProposalData.rule.currentValue && (
                        <div>
                          <span className="font-medium">{t('proposalDetailsDialog.current')}</span> {String(fullProposalData.rule.currentValue)}
                        </div>
                      )}
                      {fullProposalData.rule.proposedValue && (
                        <div>
                          <span className="font-medium">{t('proposalDetailsDialog.proposed')}</span> {String(fullProposalData.rule.proposedValue)}
                        </div>
                      )}
                      {fullProposalData.rule.options && fullProposalData.rule.options.length > 0 && (
                        <div className="mt-2">
                          <span className="font-medium">{t('proposalDetailsDialog.options')}</span>
                          <ul className="list-disc list-inside mt-1 space-y-1">
                            {fullProposalData.rule.options.map(opt => (
                              <li key={opt.id}>
                                {opt.optionTitle}: {String(opt.proposedValue)}
                                {opt.votesReceived !== undefined && (
                                  <span className="text-muted-foreground ml-2">
                                    {t('proposalDetailsDialog.votesCount', { count: opt.votesReceived })}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {proposal.type === 'structure' && fullProposalData?.structure && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.structureOperations')}</h3>
                    <div className="space-y-2">
                      {fullProposalData.structure.operations.map((op, idx) => (
                        <div key={idx} className="p-2 bg-muted rounded text-sm">
                          <div className="font-medium">{op.operationType}</div>
                          {op.targetParagraphId && (
                            <div className="text-muted-foreground">{t('proposalDetailsDialog.target', { id: op.targetParagraphId })}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {proposal.type === 'tree' && fullProposalData?.tree && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.treeOperation')}</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">{t('proposalDetailsDialog.operation')}</span> {fullProposalData.tree.operationType}
                      </div>
                      {fullProposalData.tree.reason && (
                        <div>
                          <span className="font-medium">{t('proposalDetailsDialog.reason')}</span> {fullProposalData.tree.reason}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {proposal.type === 'deletion' && fullProposalData?.deletion && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.documentInfo')}</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">{t('proposalDetailsDialog.document')}</span> {fullProposalData.deletion.title}
                      </div>
                      {fullProposalData.deletion.description && (
                        <div>
                          <span className="font-medium">{t('proposalDetailsDialog.description')}</span> {fullProposalData.deletion.description}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="votes" className="space-y-4">
              <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.allVotes')}</h3>
              {fullProposalData?.rule?.votes && fullProposalData.rule.votes.length > 0 ? (
                <div className="space-y-2">
                  {fullProposalData.rule.votes.filter((vote: { isPlaceholder?: boolean }) => !vote.isPlaceholder).map((vote, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {vote.user ? (
                          <>
                            <Icon name="User" className="h-4 w-4" />
                            <span>{vote.user.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('proposalDetailsDialog.anonymous')}</span>
                        )}
                      </div>
                      <Badge variant={
                        vote.voteChoice === 'yes' || vote.voteChoice === 'PRO' ? 'default' :
                        vote.voteChoice === 'no' || vote.voteChoice === 'CONTRA' ? 'destructive' :
                        'secondary'
                      }>
                        {vote.voteChoice === 'yes' || vote.voteChoice === 'PRO' ? 'PRO' :
                         vote.voteChoice === 'no' || vote.voteChoice === 'CONTRA' ? 'CONTRA' :
                         'NEUTRAL'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : fullProposalData?.structure?.votes && fullProposalData.structure.votes.length > 0 ? (
                <div className="space-y-2">
                  {fullProposalData.structure.votes.filter((vote: { isPlaceholder?: boolean }) => !vote.isPlaceholder).map(vote => (
                    <div key={vote.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {vote.user ? (
                          <>
                            <Icon name="User" className="h-4 w-4" />
                            <span>{vote.user.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('proposalDetailsDialog.anonymous')}</span>
                        )}
                      </div>
                      <Badge variant={
                        vote.vote === 'PRO' ? 'default' :
                        vote.vote === 'CONTRA' ? 'destructive' :
                        'secondary'
                      }>
                        {vote.vote}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : fullProposalData?.tree?.votes && fullProposalData.tree.votes.length > 0 ? (
                <div className="space-y-2">
                  {fullProposalData.tree.votes.filter((vote: { isPlaceholder?: boolean }) => !vote.isPlaceholder).map(vote => (
                    <div key={vote.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {vote.voterName ? (
                          <>
                            <Icon name="User" className="h-4 w-4" />
                            <span>{vote.voterName}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('proposalDetailsDialog.anonymous')}</span>
                        )}
                      </div>
                      <Badge variant={
                        vote.vote === 'PRO' ? 'default' :
                        vote.vote === 'CONTRA' ? 'destructive' :
                        'secondary'
                      }>
                        {vote.vote}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : fullProposalData?.deletion?.documentVotes && fullProposalData.deletion.documentVotes.length > 0 ? (
                <div className="space-y-2">
                  {fullProposalData.deletion.documentVotes.map(vote => (
                    <div key={vote.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {vote.user ? (
                          <>
                            <Icon name="User" className="h-4 w-4" />
                            <span>{vote.user.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('proposalDetailsDialog.anonymous')}</span>
                        )}
                      </div>
                      <Badge variant={
                        vote.vote === 'PRO' ? 'default' :
                        vote.vote === 'CONTRA' ? 'destructive' :
                        'secondary'
                      }>
                        {vote.vote}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  {t('proposalDetailsDialog.noVotesYet')}
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <h3 className="font-semibold text-lg">{t('proposalDetailsDialog.additionalDetails')}</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">{t('proposalDetailsDialog.proposalId')}</span> {proposal.id}
                </div>
                {proposal.documentId && (
                  <div>
                    <span className="font-medium">{t('proposalDetailsDialog.documentId')}</span> {proposal.documentId}
                  </div>
                )}
                {proposal.organizationId && (
                  <div>
                    <span className="font-medium">{t('proposalDetailsDialog.organizationId')}</span> {proposal.organizationId}
                  </div>
                )}
                <div>
                  <span className="font-medium">{t('proposalDetailsDialog.status')}</span> {proposal.status}
                </div>
                <div>
                  <span className="font-medium">{t('proposalDetailsDialog.created')}</span> {formatDateTime(proposal.createdAt)}
                </div>
                {proposal.deadline && (
                  <div>
                    <span className="font-medium">{t('proposalDetailsDialog.deadline')}</span> {formatDateTime(proposal.deadline)}
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>

          {/* Vote Actions */}
          {canVote && onVote && (
            <div className="flex justify-center pt-4 border-t">
              <VoteButtonGroup
                variant="compact"
                value={proposal.userVote ?? null}
                onVote={handleVote}
                disabled={isVoting}
                voteLocked={false}
              />
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export const ProposalDetailsDialog = React.memo(ProposalDetailsDialogComponent);
