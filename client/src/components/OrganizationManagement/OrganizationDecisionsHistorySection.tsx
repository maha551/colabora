import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { DocumentCardSkeleton } from '../ui/LoadingSkeleton';
import { TimelineHistoryView } from '../ActivityFeed/TimelineHistoryView';
import { PendingDecisionCard, type PrepareProposalCardDataResult } from '../ActivityFeed/PendingDecisionCard';
import type { useOrganizationDecisions } from '../../hooks/useOrganizationDecisions';
import { SPACING } from '../../lib/designSystem';
import type { Document, Organization, User, RepresentativeElection } from '../../types';
import type { ActivityFeedProposal } from '../../utils/proposalAdapter';
import {
  adaptProposalToSuggestion,
  extractDocumentContext,
  getOriginalText,
} from '../../utils/proposalAdapter';
import { getVotingEligibleCollaborators } from '../../utils/documentHelpers';
import { buildHash } from '../../lib/hashRoutes';

type OrgDecisionsState = ReturnType<typeof useOrganizationDecisions>;

export interface OrganizationDecisionsHistorySectionProps {
  organization: Organization;
  currentUser: User;
  documents: Document[];
  organizations: Organization[];
  decisions: OrgDecisionsState;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  onNavigateToActivityFeed?: (organizationId: string) => void;
  onVoteParagraph?: (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    voteType: 'PRO' | 'NEUTRAL' | 'CONTRA'
  ) => void;
  onCommentParagraph?: (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    text: string,
    parentId?: string
  ) => void;
  onDeleteProposal?: (proposalId: string, documentId: string, paragraphId: string) => void;
  onCompleteElection?: (election: RepresentativeElection, organization: Organization) => void;
  onCloseAmendments?: (documentId: string) => void | Promise<void>;
  isRepresentative?: boolean;
  sectionIdPrefix?: string;
}

export function OrganizationDecisionsHistorySection({
  organization,
  currentUser,
  documents,
  organizations,
  decisions,
  onNavigateToDocument,
  onNavigateToOrganization,
  onNavigateToHash,
  onNavigateToActivityFeed,
  onVoteParagraph,
  onCommentParagraph,
  onDeleteProposal,
  onCompleteElection,
  onCloseAmendments,
  isRepresentative = false,
  sectionIdPrefix = 'dashboard',
}: OrganizationDecisionsHistorySectionProps) {
  const { t } = useTranslation('organization');

  const {
    resolvedEntries,
    awaitingVoteEntries,
    resolvedPagination,
    loadingResolved,
    loadingMoreResolved,
    loadingPending,
    refresh,
    loadMoreResolved,
  } = decisions;

  const prepareProposalCardData = (
    proposal: ActivityFeedProposal,
    _tabType: 'pending'
  ): PrepareProposalCardDataResult | null => {
    if (!proposal.documentId || !proposal.documentTitle || !proposal.proposedText) {
      return null;
    }
    const doc = documents.find((d) => d.id === proposal.documentId);
    const allCollaborators = doc ? getVotingEligibleCollaborators(doc) : [];
    const orgForDoc = doc?.organizationId
      ? organizations.find((o) => o.id === doc.organizationId) ?? organization
      : organization;

    return {
      adaptedSuggestion: adaptProposalToSuggestion(proposal),
      documentContext: extractDocumentContext(proposal),
      originalText: getOriginalText(proposal),
      allCollaborators,
      organization: orgForDoc,
      otherProposals: (proposal.otherProposals || []).map((p) => adaptProposalToSuggestion(p)),
      agreedVersionInfo: proposal.agreedVersion,
      totalUsers: proposal.totalUsers || allCollaborators.length,
      documentOptions: doc?.options,
    };
  };

  const handleViewAllActivity = () => {
    if (onNavigateToActivityFeed) {
      onNavigateToActivityFeed(organization.id);
      return;
    }
    if (onNavigateToHash) {
      onNavigateToHash(buildHash({ view: 'activity', activityOrganizationId: organization.id }));
    }
  };

  const historyId = sectionIdPrefix ? `${sectionIdPrefix}-decisions-history` : undefined;
  const awaitingId = sectionIdPrefix ? `${sectionIdPrefix}-awaiting-vote` : undefined;

  const navigateToDoc = onNavigateToDocument ?? (() => {});

  return (
    <div className={SPACING.section.gap}>
      <div id={historyId}>
        <CollapsibleSection
          title={t('dashboardRecentDecisions')}
          iconName="CheckCircle"
          count={resolvedPagination.total || resolvedEntries.length}
          defaultOpen={resolvedEntries.length > 0}
        >
          {loadingResolved && resolvedEntries.length === 0 ? (
            <DocumentCardSkeleton count={2} />
          ) : resolvedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('dashboardNoRecentDecisions')}</p>
          ) : (
            <div className={SPACING.container.vertical}>
              <TimelineHistoryView
                entries={resolvedEntries}
                onNavigateToDocument={navigateToDoc}
                onNavigateToOrganization={onNavigateToOrganization}
                onNavigateToHash={onNavigateToHash}
                documents={documents}
                organizations={organizations}
                hasMore={resolvedPagination.hasMore}
                onLoadMore={loadMoreResolved}
                loadingMore={loadingMoreResolved}
                remainingCount={Math.max(0, resolvedPagination.total - resolvedEntries.length)}
              />
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleViewAllActivity} className="text-xs">
                  {t('dashboardViewAllDecisions')}
                  <Icon name="ArrowRight" className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CollapsibleSection>
      </div>

      <div id={awaitingId}>
        <CollapsibleSection
          title={t('dashboardAwaitingYourVote')}
          iconName="Clock"
          count={awaitingVoteEntries.length}
          defaultOpen={awaitingVoteEntries.length > 0}
        >
          {loadingPending && awaitingVoteEntries.length === 0 ? (
            <DocumentCardSkeleton count={1} />
          ) : awaitingVoteEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('dashboardNoAwaitingVotes')}</p>
          ) : (
            <div className={SPACING.container.vertical}>
              {awaitingVoteEntries.map((entry) => (
                <PendingDecisionCard
                  key={entry.id}
                  entry={entry}
                  currentUser={currentUser}
                  organizations={organizations}
                  documents={documents}
                  onVoteParagraph={
                    onVoteParagraph ??
                    ((_pid, documentId, _paragraphId, _voteType) => navigateToDoc(documentId))
                  }
                  onCommentParagraph={
                    onCommentParagraph ??
                    ((_pid, documentId, _paragraphId, _text) => navigateToDoc(documentId))
                  }
                  onDeleteProposal={onDeleteProposal ?? (() => {})}
                  onNavigateToDocument={navigateToDoc}
                  onNavigateToOrganization={onNavigateToOrganization}
                  prepareProposalCardData={prepareProposalCardData}
                  onRefreshPending={() => { void refresh(); }}
                  isRepresentative={(_orgId) => isRepresentative}
                  isActiveMember={() => true}
                  onCompleteElection={onCompleteElection}
                  onCloseAmendments={onCloseAmendments}
                />
              ))}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleViewAllActivity} className="text-xs">
                  {t('dashboardViewAllPending')}
                  <Icon name="ArrowRight" className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
