import React from 'react';
import { Button } from '../ui/button';
import { UnifiedProposalList } from '../shared/UnifiedProposalList';
import { ErrorState } from '../shared/ErrorState';
import type { BaseProposal, ProposalType } from '../shared/proposalTypes';
import type { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';

export interface FullProposalData {
  rule?: RuleProposal;
  structure?: StructureProposal;
  tree?: DocumentTreeProposal;
  deletion?: Document;
}

export interface ProposalsOverviewProps {
  proposals: BaseProposal[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onVote: (
    proposalId: string,
    proposalType: ProposalType,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA',
    additionalData?: { documentId?: string; paragraphId?: string }
  ) => Promise<void>;
  onRefresh: () => void;
  organizationId: string;
  currentUserId: string;
  fetchFullProposalData: (
    proposalId: string,
    proposalType: ProposalType
  ) => Promise<FullProposalData | null>;
  fullProposalData: Record<string, FullProposalData>;
  showProposals: boolean;
  onToggleShowProposals: (show: boolean) => void;
}

function ProposalsOverviewComponent({
  proposals,
  loading,
  error,
  onRetry,
  onVote,
  onRefresh,
  organizationId,
  currentUserId,
  fetchFullProposalData,
  fullProposalData,
  showProposals,
  onToggleShowProposals,
}: ProposalsOverviewProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Active Proposals</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleShowProposals(!showProposals)}
        >
          {showProposals ? 'Hide' : 'Show'} Proposals
        </Button>
      </div>
      {showProposals &&
        (error && !loading ? (
          <ErrorState
            variant="inline"
            message={error}
            onRetry={onRetry}
          />
        ) : (
          <UnifiedProposalList
            proposals={proposals}
            currentUserId={currentUserId}
            onVote={onVote}
            onRefresh={onRefresh}
            organizationId={organizationId}
            isLoading={loading}
            fetchFullProposalData={fetchFullProposalData}
            fullProposalData={fullProposalData}
          />
        ))}
    </div>
  );
}

export const ProposalsOverview = React.memo(ProposalsOverviewComponent);
