import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTimezone } from '@/hooks/useTimezone';
import { User, Document, Organization, RepresentativeElection, OrganizationVote, RuleProposal, StructureProposal, DocumentTreeProposal } from '@/types';
import type { PendingDecisionEntry } from '@/types/decisions';
import type { ElectionVoteStatus, OrgVoteBallotChoice } from '@/lib/proposals/fetchProposalBatches';
import { DocumentCardSkeleton } from '../ui/LoadingSkeleton';
import { ActivityFeedProposalCard } from '../ActivityFeedProposalCard';
import { ElectionVoteCard } from '../shared/ElectionVoteCard';
import { RuleProposalCardWrapper } from '../RuleProposalCardWrapper';
import { StructureProposalCardWrapper } from '../StructureProposalCardWrapper';
import { ActionItemCard } from '../shared/ActionItemCard';
import { TreeProposalCard } from '../shared/TreeProposalCard';
import { DocumentVotingCard } from '../shared/DocumentVotingCard';
import { getVotingEligibleCollaborators } from '../../utils/documentHelpers';
import type { DeletionStatusResponse } from '../../lib/api';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { SPACING, COLORS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import type { ActivityFeedProposal } from '@/utils/proposalAdapter';

export interface PrepareProposalCardDataResult {
  adaptedSuggestion: ReturnType<typeof import('@/utils/proposalAdapter').adaptProposalToSuggestion>;
  documentContext: { documentId: string; documentTitle: string; paragraphId: string; paragraphTitle?: string };
  originalText: string;
  allCollaborators: User[];
  organization: Organization | null;
  otherProposals: unknown[];
  agreedVersionInfo: unknown;
  totalUsers: number;
  documentOptions?: unknown;
}

interface PendingDecisionCardProps {
  entry: PendingDecisionEntry;
  currentUser: User;
  organizations: Organization[];
  documents: Document[];
  onVoteParagraph: (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onCommentParagraph: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => void;
  onDeleteProposal: (proposalId: string, documentId: string, paragraphId: string) => void;
  onNavigateToDocument: (documentId: string) => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  prepareProposalCardData: (proposal: ActivityFeedProposal, tabType: 'pending') => PrepareProposalCardDataResult | null;
  onRefreshPending?: () => void;
  onOpenElectionVote?: (election: RepresentativeElection, organization: Organization) => void;
  onOpenOrgVote?: (vote: OrganizationVote, organization: Organization) => void;
  isRepresentative?: (organizationId: string) => boolean;
  isActiveMember?: (organizationId: string) => boolean;
  ruleProposalsById?: Map<string, RuleProposal>;
  structureProposalsById?: Map<string, StructureProposal>;
  treeProposalsById?: Map<string, DocumentTreeProposal>;
  electionVoteStatusById?: Map<string, ElectionVoteStatus>;
  orgVoteBallotById?: Map<string, OrgVoteBallotChoice>;
  hydrationLoading?: boolean;
  /** When provided, pending document_voting entries can show DocumentVotingCard with deletion status */
  documentVotingDeletionStatuses?: Record<string, DeletionStatusResponse | null>;
  /** When provided, election cards show Cancel election (rep or creator); (electionId, organizationId) => call after cancel to refresh */
  onCancelElection?: (electionId: string, organizationId: string) => void | Promise<void>;
  /** Rep completes election (opens results modal) */
  onCompleteElection?: (election: RepresentativeElection, organization: Organization) => void;
  /** Rep closes document amendments period */
  onCloseAmendments?: (documentId: string) => void | Promise<void>;
}

export function PendingDecisionCard({
  entry,
  currentUser,
  organizations,
  documents,
  onVoteParagraph,
  onCommentParagraph,
  onDeleteProposal,
  onNavigateToDocument,
  onNavigateToOrganization,
  prepareProposalCardData,
  onRefreshPending,
  onOpenElectionVote,
  onOpenOrgVote,
  isRepresentative,
  isActiveMember,
  ruleProposalsById,
  structureProposalsById,
  treeProposalsById,
  electionVoteStatusById,
  orgVoteBallotById,
  hydrationLoading = false,
  documentVotingDeletionStatuses,
  onCancelElection,
  onCompleteElection,
  onCloseAmendments,
}: PendingDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { formatRelativeTime } = useTimezone();
  const org = entry.organizationId ? organizations.find(o => o.id === entry.organizationId) ?? null : null;

  switch (entry.kind) {
    case 'paragraph_proposal': {
      const proposal = entry.payload as unknown as ActivityFeedProposal;
      const cardData = prepareProposalCardData(proposal, 'pending');
      if (!cardData) {
        return (
          <div className={SPACING.card.gap}>
            <Card className={SPACING.card.padding}>
              <CardContent className="py-6">
                <p className={cn('text-sm', COLORS.text.secondary, 'mb-4')}>
                  {t('item.proposalNotLoaded')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {onRefreshPending && (
                    <Button variant="outline" size="sm" onClick={() => onRefreshPending()} className="gap-2">
                      <Icon name="RefreshCw" className="h-4 w-4" />
                      {t('retryLoad')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigateToDocument(proposal.documentId)}
                    className="gap-2"
                  >
                    <Icon name="FileText" className="h-4 w-4" />
                    {t('item.goToDocument')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }
      return (
        <div className={SPACING.card.gap}>
          <ActivityFeedProposalCard
            proposal={cardData.adaptedSuggestion}
            documentContext={cardData.documentContext}
            currentUser={currentUser}
            totalUsers={cardData.totalUsers}
            allCollaborators={cardData.allCollaborators}
            originalText={cardData.originalText}
            tabType="pending"
            organization={cardData.organization}
            otherProposals={cardData.otherProposals}
            agreedVersion={cardData.agreedVersionInfo}
            documentOptions={cardData.documentOptions}
            onVote={(proposalId, documentId, paragraphId, voteType) =>
              onVoteParagraph(proposalId, documentId, paragraphId, voteType)
            }
            onComment={(proposalId, documentId, paragraphId, text, parentId) =>
              onCommentParagraph(proposalId, documentId, paragraphId, text, parentId)
            }
            onDeleteProposal={onDeleteProposal}
            onNavigateToDocument={onNavigateToDocument}
          />
        </div>
      );
    }

    case 'election': {
      const p = entry.payload as Record<string, unknown>;
      const election: RepresentativeElection = {
        id: String(p.id),
        organizationId: String(p.organizationId ?? entry.organizationId ?? ''),
        electionTitle: String(p.electionTitle ?? t('item.election')),
        electionDescription: p.electionDescription != null ? String(p.electionDescription) : undefined,
        status: (p.status as RepresentativeElection['status']) ?? 'active',
        positionsAvailable: Number(p.positionsAvailable ?? 1),
        votingEndsAt: p.votingEndsAt != null ? String(p.votingEndsAt) : undefined,
        totalVoters: Number(p.totalVoters ?? 0),
        votesCast: Number(p.votesCast ?? 0),
        quorumMet: Boolean(p.quorumMet),
        candidates: (p.candidates as RepresentativeElection['candidates']) ?? [],
        createdBy: String(p.createdBy ?? ''),
      };
      if (!org) return null;
      const isRep = isRepresentative ? isRepresentative(org.id) : false;
      const isActive = isActiveMember ? isActiveMember(org.id) : true;
      const isVoting =
        election.status === 'voting' || (election.status as string) === 'active';
      return (
        <div className={SPACING.card.gap}>
          <ElectionVoteCard
            type="election"
            data={election}
            currentUser={currentUser}
            organization={org}
            onVote={onOpenElectionVote ? () => onOpenElectionVote(election, org) : undefined}
            onViewDetails={onNavigateToOrganization ? () => onNavigateToOrganization(org.id) : undefined}
            onComplete={
              isRep && isVoting && onCompleteElection
                ? () => onCompleteElection(election, org)
                : undefined
            }
            onCancelElection={onCancelElection}
            isRepresentative={isRep}
            isActiveMember={isActive}
            variant="compact"
          />
        </div>
      );
    }

    case 'organization_vote': {
      const p = entry.payload as Record<string, unknown>;
      const voteId = String(p.id);
      const vote: OrganizationVote = {
        id: voteId,
        organizationId: String(p.organizationId ?? entry.organizationId ?? ''),
        title: String(p.title ?? t('item.vote')),
        description: p.description != null ? String(p.description) : undefined,
        voteType: (p.voteType as OrganizationVote['voteType']) ?? 'other',
        proposedByUserId: '',
        status: (p.status as OrganizationVote['status']) ?? 'approved',
        resultYes: Number(p.resultYes ?? 0),
        resultNo: Number(p.resultNo ?? 0),
        resultAbstain: Number(p.resultAbstain ?? 0),
        votingEndsAt: p.votingEndsAt != null ? String(p.votingEndsAt) : undefined,
        targetDocumentId: p.targetDocumentId != null ? String(p.targetDocumentId) : undefined,
        createdAt: '',
        userVoteChoice: orgVoteBallotById?.get(voteId),
      };
      if (!org) return null;
      const isRep = isRepresentative ? isRepresentative(org.id) : false;
      return (
        <div className={SPACING.card.gap}>
          <ElectionVoteCard
            type="organization-vote"
            data={vote}
            currentUser={currentUser}
            organization={org}
            userVote={vote.userVoteChoice ?? null}
            onVote={onOpenOrgVote ? () => onOpenOrgVote(vote, org) : undefined}
            onViewDetails={onNavigateToOrganization ? () => onNavigateToOrganization(org.id) : undefined}
            variant="compact"
          />
        </div>
      );
    }

    case 'rule_proposal': {
      const p = entry.payload as Record<string, unknown>;
      const proposalId = String(p.id ?? '');
      if (!org) return null;
      if (hydrationLoading && !ruleProposalsById?.has(proposalId)) {
        return (
          <div className={SPACING.card.gap}>
            <DocumentCardSkeleton count={1} />
          </div>
        );
      }
      const ruleProposal = ruleProposalsById?.get(proposalId);
      if (!ruleProposal) return null;
      const allCollaborators: User[] = org.members?.filter(m => m.status === 'active').map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
      })) ?? [];
      return (
        <div className={SPACING.card.gap}>
          <RuleProposalCardWrapper
            ruleProposal={ruleProposal}
            organizationId={org.id}
            currentUser={currentUser}
            allCollaborators={allCollaborators}
            onVote={onRefreshPending ?? (() => {})}
            onNavigateToDetails={onNavigateToOrganization ? () => onNavigateToOrganization(org.id) : undefined}
            organization={org}
          />
        </div>
      );
    }

    case 'structure_proposal': {
      const p = entry.payload as Record<string, unknown>;
      const proposalId = String(p.id ?? '');
      const doc = entry.documentId ? documents.find(d => d.id === entry.documentId) : null;
      const orgStructure = org ?? (doc?.organizationId ? organizations.find(o => o.id === doc.organizationId) ?? null : null);
      if (hydrationLoading && !structureProposalsById?.has(proposalId)) {
        return (
          <div className={SPACING.card.gap}>
            <DocumentCardSkeleton count={1} />
          </div>
        );
      }
      const structureProposal = structureProposalsById?.get(proposalId);
      if (!structureProposal) return null;
      const allCollaborators: User[] = doc ? (doc.collaborators ?? []).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email ?? '',
      })) : [];
      return (
        <div className={SPACING.card.gap}>
          <StructureProposalCardWrapper
            structureProposal={structureProposal}
            documentId={structureProposal.documentId}
            currentUser={currentUser}
            allCollaborators={allCollaborators}
            onVote={onRefreshPending ?? (() => {})}
            organization={orgStructure}
          />
        </div>
      );
    }

    case 'tree_proposal': {
      const p = entry.payload as Record<string, unknown>;
      const proposalId = p.id != null ? String(p.id) : undefined;
      const documentId = String(p.documentId ?? entry.documentId ?? '');
      const documentTitle = entry.documentTitle || String(p.documentTitle ?? t('item.document'));
      const operationType = String(p.operationType ?? t('item.change'));
      const reason = p.reason != null ? String(p.reason) : undefined;
      if (hydrationLoading && proposalId && !treeProposalsById?.has(proposalId)) {
        return (
          <div className={SPACING.card.gap}>
            <DocumentCardSkeleton count={1} />
          </div>
        );
      }
      const proposal = proposalId ? treeProposalsById?.get(proposalId) : undefined;
      const doc = documents.find(d => d.id === documentId);
      if (proposal && doc) {
        const allCollaborators = getVotingEligibleCollaborators(doc);
        const mode = org && isRepresentative?.(org.id) ? 'rep' : 'member';
        return (
          <div className={SPACING.card.gap}>
            <TreeProposalCard
              proposal={proposal}
              document={doc}
              currentUser={currentUser}
              allCollaborators={allCollaborators}
              mode={mode}
              onVote={onRefreshPending}
              onComplete={onRefreshPending}
              onRefreshDocuments={onRefreshPending}
              onNavigateToDocument={onNavigateToDocument}
              organization={org ?? undefined}
            />
          </div>
        );
      }
      return (
        <div className={SPACING.card.gap}>
          <ActionItemCard
            title={t('item.treeProposalTitle', {
              operationType,
              suffix: reason ? t('item.treeProposalReasonSuffix', { reason }) : '',
            })}
            description={t('item.documentColon', { title: documentTitle })}
            variant="active"
            className={cn(COLORS.bg.surface, COLORS.border.standard, 'hover:shadow-md transition-shadow')}
            actions={
              <Button size="sm" onClick={() => onNavigateToDocument(documentId)}>
                <Icon name="FileText" className="h-4 w-4 mr-1" />
                {t('item.viewAndVote')}
              </Button>
            }
          />
        </div>
      );
    }

    case 'document_voting': {
      const p = entry.payload as Record<string, unknown>;
      const documentId = String(p.documentId ?? entry.documentId ?? '');
      const doc = documents.find((d) => d.id === documentId);
      if (doc) {
        const allCollaborators = getVotingEligibleCollaborators(doc);
        const hasDeletionVoting =
          !!doc.deletionProposedAt &&
          !!doc.deletionVoteDeadline &&
          new Date(doc.deletionVoteDeadline) > new Date();
        const deletionStatus = documentVotingDeletionStatuses?.[doc.id];
        const isLoadingDeletion = hasDeletionVoting && deletionStatus === undefined && documentVotingDeletionStatuses !== undefined;
        return (
          <div className={SPACING.card.gap}>
            <DocumentVotingCard
              document={doc}
              deletionStatus={deletionStatus ?? undefined}
              isLoadingDeletion={isLoadingDeletion}
              totalEligibleVoters={allCollaborators.length}
              allCollaborators={allCollaborators}
              showCompleteButton={org ? (isRepresentative?.(org.id) ?? false) : false}
              onCompleteContentVote={onRefreshPending}
              onCompleteDeletionVote={onRefreshPending}
              onRefreshDocuments={onRefreshPending}
              onNavigateToDocument={onNavigateToDocument}
              organization={org ?? undefined}
            />
          </div>
        );
      }
      const documentTitle = entry.documentTitle || String(p.documentTitle ?? t('item.document'));
      const contentVoting = Boolean(p.contentVoting);
      const deletionVoting = Boolean(p.deletionVoting);
      const votingDeadline = p.votingDeadline != null ? String(p.votingDeadline) : undefined;
      const deletionVoteDeadline = p.deletionVoteDeadline != null ? String(p.deletionVoteDeadline) : undefined;
      const labels: string[] = [];
      if (contentVoting) labels.push(t('item.contentVote'));
      if (deletionVoting) labels.push(t('item.deletionVote'));
      const description = labels.length > 0
        ? t('item.openForVotingWith', { labels: labels.join(t('item.voteAnd')) })
        : t('item.openForVoting');
      return (
        <div className={SPACING.card.gap}>
          <Card className={cn('w-full overflow-hidden', 'hover:shadow-md transition-shadow')}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="Vote" className={cn('h-5 w-5 flex-shrink-0', COLORS.status.success)} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate">{documentTitle}</CardTitle>
                  <CardDescription className="truncate">{description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {votingDeadline && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="Clock" className="h-4 w-4" />
                  <span>{t('item.ends', { time: formatRelativeTime(votingDeadline) })}</span>
                </div>
              )}
              {deletionVoteDeadline && deletionVoteDeadline !== votingDeadline && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="Clock" className="h-4 w-4" />
                  <span>{t('item.deletionVoteEnds', { time: formatRelativeTime(deletionVoteDeadline) })}</span>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 pt-0">
              <Button size="sm" onClick={() => onNavigateToDocument(documentId)} className="w-full sm:w-auto">
                <Icon name="Vote" className="h-4 w-4 mr-1" />
                {t('item.viewAndVote')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    case 'document_amendments_open': {
      const p = entry.payload as Record<string, unknown>;
      const documentId = String(p.documentId ?? entry.documentId ?? '');
      const documentTitle = entry.documentTitle || String(p.documentTitle ?? t('item.document'));
      const isRep = org && isRepresentative ? isRepresentative(org.id) : false;
      return (
        <div className={SPACING.card.gap}>
          <ActionItemCard
            title={documentTitle}
            description={t('item.amendmentsOpenDescription')}
            variant="neutral"
            className={cn(COLORS.bg.surface, COLORS.border.standard, 'hover:shadow-md transition-shadow')}
            actions={
              <div className="flex flex-wrap gap-2">
                {isRep && onCloseAmendments && (
                  <Button size="sm" variant="outline" onClick={() => onCloseAmendments(documentId)}>
                    <Icon name="X" className="h-4 w-4 mr-1" />
                    {t('item.closeAmendments')}
                  </Button>
                )}
                <Button size="sm" onClick={() => onNavigateToDocument(documentId)}>
                  <Icon name="Edit" className="h-4 w-4 mr-1" />
                  {t('item.viewDocument')}
                </Button>
              </div>
            }
          />
        </div>
      );
    }

    default:
      return null;
  }
}
