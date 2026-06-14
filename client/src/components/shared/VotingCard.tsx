import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { VoteButtonGroup } from './VoteButtonGroup';
import { VoteProgressBar } from '../ui/VoteProgressBar';
import { Icon } from '../ui/Icon';
import { useTimezone } from '../../hooks/useTimezone';
import { ProposalDetailsDialog } from './ProposalDetailsDialog';
import { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';
import { logger } from '../../lib/logger';
import { COLORS } from '../../lib/designSystem';
import { StatusBadge } from './StatusBadge';
import { BaseProposal, ProposalType } from './proposalTypes';
import { useDesignSystemLabels } from '../../hooks/useDesignSystemLabels';
import { getVoteStatusLabel, normalizeVoteStatus, isVoteActive } from '../../lib/voting';

// Re-export types for backward compatibility
export type { ProposalType, BaseProposal } from './proposalTypes';

interface VotingCardProps {
  proposal: BaseProposal;
  currentUserId?: string;
  onVote?: (proposalId: string, proposalType: ProposalType, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onViewDetails?: (proposal: BaseProposal) => void;
  loading?: boolean;
  isNew?: boolean;
  hasNewVotes?: boolean;
  fullProposalData?: {
    rule?: RuleProposal;
    structure?: StructureProposal;
    tree?: DocumentTreeProposal;
    deletion?: Document;
  };
  onFetchFullData?: (proposalId: string, proposalType: ProposalType) => Promise<{
    rule?: RuleProposal;
    structure?: StructureProposal;
    tree?: DocumentTreeProposal;
    deletion?: Document;
  } | null>;
}

const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  rule: 'Rule Proposal',
  structure: 'Structure Proposal',
  tree: 'Tree Proposal',
  deletion: 'Deletion Proposal',
  paragraph: 'Paragraph Proposal',
};

function VotingCardComponent({
  proposal,
  currentUserId,
  onVote,
  onViewDetails,
  loading = false,
  isNew = false,
  hasNewVotes = false,
  fullProposalData,
  onFetchFullData,
}: VotingCardProps) {
  const { cardActions } = useDesignSystemLabels();
  const { formatRelativeTime } = useTimezone();
  const [isVoting, setIsVoting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullData, setFullData] = useState(fullProposalData ?? undefined);

  // Use proposal data directly
  const displayVote = proposal.userVote;
  const voteCounts = proposal.votes ?? {
    pro: 0,
    contra: 0,
    neutral: 0,
    total: 0,
  };

  const handleVote = async (vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (!onVote || isVoting) return;

    setIsVoting(true);
    try {
      await onVote(proposal.id, proposal.type, vote);
      // WebSocket will update with real vote
      // Note: Parent components (like UnifiedProposalList) handle optimistic updates
    } catch (error) {
      logger.error('Failed to cast vote:', error);
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
        return <Icon name="CheckCircle2" className={`h-4 w-4 ${COLORS.status.success}`} />;
      case 'rejected':
      case 'cancelled':
        return <Icon name="XCircle" className={`h-4 w-4 ${COLORS.status.error}`} />;
      case 'expired':
        return <Icon name="AlertCircle" className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Icon name="Clock" className={`h-4 w-4 ${COLORS.status.warning}`} />;
    }
  };

  const getStatusLabel = () => {
    return getVoteStatusLabel(proposal.status);
  };

  const getTimeRemaining = () => {
    if (!proposal.deadline) return null;
    try {
      const deadline = new Date(proposal.deadline);
      const now = new Date();
      if (deadline < now) return 'Expired';
      return formatRelativeTime(deadline);
    } catch {
      return null;
    }
  };

  const canVote = isVoteActive(proposal.status);

  const handleViewDetails = async () => {
    if (onViewDetails) {
      onViewDetails(proposal);
    } else {
      // Fetch full data if not provided
      if (!fullData && onFetchFullData) {
        const data = await onFetchFullData(proposal.id, proposal.type);
        if (data) {
          setFullData(data);
        }
      }
      setDetailsOpen(true);
    }
  };

  const totalEligibleVoters = Math.max(voteCounts.total, 1);

  return (
    <>
      <Card className="w-full hover:shadow-md transition-shadow relative overflow-hidden">
        {/* 4-segment status bar at top */}
        {(canVote || voteCounts.total > 0) && (
          <VoteProgressBar
            aggregatedCounts={{
              pro: voteCounts.pro,
              neutral: voteCounts.neutral,
              contra: voteCounts.contra,
            }}
            totalEligibleVoters={totalEligibleVoters}
            allCollaborators={[]}
            isAnonymous={false}
            hideExpandedCounter={proposal.type === 'structure'}
          />
        )}

        {/* Notification Badges */}
        {(isNew || hasNewVotes) && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            {isNew && (
              <Badge variant="default" className="bg-blue-500 text-white text-xs">
                New
              </Badge>
            )}
            {hasNewVotes && (
              <Badge variant="default" className="bg-orange-500 text-white text-xs">
                <Icon name="Bell" className="h-3 w-3 mr-1" />
                New Votes
              </Badge>
            )}
          </div>
        )}

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {PROPOSAL_TYPE_LABELS[proposal.type]}
                </Badge>
                <StatusBadge
                  status={proposal.status}
                  icon={getStatusIcon()}
                  label={getStatusLabel()}
                />
              </div>
            <CardTitle className="text-lg mt-2">
              {proposal.title || `${PROPOSAL_TYPE_LABELS[proposal.type]} #${proposal.id.slice(0, 8)}`}
            </CardTitle>
            {proposal.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {proposal.description}
              </CardDescription>
            )}
          </div>
          {getStatusIcon()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Deadline */}
        {proposal.deadline && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Clock" className="h-4 w-4" />
            <span>{getTimeRemaining()}</span>
          </div>
        )}

        {/* Created by */}
        {proposal.createdBy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="User" className="h-4 w-4" />
            <span>By {proposal.createdBy.name}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 pt-0">
        {/* Vote buttons */}
        {canVote && onVote && (
          <VoteButtonGroup
            value={displayVote}
            onVote={handleVote}
            disabled={isVoting || loading}
            variant="compact"
            className="w-full"
          />
        )}

        {/* View details button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={handleViewDetails}
        >
          {cardActions.viewDetails}
        </Button>
      </CardFooter>
    </Card>

    {/* Proposal Details Dialog */}
    <ProposalDetailsDialog
      proposal={proposal}
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      currentUserId={currentUserId}
      onVote={onVote ? (id, type, vote) => onVote(id, type, vote) : undefined}
      fullProposalData={fullData}
    />
    </>
  );
}

// Memoize component to prevent unnecessary re-renders
export const VotingCard = React.memo(VotingCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Only re-render if critical props have changed
  // Return true if props are equal (skip re-render), false if different (re-render)
  try {
    return (
      prevProps.proposal.id === nextProps.proposal.id &&
      prevProps.proposal.status === nextProps.proposal.status &&
      prevProps.proposal.votes?.total === nextProps.proposal.votes?.total &&
      prevProps.proposal.userVote === nextProps.proposal.userVote &&
      prevProps.currentUserId === nextProps.currentUserId &&
      prevProps.isNew === nextProps.isNew &&
      prevProps.hasNewVotes === nextProps.hasNewVotes &&
      prevProps.loading === nextProps.loading
    );
  } catch (error) {
    // If comparison fails, allow re-render (safer fallback)
    return false;
  }
});
