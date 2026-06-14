import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import {
  Organization,
  User,
  OrganizationGovernanceRules,
  RepresentativeElection,
  Document,
  RuleProposal,
  StructureProposal,
  DocumentTreeProposal,
  OrganizationVote,
} from '../../types';
import { OrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { governanceApi, organizationsApi, documentsApi } from '../../lib/api';
import { toast } from 'sonner';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { computeOrgVoteQuorumMet } from '../../utils/voteQuorum';
import { logger } from '../../lib/logger';
import { extractVoteReceipt, persistReceipt } from '../../lib/verification/voteReceipt';
import { StructureProposalCardWrapper } from '../StructureProposalCardWrapper';
import { RuleProposalCardWrapper } from '../RuleProposalCardWrapper';
import { ElectionVoteCard } from '../shared/ElectionVoteCard';
import { ActionItemCard } from '../shared/ActionItemCard';
import { CompleteVoteButton } from '../shared/CompleteVoteButton';
import { TreeProposalCard } from '../shared/TreeProposalCard';
import { DocumentVotingCard } from '../shared/DocumentVotingCard';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { getVotingEligibleCollaborators } from '../../utils/documentHelpers';
import { RepresentativeRejectDialog } from '../shared/RepresentativeRejectDialog';
import { ElectionResults } from '../governance/ElectionResults';
import { ElectionVotingInterface } from '../governance/ElectionVotingInterface';
import { DocumentCardSkeleton } from '../ui/LoadingSkeleton';
import { SPACING } from '../../lib/designSystem';

interface RepresentativeLoading {
  ruleProposals: boolean;
  organizationVotes: boolean;
  structureProposals: boolean;
  treeProposals: boolean;
  deletionStatuses: boolean;
}

export interface OrganizationDecisionsPanelProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];
  documents?: Document[];
  ruleProposals: RuleProposal[];
  organizationVotes: OrganizationVote[];
  structureProposals: StructureProposal[];
  treeProposals: DocumentTreeProposal[];
  deletionStatuses: Record<string, import('../../lib/api').DeletionStatusResponse>;
  representativeLoading: RepresentativeLoading;
  onRefreshRuleProposals: () => Promise<void>;
  onRefreshOrganizationVotes: () => Promise<void>;
  onRefreshStructureProposals: () => Promise<void>;
  onRefreshTreeProposals: () => Promise<void>;
  onCompleteOrganizationVote: (voteId: string) => Promise<void>;
  onRefreshGovernance: () => Promise<void>;
  onRefreshElections: () => Promise<void>;
  onRefreshDocuments?: () => Promise<void>;
  onNavigateToDocument?: (documentId: string) => void;
  /** Show rep-only management actions (start/complete votes, approve org votes, etc.) */
  showRepActions?: boolean;
  /** Prefix for section element ids (scroll targets from dashboard toolbar) */
  sectionIdPrefix?: string;
  /** Include rep-only document amendment close actions */
  includeDocumentAmendmentActions?: boolean;
}

function sectionId(prefix: string | undefined, name: string): string | undefined {
  return prefix ? `${prefix}-${name}` : undefined;
}

export function OrganizationDecisionsPanel({
  organization,
  currentUser,
  permissions,
  governanceRules,
  elections,
  documents,
  ruleProposals,
  organizationVotes,
  structureProposals,
  treeProposals,
  deletionStatuses,
  representativeLoading,
  onRefreshRuleProposals,
  onRefreshOrganizationVotes,
  onRefreshStructureProposals,
  onRefreshTreeProposals,
  onCompleteOrganizationVote,
  onRefreshGovernance,
  onRefreshElections,
  onRefreshDocuments,
  onNavigateToDocument,
  showRepActions = false,
  sectionIdPrefix,
  includeDocumentAmendmentActions = showRepActions,
}: OrganizationDecisionsPanelProps) {
  const { t } = useTranslation('organization');
  const { t: tGov } = useTranslation('governance');
  const { getRuleLabel } = useRuleLabels();
  const { t: tDoc } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');

  const [completingVoteId, setCompletingVoteId] = useState<string | null>(null);
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null);
  const [approvingVoteId, setApprovingVoteId] = useState<string | null>(null);
  const [rejectVoteDialog, setRejectVoteDialog] = useState<{ vote: OrganizationVote } | null>(null);
  const [closingAmendmentsId, setClosingAmendmentsId] = useState<string | null>(null);
  const [selectedElectionForResults, setSelectedElectionForResults] = useState<RepresentativeElection | null>(null);
  const [electionResultsOpen, setElectionResultsOpen] = useState(false);
  const [electionVotingTarget, setElectionVotingTarget] = useState<RepresentativeElection | null>(null);
  const [electionVotingOpen, setElectionVotingOpen] = useState(false);

  const isActiveMember = organization.members?.some(
    (m) => m.userId === currentUser.id && m.status === 'active'
  );

  const orgDocuments = useMemo(
    () => (documents ?? []).filter((d) => d.organizationId === organization.id),
    [documents, organization.id]
  );

  const votingDocuments = useMemo(() => {
    return orgDocuments.filter((d) => {
      if (d.status === 'voting') return true;
      if (d.deletionProposedAt && d.deletionVoteDeadline) {
        const deadline = new Date(d.deletionVoteDeadline);
        if (new Date() < deadline) return true;
      }
      return false;
    });
  }, [orgDocuments]);

  const documentsOpenForAmendments = useMemo(() => {
    return orgDocuments.filter(
      (d) =>
        d.status === 'agreed' &&
        (d.amendmentsOpen === true || (d as { amendments_open?: number }).amendments_open === 1) &&
        d.ownershipType === 'organizational'
    );
  }, [orgDocuments]);

  const activeMembers = organization.members ?? [];
  const totalEligibleVoters = activeMembers.filter((m) => m.status === 'active').length;
  const allCollaborators: User[] = activeMembers
    .filter((m) => m.status === 'active' && m.user)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.name,
      email: m.user!.email,
    }));

  const ruleCollaborators: User[] = activeMembers
    .filter((m) => m.status === 'active' && m.user)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.name,
      email: m.user!.email,
    }));

  const getAllCollaborators = (documentId: string): User[] => {
    const doc = orgDocuments.find((d) => d.id === documentId);
    if (!doc) return [];
    return getVotingEligibleCollaborators(doc);
  };

  const visibleElections = useMemo(() => {
    return elections.filter((e) => {
      if (e.status === 'draft') return showRepActions;
      return (
        e.status === 'nomination' ||
        e.status === 'announced' ||
        e.status === 'voting' ||
        e.status === 'active'
      );
    });
  }, [elections, showRepActions]);

  const draftProposals = ruleProposals.filter((p) => p.status === 'draft');
  const activeProposals = ruleProposals.filter((p) => p.status === 'active');
  const activeOrganizationVotes = organizationVotes.filter((v) => v.status === 'approved');
  const proposedOrganizationVotes = organizationVotes.filter((v) => v.status === 'proposed');

  const activeElectionsForRep = elections.filter((e) => {
    return e.status === 'draft' || e.status === 'nomination' || e.status === 'voting';
  });

  const needsRepActionCount =
    (showRepActions
      ? draftProposals.length +
        activeProposals.length +
        activeElectionsForRep.filter((e) => e.status === 'draft' || e.status === 'nomination').length +
        proposedOrganizationVotes.length
      : 0);

  const handleCastOrganizationVoteInline = async (voteId: string, voteValue: 'yes' | 'no' | 'abstain') => {
    try {
      setSubmittingVoteId(voteId);
      const vote = organizationVotes.find((v) => v.id === voteId);
      const response = await organizationsApi.castVote(organization.id, voteId, voteValue);
      const payload = extractVoteReceipt(response);
      if (payload && currentUser?.id) {
        await persistReceipt(currentUser.id, organization.id, {
          ...payload,
          contestTitle: vote?.title,
          organizationId: organization.id,
        });
      }
      toast.success(t('voteRecorded'));
      onRefreshOrganizationVotes();
    } catch (error: unknown) {
      logger.error('Failed to cast vote:', error);
      toast.error(error instanceof Error ? error.message : t('failedToCastVote'));
    } finally {
      setSubmittingVoteId(null);
    }
  };

  const handleApproveOrganizationVote = async (voteId: string) => {
    setApprovingVoteId(voteId);
    try {
      await organizationsApi.approveVote(organization.id, voteId);
      toast.success(t('voteApprovedAndOpened'));
      onRefreshOrganizationVotes();
    } catch (error: unknown) {
      logger.error('Failed to approve vote:', error);
      toast.error(error instanceof Error ? error.message : t('failedToApproveVote'));
    } finally {
      setApprovingVoteId(null);
    }
  };

  const handleDeclineOrganizationVote = async (voteId: string, reason: string) => {
    try {
      await organizationsApi.declineVote(organization.id, voteId, reason);
      toast.success(t('voteDeclinedProposerNotified'));
      setRejectVoteDialog(null);
      onRefreshOrganizationVotes();
    } catch (error: unknown) {
      logger.error('Failed to decline vote:', error);
      toast.error(error instanceof Error ? error.message : t('failedToDeclineVote'));
    }
  };

  const handleStartVoting = async (proposalId: string) => {
    try {
      const proposal = ruleProposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.status !== 'draft') {
        toast.error(t('proposalNotFoundOrProcessed'));
        onRefreshRuleProposals();
        return;
      }

      await governanceApi.ruleProposalsApi.startRuleProposalVoting(organization.id, proposalId);
      toast.success(tGov('votingStartedSuccessfully'));
      onRefreshRuleProposals();
      onRefreshGovernance();
    } catch (error: unknown) {
      logger.error('Failed to start voting:', error);
      let errorMessage = t('failedToStartVoting');
      let suggestion: string | undefined;
      if (error && typeof error === 'object' && 'details' in error) {
        const details = (error as { details?: { reason?: string; suggestion?: string; message?: string } }).details;
        if (details && typeof details === 'object') {
          errorMessage = details.reason ?? details.message ?? (error instanceof Error ? error.message : errorMessage);
          suggestion = details.suggestion;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      if (suggestion) {
        toast.error(errorMessage, { description: suggestion, duration: 5000 });
      } else {
        toast.error(errorMessage);
      }
      onRefreshRuleProposals();
    }
  };

  const handleCompleteVoting = async (proposalId: string) => {
    try {
      await governanceApi.ruleProposalsApi.completeRuleProposal(organization.id, proposalId);
      toast.success(t('voteCompleted'));
      onRefreshRuleProposals();
      onRefreshGovernance();
    } catch (error: unknown) {
      logger.error('Failed to complete voting:', error);
      toast.error(error instanceof Error ? error.message : t('failedToCompleteVote'));
      onRefreshRuleProposals();
    }
  };

  const handleUpdateElectionPhase = async (electionId: string, newPhase: 'nomination' | 'voting') => {
    try {
      await governanceApi.updateElectionPhase(organization.id, electionId, newPhase);
      const phaseLabel =
        newPhase === 'nomination' ? tGov('tab.phaseNomination') : tGov('tab.phaseVoting');
      toast.success(tGov('tab.electionPhaseMoved', { phase: phaseLabel }));
      onRefreshElections();
    } catch (error: unknown) {
      logger.error('Failed to update election phase:', error);
      toast.error(error instanceof Error ? error.message : tGov('tab.failedToUpdateElectionPhase'));
    }
  };

  const openElectionVoting = (election: RepresentativeElection) => {
    setElectionVotingTarget(election);
    setElectionVotingOpen(true);
  };

  const proposalsCount = structureProposals.length + treeProposals.length;
  const electionsAndVotesCount =
    activeOrganizationVotes.length +
    visibleElections.length +
    (showRepActions ? proposedOrganizationVotes.length : 0);

  const hasAnyDecisions =
    activeProposals.length > 0 ||
    proposalsCount > 0 ||
    votingDocuments.length > 0 ||
    electionsAndVotesCount > 0 ||
    needsRepActionCount > 0 ||
    (includeDocumentAmendmentActions && documentsOpenForAmendments.length > 0);

  return (
    <div className={SPACING.section.gap}>
      {showRepActions && needsRepActionCount > 0 && (
        <div id={sectionId(sectionIdPrefix, 'rep-actions')}>
          <CollapsibleSection
            title={t('needsYourAction')}
            iconName="AlertCircle"
            count={needsRepActionCount}
            defaultOpen
          >
            <div className="space-y-2">
              {draftProposals.map((proposal) => (
                <ActionItemCard
                  key={proposal.id}
                  title={proposal.title}
                  description={getRuleLabel(
                    proposal.ruleField || (proposal as { current_rule_field?: string }).current_rule_field || ''
                  )}
                  badge={
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      {t('draft')}
                    </Badge>
                  }
                  variant="urgent"
                  actions={
                    permissions.canStartDocumentVoting ? (
                      <Button size="sm" onClick={() => handleStartVoting(proposal.id)}>
                        <Icon name="Play" className="h-4 w-4 mr-1" />
                        {t('startVoting')}
                      </Button>
                    ) : null
                  }
                />
              ))}
              {activeProposals.map((proposal) => {
                const totalVotes =
                  (proposal.votesYes ?? (proposal as { votes_yes?: number }).votes_yes ?? 0) +
                  (proposal.votesNo ?? (proposal as { votes_no?: number }).votes_no ?? 0) +
                  (proposal.votesAbstain ?? (proposal as { votes_abstain?: number }).votes_abstain ?? 0);
                const approvalRate =
                  totalVotes > 0
                    ? Math.round(
                        ((proposal.votesYes ?? (proposal as { votes_yes?: number }).votes_yes ?? 0) / totalVotes) *
                          100
                      )
                    : 0;
                const threshold =
                  proposal.thresholdPercentage ??
                  (proposal as { threshold_percentage?: number }).threshold_percentage ??
                  75;
                const quorumMet = proposal.quorumMet ?? false;
                return (
                  <ActionItemCard
                    key={proposal.id}
                    title={proposal.title}
                    description={t('ruleProposalVoteStats', {
                      rule: getRuleLabel(
                        proposal.ruleField ||
                          (proposal as { current_rule_field?: string }).current_rule_field ||
                          ''
                      ),
                      votes: totalVotes,
                      approval: approvalRate,
                      threshold,
                    })}
                    badge={<Badge className="bg-blue-100 text-blue-800">{t('active')}</Badge>}
                    variant="active"
                    actions={
                      <CompleteVoteButton
                        quorumMet={quorumMet}
                        onComplete={() => handleCompleteVoting(proposal.id)}
                        label={t('completeVote')}
                        confirmDescription={t('completeVoteConfirmDescription')}
                      />
                    }
                  />
                );
              })}
              {activeElectionsForRep
                .filter((e) => e.status === 'draft' || e.status === 'nomination')
                .map((election) => (
                  <ActionItemCard
                    key={election.id}
                    title={election.electionTitle}
                    description={tGov('tab.positionsAvailable', { count: election.positionsAvailable })}
                    badge={
                      <Badge variant="secondary">
                        {election.status === 'draft' ? t('draft') : t('nominationStatus')}
                      </Badge>
                    }
                    variant="neutral"
                    actions={
                      election.status === 'draft' ? (
                        <Button size="sm" onClick={() => handleUpdateElectionPhase(election.id, 'nomination')}>
                          <Icon name="Play" className="h-4 w-4 mr-1" />
                          {t('startNomination')}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleUpdateElectionPhase(election.id, 'voting')}>
                          <Icon name="Play" className="h-4 w-4 mr-1" />
                          {t('startVoting')}
                        </Button>
                      )
                    }
                  />
                ))}
              {proposedOrganizationVotes.map((vote) => (
                <ElectionVoteCard
                  key={vote.id}
                  type="organization-vote"
                  data={vote}
                  currentUser={currentUser}
                  organization={organization}
                  isRepresentative
                  onApproveVote={handleApproveOrganizationVote}
                  onDeclineVote={(v) => setRejectVoteDialog({ vote: v })}
                  approvingVoteId={approvingVoteId}
                />
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}

      <div id={sectionId(sectionIdPrefix, 'rule-votes')}>
        <CollapsibleSection
          title={t('openVotesOnDocumentRules')}
          iconName="Settings"
          count={activeProposals.length}
          defaultOpen={activeProposals.length > 0}
        >
          {representativeLoading.ruleProposals ? (
            <DocumentCardSkeleton count={1} />
          ) : activeProposals.length > 0 ? (
            <div className={SPACING.container.vertical}>
              {activeProposals.map((proposal) => (
                <RuleProposalCardWrapper
                  key={proposal.id}
                  ruleProposal={proposal}
                  organizationId={organization.id}
                  currentUser={currentUser}
                  allCollaborators={ruleCollaborators}
                  onVote={onRefreshRuleProposals}
                  organization={organization}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">{t('noActiveRuleProposalsDescription')}</p>
          )}
        </CollapsibleSection>
      </div>

      <div id={sectionId(sectionIdPrefix, 'proposals')}>
        <CollapsibleSection
          title={t('structureAndTreeProposals')}
          iconName="FileText"
          count={proposalsCount}
          defaultOpen={proposalsCount > 0}
        >
          {representativeLoading.structureProposals || representativeLoading.treeProposals ? (
            <DocumentCardSkeleton count={1} />
          ) : proposalsCount > 0 ? (
            <div className={SPACING.container.vertical}>
              {structureProposals.map((proposal) => {
                const document = orgDocuments.find((d) => d.id === proposal.documentId);
                return (
                  <StructureProposalCardWrapper
                    key={proposal.id}
                    structureProposal={proposal}
                    documentId={proposal.documentId}
                    currentUser={currentUser}
                    allCollaborators={getAllCollaborators(proposal.documentId)}
                    onVote={onRefreshStructureProposals}
                    onComplete={onRefreshStructureProposals}
                    canComplete={
                      !!(document && (document.ownerId === currentUser.id || permissions.isRepresentative))
                    }
                    organization={organization}
                  />
                );
              })}
              {treeProposals.map((proposal) => {
                const document = orgDocuments.find((d) => d.id === proposal.documentId);
                return (
                  <TreeProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    document={document}
                    currentUser={currentUser}
                    allCollaborators={getAllCollaborators(proposal.documentId)}
                    mode={showRepActions ? 'rep' : 'member'}
                    onVote={onRefreshTreeProposals}
                    onComplete={onRefreshTreeProposals}
                    onRefreshDocuments={onRefreshDocuments}
                    onNavigateToDocument={onNavigateToDocument}
                    organization={organization}
                    isRepresentative={permissions.isRepresentative}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">{t('noPendingTreeProposals')}</p>
          )}
        </CollapsibleSection>
      </div>

      <div id={sectionId(sectionIdPrefix, 'documents-voting')}>
        <CollapsibleSection
          title={t('documentsInVotingPhase')}
          iconName="Vote"
          count={votingDocuments.length}
          defaultOpen={votingDocuments.length > 0}
        >
          {votingDocuments.length > 0 ? (
            <div className={SPACING.container.vertical}>
              {votingDocuments.map((doc) => (
                <DocumentVotingCard
                  key={doc.id}
                  document={doc}
                  deletionStatus={deletionStatuses[doc.id]}
                  totalEligibleVoters={totalEligibleVoters}
                  allCollaborators={allCollaborators}
                  showCompleteButton={showRepActions}
                  onRefreshDocuments={onRefreshDocuments}
                  onNavigateToDocument={onNavigateToDocument}
                  organization={organization}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">{t('noDocumentsInVotingPhaseDescription')}</p>
          )}
        </CollapsibleSection>
      </div>

      <div id={sectionId(sectionIdPrefix, 'elections-votes')}>
        <CollapsibleSection
          title={t('electionsAndVotes')}
          iconName="Users"
          count={electionsAndVotesCount}
          defaultOpen={electionsAndVotesCount > 0}
        >
          {representativeLoading.organizationVotes ? (
            <div className="text-sm text-muted-foreground py-4">{t('loadingOrganizationVotes')}</div>
          ) : (
            <div className={SPACING.container.vertical}>
              {activeOrganizationVotes.map((vote) => {
                const isMistrustVote = vote.voteType === 'representative_removal';
                const isAmendmentAdoptionVote = vote.voteType === 'document_amendment_adoption';
                const quorumMet = computeOrgVoteQuorumMet(vote, organization, governanceRules);
                return (
                  <ElectionVoteCard
                    key={vote.id}
                    type="organization-vote"
                    data={vote}
                    currentUser={currentUser}
                    organization={organization}
                    quorumMet={quorumMet}
                    onViewDetails={
                      isAmendmentAdoptionVote && vote.targetDocumentId && onNavigateToDocument
                        ? () => onNavigateToDocument(vote.targetDocumentId!)
                        : undefined
                    }
                    onVote={(voteValue) => {
                      if (voteValue) {
                        handleCastOrganizationVoteInline(vote.id, voteValue);
                      }
                    }}
                    onComplete={
                      showRepActions
                        ? async () => {
                            setCompletingVoteId(vote.id);
                            try {
                              await onCompleteOrganizationVote(vote.id);
                            } finally {
                              setCompletingVoteId(null);
                            }
                          }
                        : undefined
                    }
                    isRepresentative={showRepActions}
                    isActiveMember={isActiveMember}
                    completingVoteId={completingVoteId}
                    submittingVoteId={submittingVoteId}
                    userVote={vote.userVoteChoice ?? null}
                    completeConfirmDescription={
                      isMistrustVote
                        ? t('completeVoteConfirmMistrust')
                        : t('completeVoteConfirmStandard')
                    }
                  />
                );
              })}

              {visibleElections.map((election) => {
                const isVoting =
                  election.status === 'voting' || (election.status as string) === 'active';
                return (
                  <ElectionVoteCard
                    key={election.id}
                    type="election"
                    data={election}
                    currentUser={currentUser}
                    organization={organization}
                    onVote={isVoting ? () => openElectionVoting(election) : undefined}
                    onComplete={
                      showRepActions && isVoting
                        ? () => {
                            setSelectedElectionForResults(election);
                            setElectionResultsOpen(true);
                          }
                        : undefined
                    }
                    onCancelElection={
                      showRepActions
                        ? async (electionId) => {
                            await governanceApi.cancelElection(organization.id, electionId);
                            toast.success(t('electionCancelled'));
                            await onRefreshElections();
                          }
                        : undefined
                    }
                    isRepresentative={showRepActions}
                    isActiveMember={isActiveMember}
                  />
                );
              })}

              {activeOrganizationVotes.length === 0 && visibleElections.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">{t('noActiveElectionsOrVotesDescription')}</p>
              )}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {includeDocumentAmendmentActions && documentsOpenForAmendments.length > 0 && (
        <CollapsibleSection
          title={t('documentActions')}
          iconName="FileEdit"
          count={documentsOpenForAmendments.length}
          defaultOpen={false}
        >
          <div className={SPACING.container.vertical}>
            {documentsOpenForAmendments.map((doc) => (
              <ActionItemCard
                key={doc.id}
                title={doc.title}
                description={t('agreedDocumentAmendmentHint')}
                variant="neutral"
                actions={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={closingAmendmentsId === doc.id}
                      onClick={async () => {
                        try {
                          setClosingAmendmentsId(doc.id);
                          await documentsApi.closeAmendments(doc.id);
                          toast.success(tDoc('amendmentsClosedSuccess'));
                          onRefreshDocuments?.();
                        } catch (error: unknown) {
                          logger.error('Failed to close amendments:', error);
                          toast.error(error instanceof Error ? error.message : tDoc('failedToCloseAmendments'));
                        } finally {
                          setClosingAmendmentsId(null);
                        }
                      }}
                    >
                      {closingAmendmentsId === doc.id ? tDoc('closingAmendments') : t('closeAmendments')}
                    </Button>
                    {onNavigateToDocument && (
                      <Button size="sm" variant="outline" onClick={() => onNavigateToDocument(doc.id)}>
                        <Icon name="ArrowRight" className="h-4 w-4 ml-1" />
                        {tCommon('cardActions.view')}
                      </Button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {!hasAnyDecisions && (
        <p className="text-sm text-muted-foreground text-center py-6">
          {showRepActions ? t('noRepresentativeActionsRequired') : t('noActiveVotesOrDiscussions')}
        </p>
      )}

      {rejectVoteDialog && (
        <RepresentativeRejectDialog
          open={!!rejectVoteDialog}
          onOpenChange={(open) => !open && setRejectVoteDialog(null)}
          title={t('declineVote')}
          description={t('declineVoteDescription')}
          itemName={rejectVoteDialog.vote.title}
          onConfirm={(reason) => handleDeclineOrganizationVote(rejectVoteDialog.vote.id, reason)}
        />
      )}

      {selectedElectionForResults && (
        <ElectionResults
          organization={organization}
          election={selectedElectionForResults}
          currentUser={currentUser}
          open={electionResultsOpen}
          onOpenChange={(open) => {
            setElectionResultsOpen(open);
            if (!open) setSelectedElectionForResults(null);
          }}
          onSuccess={async () => {
            await onRefreshElections();
            await onRefreshGovernance();
          }}
        />
      )}

      {electionVotingTarget && (
        <ElectionVotingInterface
          organization={organization}
          election={electionVotingTarget}
          currentUser={currentUser}
          open={electionVotingOpen}
          onOpenChange={(open) => {
            setElectionVotingOpen(open);
            if (!open) setElectionVotingTarget(null);
          }}
          onSuccess={() => {
            onRefreshElections();
          }}
        />
      )}
    </div>
  );
}
