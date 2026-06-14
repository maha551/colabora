import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Icon } from '../../ui/Icon';
import { Organization, User, OrganizationGovernanceRules, RepresentativeElection, RuleProposal } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { GovernanceRulesVotingInterface } from '../../governance/GovernanceRulesVotingInterface';
import { ElectionCreationDialog } from '../../governance/ElectionCreationDialog';
import { ElectionResults } from '../../governance/ElectionResults';
import { governanceApi } from '../../../lib/api';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription } from '../../ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { RepresentativesList } from '../shared/RepresentativesList';
import { logger } from '../../../lib/logger';
import { useTimezone } from '../../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';

interface GovernanceTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];
  onRefreshGovernance: () => Promise<void>;
  onRefreshElections: () => Promise<void>;
  onCreateElection?: (electionData: {
    title: string;
    description?: string;
    votingStartsAt: string;
    votingEndsAt: string;
    candidates: string[];
  }) => Promise<void>;
  governanceRefreshTrigger?: number;
  autoOpenGovernanceRules?: boolean;
  onGovernanceRulesOpened?: () => void;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
}

export function GovernanceTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  elections,
  onRefreshGovernance,
  onRefreshElections,
  onCreateElection,
  governanceRefreshTrigger,
  autoOpenGovernanceRules = false,
  onGovernanceRulesOpened,
  onNavigateToMemberProfile,
}: GovernanceTabProps) {
  const { t } = useTranslation('governance');
  const { formatDate } = useTimezone();
  const [showGovernanceRulesExpanded, setShowGovernanceRulesExpanded] = useState(false);
  const [showElectionCreationDialog, setShowElectionCreationDialog] = useState(false);
  const [selectedElectionForResults, setSelectedElectionForResults] = useState<RepresentativeElection | null>(null);
  const [electionResultsOpen, setElectionResultsOpen] = useState(false);
  const [ruleProposals, setRuleProposals] = useState<RuleProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);

  // Note: Representative management and pending rule proposals have been moved to RepresentativesTab

  // Load rule proposals for showing indicators in governance rules summary
  useEffect(() => {
    loadRuleProposals();
  }, [organization.id, governanceRefreshTrigger]);

  const loadRuleProposals = async () => {
    setLoadingProposals(true);
    try {
      const response = await governanceApi.ruleProposalsApi.getRuleProposals(organization.id);
      const proposals = response.ruleProposals || [];
      setRuleProposals(proposals);
    } catch (error) {
      logger.error('Failed to load rule proposals:', error);
    } finally {
      setLoadingProposals(false);
    }
  };

  // Auto-open governance rules interface when requested (e.g., from Dashboard)
  useEffect(() => {
    if (autoOpenGovernanceRules && !showGovernanceRulesExpanded) {
      setShowGovernanceRulesExpanded(true);
      onGovernanceRulesOpened?.();
    }
  }, [autoOpenGovernanceRules, showGovernanceRulesExpanded, onGovernanceRulesOpened]);

  const handleElectionCreationSuccess = async () => {
    // WebSocket will handle the refresh via 'election-created' event
    setShowElectionCreationDialog(false);
  };

  const handleUpdateElectionPhase = async (electionId: string, newPhase: 'nomination' | 'voting') => {
    try {
      await governanceApi.updateElectionPhase(organization.id, electionId, newPhase);
      toast.success(t('tab.electionPhaseMoved', {
        phase: newPhase === 'nomination' ? t('tab.phaseNomination') : t('tab.phaseVoting'),
      }));
      // WebSocket will handle the refresh via 'election-updated' event
    } catch (error: unknown) {
      logger.error('Failed to update election phase:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : (typeof error === 'object' && error !== null && 'response' in error && typeof error.response === 'object' && error.response !== null && 'data' in error.response && typeof error.response.data === 'object' && error.response.data !== null && 'error' in error.response.data
          ? String(error.response.data.error)
          : t('tab.failedToUpdateElectionPhase'));
      toast.error(errorMessage);
    }
  };

  const getElectionStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">{t('tab.electionStatusDraft')}</Badge>;
      case 'announced':
      case 'nomination':
        return <Badge className="bg-blue-100 text-blue-800">{t('tab.electionStatusNominationOpen')}</Badge>;
      case 'active':
      case 'voting':
        return <Badge className={cn(COLORS.statusBg.success, COLORS.status.success)}>{t('tab.electionStatusVotingOpen')}</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-foreground">{t('tab.electionStatusCompleted')}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">{t('tab.electionStatusCancelled')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  // Get proposal count for a rule field
  const getProposalCountForRule = (field: string) => {
    return ruleProposals.filter(p => 
      (p.ruleField === field || p.current_rule_field === field) && 
      (p.status === 'active' || p.status === 'draft')
    ).length;
  };

  // Check if rule has active proposals
  const hasActiveProposals = (field: string) => {
    return ruleProposals.some(p => 
      (p.ruleField === field || p.current_rule_field === field) && 
      p.status === 'active'
    );
  };

  return (
    <TabPanelBody>
      <TabPanelHeader
        title={t('tab.title')}
        subtitle={t('tab.subtitle')}
        actions={
          permissions.canCreateElections ? (
            <Button onClick={() => setShowElectionCreationDialog(true)}>
              <Icon name="Plus" className="h-4 w-4 mr-2" />
              {t('tab.newElection')}
            </Button>
          ) : undefined
        }
      />

      {/* Representatives List - Visible to all members */}
      <RepresentativesList
        organization={organization}
        currentUser={currentUser}
        onNavigateToMemberProfile={onNavigateToMemberProfile}
      />

      {/* Governance Rules - Enhanced Summary */}
      <Collapsible open={showGovernanceRulesExpanded} onOpenChange={setShowGovernanceRulesExpanded}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Icon name="Shield" className="h-5 w-5" />
                {t('tab.governanceRules')}
              </CardTitle>
              <div className="flex gap-2">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                  >
                    {showGovernanceRulesExpanded ? (
                      <>
                        <Icon name="ChevronUp" className="h-4 w-4 mr-2" />
                        {t('tab.hideRules')}
                      </>
                    ) : (
                      <>
                        <Icon name="Search" className="h-4 w-4 mr-2" />
                        {t('tab.viewAllRules')}
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
            <CardDescription>
              {t('tab.governanceRulesDescription', { name: organization.name })}
            </CardDescription>
          </CardHeader>
          <CardContent>
          {governanceRules ? (
            <div className="space-y-4">
              {/* Critical Rules Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('tab.criticalSettings')}</h4>
                <div className="space-y-2 text-sm">
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('defaultAcceptanceThreshold') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.documentAcceptanceThreshold')}</span>
                      {hasActiveProposals('defaultAcceptanceThreshold') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('defaultAcceptanceThreshold') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{Math.round((governanceRules.defaultAcceptanceThreshold || 75))}%</span>
                  </div>
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('defaultQuorumPercentage') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.defaultQuorum')}</span>
                      {hasActiveProposals('defaultQuorumPercentage') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('defaultQuorumPercentage') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{Math.round((governanceRules.defaultQuorumPercentage || 0.3) * 100)}%</span>
                  </div>
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('minimumVotingPeriodHours') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.minimumVotingPeriod')}</span>
                      {hasActiveProposals('minimumVotingPeriodHours') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('minimumVotingPeriodHours') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">
                      {governanceRules.minimumVotingPeriodHours
                        ? t('tab.hoursUnit', { count: governanceRules.minimumVotingPeriodHours })
                        : t('notSet', { ns: 'organization' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Elections Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('tab.electionsSection')}</h4>
                <div className="space-y-2 text-sm">
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('representativeTermMonths') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.representativeTerm')}</span>
                      {hasActiveProposals('representativeTermMonths') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('representativeTermMonths') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">
                      {governanceRules.representativeTermMonths
                        ? t('tab.monthsUnit', { count: governanceRules.representativeTermMonths })
                        : t('notSet', { ns: 'organization' })}
                    </span>
                  </div>
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('electionQuorumPercentage') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.electionQuorum')}</span>
                      {hasActiveProposals('electionQuorumPercentage') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('electionQuorumPercentage') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{Math.round((governanceRules.electionQuorumPercentage || 0.5) * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Member Permissions Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('tab.memberPermissions')}</h4>
                <div className="space-y-2 text-sm">
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('membersCanProposeRules') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.membersCanProposeRules')}</span>
                      {hasActiveProposals('membersCanProposeRules') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('membersCanProposeRules') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{governanceRules.membersCanProposeRules ? t('tab.yes') : t('tab.no')}</span>
                  </div>
                  <div className={`flex justify-between items-center p-2 rounded ${hasActiveProposals('membersCanCreateDocuments') ? 'bg-orange-50 border border-orange-200' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('tab.membersCanCreateDocuments')}</span>
                      {hasActiveProposals('membersCanCreateDocuments') && (
                        <Badge variant="secondary" className={cn("text-xs", COLORS.statusBg.active, COLORS.status.active)}>
                          {t('tab.proposalCount', { count: getProposalCountForRule('membersCanCreateDocuments') })}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{governanceRules.membersCanCreateDocuments ? t('tab.yes') : t('tab.no')}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('tab.noGovernanceRulesConfigured')}</p>
          )}
          </CardContent>

          {/* Expanded Rules View */}
          <CollapsibleContent>
            <div className="border-t pt-4 mt-4">
              <GovernanceRulesVotingInterface
                organization={organization}
                currentUser={currentUser}
                onClose={() => setShowGovernanceRulesExpanded(false)}
                refreshTrigger={governanceRefreshTrigger}
                governanceRules={governanceRules}
              />
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Elections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Icon name="Vote" className="h-5 w-5" />
              {t('tab.representativeElections')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {elections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="Vote" className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('tab.noElectionsYet')}</p>
              {permissions.canCreateElections && (
                <p className="text-sm mt-2">{t('tab.createElectionHint')}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {elections.map((election) => {
                const isDraft = election.status === 'draft';
                const isNomination = election.status === 'announced' || election.status === 'nomination';
                const isVoting = election.status === 'active' || election.status === 'voting';
                const isCompleted = election.status === 'completed';
                const canManagePhase = isRepresentative && !isCompleted;

                return (
                  <div key={election.id} className={cn("border p-4 space-y-3", RADIUS.panel)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{election.electionTitle}</h4>
                          {getElectionStatusBadge(election.status)}
                        </div>
                        {election.electionDescription && (
                          <p className="text-sm text-muted-foreground mb-2">{election.electionDescription}</p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Icon name="Users" className="h-4 w-4" />
                            {t('tab.position', { count: election.positionsAvailable })}
                          </span>
                          {election.votingStartsAt && (
                            <span className="flex items-center gap-1">
                              <Icon name="Clock" className="h-4 w-4" />
                              {t('tab.votingDate', { date: formatDate(election.votingStartsAt) })}
                            </span>
                          )}
                          {isVoting && election.votesCast > 0 && (
                            <span>
                              {t('tab.votesCast', { cast: election.votesCast, total: election.totalVoters })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Phase Management Actions (Representatives Only) */}
                    {canManagePhase && (
                      <div className="flex gap-2 pt-2 border-t">
                        {isDraft && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateElectionPhase(election.id, 'nomination')}
                            className="gap-2"
                          >
                            <Icon name="Play" className="h-4 w-4" />
                            {t('tab.startNominationPeriod')}
                          </Button>
                        )}
                        {isNomination && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateElectionPhase(election.id, 'voting')}
                            className="gap-2"
                          >
                            <Icon name="Play" className="h-4 w-4" />
                            {t('tab.closeNominationsStartVoting')}
                          </Button>
                        )}
                        {isVoting && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedElectionForResults(election);
                              setElectionResultsOpen(true);
                            }}
                            className="gap-2"
                          >
                            <Icon name="CheckCircle" className="h-4 w-4" />
                            {t('tab.viewResultsComplete')}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Nominees Overview (Especially important during nomination phase) */}
                    {(isDraft || isNomination || isVoting) && election.candidates && election.candidates.length > 0 && (
                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-sm flex items-center gap-2">
                            <Icon name="UserCheck" className="h-4 w-4" />
                            {t('tab.nominees', { count: election.candidates.length })}
                          </h5>
                          {isNomination && (
                            <span className="text-xs text-muted-foreground">
                              {t('tab.nomineesAcceptedPending', {
                                accepted: election.candidates.filter(c => c.acceptedNomination).length,
                                pending: election.candidates.filter(c => !c.acceptedNomination).length,
                              })}
                            </span>
                          )}
                          {isVoting && (
                            <span className="text-xs text-muted-foreground">
                              {t('tab.positionsAvailable', { count: election.positionsAvailable })}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {election.candidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="flex items-start justify-between p-3 bg-muted rounded border text-sm hover:bg-muted/80 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium truncate">
                                    {candidate.user?.name || t('tab.unknownUser')}
                                  </span>
                                  {candidate.acceptedNomination ? (
                                    <Badge variant="default" className={cn("text-xs flex-shrink-0", COLORS.statusBg.success, COLORS.status.success, "border-success/20")}>
                                      <Icon name="CheckCircle" className="h-3 w-3 mr-1" />
                                      {t('tab.accepted')}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs flex-shrink-0">
                                      <Icon name="Clock" className="h-3 w-3 mr-1" />
                                      {t('tab.pendingAcceptance')}
                                    </Badge>
                                  )}
                                  {isVoting && candidate.votesReceived > 0 && (
                                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                                      {t('tab.voteCount', { count: candidate.votesReceived })}
                                    </Badge>
                                  )}
                                </div>
                                {candidate.candidateStatement && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {candidate.candidateStatement}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  {candidate.nominatedByName && (
                                    <span>{t('tab.nominatedBy', { name: candidate.nominatedByName })}</span>
                                  )}
                                  {candidate.createdAt && (
                                    <span>• {formatDate(candidate.createdAt)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Nominees Message */}
                    {(isDraft || isNomination) && (!election.candidates || election.candidates.length === 0) && (
                      <div className="pt-3 border-t">
                        <p className="text-sm text-muted-foreground text-center py-2">
                          {t('tab.noNomineesYet')}{' '}
                          {isNomination ? t('tab.noNomineesNominationHint') : t('tab.noNomineesDraftHint')}
                        </p>
                      </div>
                    )}

                    {/* Status Messages */}
                    {isDraft && (
                      <Alert>
                        <AlertDescription>
                          {t('tab.electionDraftAlert')}
                        </AlertDescription>
                      </Alert>
                    )}
                    {isNomination && (
                      <Alert>
                        <AlertDescription>
                          {t('tab.electionNominationAlert')}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {showElectionCreationDialog && (
        <ElectionCreationDialog
          organization={organization}
          currentUser={currentUser}
          open={showElectionCreationDialog}
          onOpenChange={setShowElectionCreationDialog}
          onSuccess={handleElectionCreationSuccess}
          governanceRules={governanceRules}
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

    </TabPanelBody>
  );
}
