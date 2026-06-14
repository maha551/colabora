import React, { useState, useEffect, useMemo, useCallback } from 'react';

import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';

import { Button } from '../../ui/button';

import { Icon } from '../../ui/Icon';

import {

  Organization,

  RepresentativeElection,

  OrganizationGovernanceRules,

  Document,

  User,

  RuleProposal as RuleProposalType,

  OrganizationVote,

  StructureProposal,

  DocumentTreeProposal,

} from '../../../types';

import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';

import { activityApi, documentsApi } from '../../../lib/api';

import { ActivityFeedProposal } from '../../../utils/proposalAdapter';

import { DocumentCardSkeleton } from '../../ui/LoadingSkeleton';

import { toast } from 'sonner';

import { logger } from '../../../lib/logger';

import { SPACING, RADIUS } from '../../../lib/designSystem';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';

import { cn } from '../../ui/utils';

import { OrganizationDecisionsPanel } from '../OrganizationDecisionsPanel';
import { OrganizationWhatsHappeningCard } from '../OrganizationWhatsHappeningCard';
import { OrganizationDecisionsHistorySection } from '../OrganizationDecisionsHistorySection';
import { useOrganizationDecisions } from '../../../hooks/useOrganizationDecisions';
import { buildHash } from '../../../lib/hashRoutes';
import { ElectionResults } from '../../governance/ElectionResults';



interface RepresentativeLoading {

  ruleProposals: boolean;

  organizationVotes: boolean;

  structureProposals: boolean;

  treeProposals: boolean;

  deletionStatuses: boolean;

}



interface DashboardTabProps {

  organization: Organization;

  currentUser: User;

  permissions: OrganizationPermissions;

  elections: RepresentativeElection[];

  governanceRules: OrganizationGovernanceRules | null;

  documents?: Document[];

  documentsLoading?: boolean;

  electionsLoading?: boolean;

  ruleProposals: RuleProposalType[];

  organizationVotes: OrganizationVote[];

  structureProposals: StructureProposal[];

  treeProposals: DocumentTreeProposal[];

  deletionStatuses: Record<string, import('../../../lib/api').DeletionStatusResponse>;

  representativeLoading: RepresentativeLoading;

  onRefreshRuleProposals: () => Promise<void>;

  onRefreshOrganizationVotes: () => Promise<void>;

  onRefreshStructureProposals: () => Promise<void>;

  onRefreshTreeProposals: () => Promise<void>;

  onCompleteOrganizationVote: (voteId: string) => Promise<void>;

  onCreateElection: () => void;

  onNavigateToDocuments?: () => void;

  onNavigateToMembers?: () => void;

  onNavigateToGovernance?: () => void;

  onNavigateToActivity?: () => void;

  onNavigateToActivityFeed?: (organizationId: string) => void;

  onNavigateToHash?: (hash: string) => void;

  onNavigateToDocument?: (documentId: string) => void;

  onAddComment?: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => Promise<void>;

  onRefreshDocuments?: () => Promise<void>;

  onRefreshElections?: () => Promise<void>;

  onRefreshGovernance?: () => Promise<void>;

  isActive?: boolean;

  onNavigateToSchedule?: () => void;

  onNavigateToMeeting?: (meetingId: string, preferEmbed?: boolean) => void;

  onNavigateToPoll?: (pollId: string) => void;

  onNavigateToRepresentatives?: () => void;

  onPinOverviewEvent?: (eventId: string) => Promise<void>;

  onUnpinOverviewEvent?: () => Promise<void>;

}



const SECTION_PREFIX = 'dashboard';



function scrollToDashboardSection(section: string) {

  document.getElementById(`${SECTION_PREFIX}-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

}



export function DashboardTab({

  organization,

  currentUser,

  permissions,

  governanceRules,

  documents = [],

  electionsLoading = false,

  ruleProposals,

  organizationVotes,

  structureProposals,

  treeProposals,

  elections,

  deletionStatuses,

  representativeLoading,

  onRefreshRuleProposals,

  onRefreshOrganizationVotes,

  onRefreshStructureProposals,

  onRefreshTreeProposals,

  onCompleteOrganizationVote,

  onNavigateToActivity,

  onNavigateToActivityFeed,

  onNavigateToHash,

  onNavigateToDocument,

  onRefreshDocuments,

  onRefreshElections,

  onRefreshGovernance,

  isActive = true,

  onNavigateToSchedule,

  onNavigateToMeeting,

  onNavigateToPoll,

  onNavigateToRepresentatives,

  onPinOverviewEvent,

  onUnpinOverviewEvent,

}: DashboardTabProps) {

  const { t } = useTranslation('organization');
  const { t: tDoc } = useTranslation('documents');

  const [debatedProposals, setDebatedProposals] = useState<ActivityFeedProposal[]>([]);

  const [loadingDebated, setLoadingDebated] = useState(false);

  const [electionResultsTarget, setElectionResultsTarget] = useState<RepresentativeElection | null>(null);

  const orgDecisions = useOrganizationDecisions({
    organizationId: organization.id,
    userId: currentUser.id,
    enabled: isActive,
  });



  const documentIds = useMemo(() => documents.map((d) => d.id).join(','), [documents]);



  const orgDocuments = useMemo(

    () => documents.filter((d) => d.organizationId === organization.id),

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



  const fetchDebatedProposals = useCallback(async () => {

    setLoadingDebated(true);

    try {

      const data = await activityApi.getDebatedProposals();

      const orgDocumentIds = new Set(orgDocuments.map((d) => d.id));

      const filteredProposals = (data.proposals || []).filter((p: ActivityFeedProposal) =>

        orgDocumentIds.has(p.documentId)

      );

      setDebatedProposals(filteredProposals.slice(0, 5) as ActivityFeedProposal[]);

    } catch (error) {

      logger.error('Failed to fetch debated proposals:', error);

      setDebatedProposals([]);

      toast.error(t('failedToLoadDebatedProposals'));

    } finally {

      setLoadingDebated(false);

    }

  }, [orgDocuments, t]);



  useEffect(() => {

    fetchDebatedProposals();

  }, [organization.id, documentIds, fetchDebatedProposals]);



  const activeRuleProposals = ruleProposals.filter((p) => p.status === 'active');

  const activeOrganizationVotes = organizationVotes.filter((v) => v.status === 'approved');

  const proposedOrganizationVotes = organizationVotes.filter((v) => v.status === 'proposed');

  const visibleElections = elections.filter((e) => {

    if (e.status === 'draft') return permissions.isRepresentative;

    return (

      e.status === 'nomination' ||

      e.status === 'announced' ||

      e.status === 'voting' ||

      e.status === 'active'

    );

  });



  const orgDebatedProposals = debatedProposals.filter((p) => {

    const doc = documents.find((d) => d.id === p.documentId);

    return doc?.organizationId === organization.id;

  });



  const ruleVotesCount = activeRuleProposals.length;

  const proposalsCount = structureProposals.length + treeProposals.length;

  const documentsInVotingCount = votingDocuments.length;

  const discussionsCount = orgDebatedProposals.length;

  const electionsAndVotesCount =

    activeOrganizationVotes.length +

    visibleElections.length +

    (permissions.isRepresentative ? proposedOrganizationVotes.length : 0);

  const recentDecisionsCount =
    orgDecisions.resolvedPagination.total || orgDecisions.resolvedEntries.length;

  const awaitingVoteCount = orgDecisions.awaitingVoteEntries.length;

  const handleNavigateActivityFeed = useCallback(
    (orgId: string) => {
      if (onNavigateToActivityFeed) {
        onNavigateToActivityFeed(orgId);
      } else if (onNavigateToHash) {
        onNavigateToHash(buildHash({ view: 'activity', activityOrganizationId: orgId }));
      } else {
        onNavigateToActivity?.();
      }
    },
    [onNavigateToActivityFeed, onNavigateToHash, onNavigateToActivity]
  );



  const summaryChip = (

    count: number,

    label: string,

    icon: React.ComponentProps<typeof Icon>['name'],

    onClick?: () => void

  ) =>

    count > 0 && onClick ? (

      <Button

        variant="ghost"

        size="sm"

        onClick={onClick}

        className="text-muted-foreground hover:text-foreground"

        aria-label={`${count} ${label}`}

      >

        <Icon name={icon} className="h-4 w-4 mr-2" />

        {count} {label}

      </Button>

    ) : (

      <span className="text-sm text-muted-foreground/70 flex items-center gap-2">

        <Icon name={icon} className="h-4 w-4" />

        0 {label}

      </span>

    );



  return (

    <TabPanelBody>

        {organization.brandingBannerUrl && (

          <div className={cn('w-full overflow-hidden', RADIUS.panel)}>

            <img

              src={organization.brandingBannerUrl}

              alt={`${organization.name} banner`}

              className="w-full h-auto max-h-64 object-cover"

              onError={(e) => {

                (e.target as HTMLImageElement).style.display = 'none';

              }}

            />

          </div>

        )}

        {organization.description && (

          <p className="text-muted-foreground">{organization.description}</p>

        )}

        {onNavigateToSchedule && (
          <OrganizationWhatsHappeningCard
            organization={organization}
            permissions={permissions}
            enabled={isActive}
            onNavigateToSchedule={onNavigateToSchedule}
            onNavigateToMeeting={onNavigateToMeeting}
            onNavigateToPoll={onNavigateToPoll}
            onNavigateToDocument={onNavigateToDocument}
            onNavigateToRepresentatives={onNavigateToRepresentatives}
            onPinEvent={onPinOverviewEvent}
            onUnpinEvent={onUnpinOverviewEvent}
          />
        )}

        <TabPanelHeader variant="divider">

        <div className={cn(SPACING.toolbar.row, SPACING.toolbar.gap, 'flex-wrap w-full')}>

          {summaryChip(ruleVotesCount, t('dashboardSummaryRuleVotes'), 'Settings', () =>

            scrollToDashboardSection('rule-votes')

          )}

          {summaryChip(proposalsCount, t('dashboardSummaryProposals'), 'FileText', () =>

            scrollToDashboardSection('proposals')

          )}

          {summaryChip(documentsInVotingCount, t('dashboardSummaryDocumentsInVoting'), 'Vote', () =>

            scrollToDashboardSection('documents-voting')

          )}

          {summaryChip(discussionsCount, t('dashboardSummaryDiscussions'), 'MessageSquare', () =>
            discussionsCount > 0
              ? scrollToDashboardSection('discussions')
              : onNavigateToActivity?.()
          )}

          {summaryChip(electionsAndVotesCount, t('dashboardSummaryElectionsAndVotes'), 'Users', () =>

            scrollToDashboardSection('elections-votes')

          )}

          {summaryChip(recentDecisionsCount, t('dashboardSummaryRecentDecisions'), 'CheckCircle', () =>
            scrollToDashboardSection('decisions-history')
          )}

          {summaryChip(awaitingVoteCount, t('dashboardSummaryAwaitingVote'), 'Clock', () =>
            scrollToDashboardSection('awaiting-vote')
          )}

        </div>

        </TabPanelHeader>



        <OrganizationDecisionsPanel

          organization={organization}

          currentUser={currentUser}

          permissions={permissions}

          governanceRules={governanceRules}

          elections={elections}

          documents={documents}

          ruleProposals={ruleProposals}

          organizationVotes={organizationVotes}

          structureProposals={structureProposals}

          treeProposals={treeProposals}

          deletionStatuses={deletionStatuses}

          representativeLoading={{

            ...representativeLoading,

            organizationVotes: representativeLoading.organizationVotes || electionsLoading,

          }}

          onRefreshRuleProposals={onRefreshRuleProposals}

          onRefreshOrganizationVotes={onRefreshOrganizationVotes}

          onRefreshStructureProposals={onRefreshStructureProposals}

          onRefreshTreeProposals={onRefreshTreeProposals}

          onCompleteOrganizationVote={onCompleteOrganizationVote}

          onRefreshGovernance={onRefreshGovernance ?? (async () => {})}

          onRefreshElections={onRefreshElections ?? (async () => {})}

          onRefreshDocuments={onRefreshDocuments}

          onNavigateToDocument={onNavigateToDocument}

          showRepActions={permissions.isRepresentative}

          includeDocumentAmendmentActions={permissions.isRepresentative}

          sectionIdPrefix={SECTION_PREFIX}

        />



        <OrganizationDecisionsHistorySection
          organization={organization}
          currentUser={currentUser}
          documents={documents}
          organizations={[organization]}
          decisions={orgDecisions}
          onNavigateToDocument={onNavigateToDocument}
          onNavigateToOrganization={() => {}}
          onNavigateToHash={onNavigateToHash}
          onNavigateToActivityFeed={handleNavigateActivityFeed}
          onCompleteElection={(election) => setElectionResultsTarget(election)}
          onCloseAmendments={permissions.isRepresentative ? async (documentId) => {
            try {
              await documentsApi.closeAmendments(documentId);
              toast.success(tDoc('amendmentsClosedSuccess'));
              await orgDecisions.refresh();
              onRefreshDocuments?.();
            } catch (error) {
              logger.error('Failed to close amendments:', error);
              toast.error(error instanceof Error ? error.message : tDoc('failedToCloseAmendments'));
            }
          } : undefined}
          isRepresentative={permissions.isRepresentative}
          sectionIdPrefix={SECTION_PREFIX}
        />



        <div id={`${SECTION_PREFIX}-discussions`}>

          <Card>

            <CardHeader>

              <div className="flex items-center justify-between gap-2">

                <CardTitle className="flex items-center gap-2">

                  <Icon name="MessageSquare" className="h-5 w-5" />

                  {t('mostDiscussedParagraphs')}

                </CardTitle>

                {discussionsCount > 0 && onNavigateToActivity && (

                  <Button variant="ghost" size="sm" onClick={onNavigateToActivity} className="text-xs">

                    {t('viewAll')}

                    <Icon name="ArrowRight" className="h-3 w-3 ml-1" />

                  </Button>

                )}

              </div>

            </CardHeader>

            <CardContent>

              {loadingDebated ? (

                <DocumentCardSkeleton count={1} />

              ) : discussionsCount > 0 ? (

                <ul className="space-y-2">

                  {orgDebatedProposals.map((proposal, index) => (

                    <li key={proposal.id} className="flex items-start justify-between gap-2 text-sm">

                      <div className="min-w-0">

                        <span className="text-muted-foreground mr-2">#{index + 1}</span>

                        <span className="text-foreground truncate">{proposal.documentTitle}</span>

                        {proposal.debateScore != null && (

                          <span className="text-muted-foreground ml-2">

                            ({t('dashboardDebateScore', { score: Math.round(proposal.debateScore) })})

                          </span>

                        )}

                      </div>

                      {onNavigateToDocument && proposal.documentId && (

                        <Button

                          variant="ghost"

                          size="sm"

                          className="shrink-0 h-7 px-2 text-xs"

                          onClick={() => onNavigateToDocument(proposal.documentId)}

                        >

                          {t('view')}

                        </Button>

                      )}

                    </li>

                  ))}

                </ul>

              ) : (

                <div className="text-center py-6">

                  <Icon name="MessageSquare" className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />

                  <p className="text-muted-foreground mb-2">{t('noDiscussionsYet')}</p>

                  <p className="text-sm text-muted-foreground">{t('noDiscussionsYetDescription')}</p>

                </div>

              )}

            </CardContent>

          </Card>

        </div>

      {electionResultsTarget && (
        <ElectionResults
          organization={organization}
          election={electionResultsTarget}
          currentUser={currentUser}
          open={!!electionResultsTarget}
          onOpenChange={(open) => {
            if (!open) setElectionResultsTarget(null);
          }}
          onSuccess={async () => {
            await onRefreshElections?.();
            await onRefreshGovernance?.();
            await orgDecisions.refresh();
          }}
        />
      )}

    </TabPanelBody>

  );

}


