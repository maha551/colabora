import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { LoadingState } from '../ui/LoadingState';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { Organization, OrganizationGovernanceRules, User, BootstrapStatus, RecoveryStatus, GovernanceRuleValue } from '../../types';
import { governanceApi } from '../../lib/api';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { RuleProposalDialog } from './RuleProposalDialog';
import { RuleProposalVotingInterface } from './RuleProposalVotingInterface';
import { BootstrapModeBanner } from './BootstrapModeBanner';
import { RecoveryModeBanner } from './RecoveryModeBanner';
import { RepresentativeRejectDialog } from '../shared/RepresentativeRejectDialog';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useOrganizationWebSocket, OrganizationUpdate } from '../../hooks/useOrganizationWebSocket';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, NAVIGATION, RADIUS } from '../../lib/designSystem';
import { formatVoteValue } from '../../lib/voting';

interface GovernanceRulesVotingInterfaceProps {
  organization: Organization;
  currentUser: User | null;
  onClose?: () => void;
  refreshTrigger?: number; // When this changes, refresh data
  /** When provided, skip fetching governance rules and use this (avoids duplicate fetch from parent). */
  governanceRules?: OrganizationGovernanceRules | null;
}

interface RuleProposal {
  id: string;
  title: string;
  description: string;
  ruleField: string;
  proposedValue: GovernanceRuleValue;
  options?: Array<{
    id: string;
    optionTitle: string;
    optionDescription?: string;
    proposedValue: GovernanceRuleValue;
  }>;
  status: 'draft' | 'active' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  createdBy: {
    id: string;
    name: string;
  };
  createdAt?: string;
  votingDeadline?: string;
  votes?: Array<{
    userId: string;
    selectedOptionId?: string;
    voteChoice?: 'yes' | 'no' | 'abstain';
  }>;
}

export function GovernanceRulesVotingInterface({
  organization,
  currentUser,
  onClose,
  refreshTrigger,
  governanceRules: governanceRulesProp,
}: GovernanceRulesVotingInterfaceProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { getRuleDisplayInfo: getLocalizedRuleDisplayInfo } = useRuleLabels();
  const { formatDate } = useTimezone();

  const getCategoryLabel = (category: string) =>
    t(`rulesPanel.categories.${category}`, category);
  const getCategoryDescription = (category: string) =>
    t(`rulesPanel.categoryDescriptions.${category}`, '');
  const [fetchedGovernanceRules, setFetchedGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const governanceRules = governanceRulesProp ?? fetchedGovernanceRules;
  const [ruleProposals, setRuleProposals] = useState<RuleProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);
  const [showRuleVotingInterface, setShowRuleVotingInterface] = useState(false);
  const [selectedRuleField, setSelectedRuleField] = useState<string>('');
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [startingVotingProposalId, setStartingVotingProposalId] = useState<string | null>(null);
  const [declineProposalDialog, setDeclineProposalDialog] = useState<RuleProposal | null>(null);
  const [withdrawingProposalId, setWithdrawingProposalId] = useState<string | null>(null);

  const permissionsResult = useOrganizationPermissions(
    currentUser ?? ({ id: '', email: '', name: '', role: 'user' } as User),
    organization,
    governanceRules
  );
  const permissions = currentUser ? permissionsResult : null;

  useEffect(() => {
    loadData();
  }, [organization.id, refreshTrigger]);

  // Handle organization WebSocket updates for real-time status changes
  const handleOrganizationUpdate = React.useCallback((update: OrganizationUpdate) => {
    if (update.organizationId !== organization.id) return;

    switch (update.eventType) {
      case 'rule-proposal-voting-started': {
        const data = update.data as { type: 'rule-proposal-voting-started'; proposalId: string; title: string; votingEndsAt: string };
        // Check if this proposal was started by another user
        const proposal = ruleProposals.find(p => p.id === data.proposalId);
        if (proposal && proposal.status === 'draft' && startingVotingProposalId !== data.proposalId) {
          toast.info(t('votingStartedFor', { title: data.title }), {
            duration: 4000
          });
        }
        // Refresh data to get updated status
        loadData();
        break;
      }
      case 'rule-proposal-created':
      case 'rule-proposal-approved':
      case 'rule-proposal-rejected':
      case 'rule-proposal-declined':
      case 'rule-proposal-withdrawn':
      case 'rule-proposal-expired':
      case 'rule-proposal-vote-cast':
        // Refresh data to get updated status
        loadData();
        break;
      case 'governance-rules-updated':
        // Refresh governance rules
        loadData();
        break;
    }
  }, [organization.id, ruleProposals, startingVotingProposalId]);

  // Set up WebSocket connection for real-time updates
  useOrganizationWebSocket({
    organizationId: organization.id,
    userId: currentUser?.id || null,
    authToken: localStorage.getItem('authToken'),
    onOrganizationUpdate: handleOrganizationUpdate
  });

  const loadData = async () => {
    setLoading(true);
    try {
      if (governanceRulesProp != null) {
        setRecoveryStatus(governanceRulesProp ? {
          mode: governanceRulesProp.recoveryMode,
          enteredAt: governanceRulesProp.recoveryModeEnteredAt,
          reason: governanceRulesProp.recoveryModeReason,
          canExit: false,
        } : null);
      }
      if (governanceRulesProp == null) {
        const [rulesResponse, proposalsResponse, bootstrapResponse] = await Promise.allSettled([
          governanceApi.getGovernanceRules(organization.id),
          governanceApi.ruleProposalsApi.getRuleProposals(organization.id),
          governanceApi.getBootstrapStatus(organization.id).catch(() => null),
        ]);
        if (rulesResponse.status === 'fulfilled') {
          setFetchedGovernanceRules(rulesResponse.value.governanceRules);
        } else {
          logger.error('Failed to load governance rules:', rulesResponse.reason);
          toast.error(t('failedToLoadGovernanceRules'));
        }
        if (proposalsResponse.status === 'fulfilled') {
          setRuleProposals((proposalsResponse.value.ruleProposals || []) as unknown as RuleProposal[]);
        } else {
          logger.warn('Failed to load rule proposals:', proposalsResponse.reason);
          setRuleProposals([]);
        }
        if (bootstrapResponse.status === 'fulfilled' && bootstrapResponse.value) {
          setBootstrapStatus(bootstrapResponse.value.bootstrap ?? null);
          if (rulesResponse.status === 'fulfilled' && rulesResponse.value.governanceRules) {
            const gr = rulesResponse.value.governanceRules;
            setRecoveryStatus({ mode: gr.recoveryMode, enteredAt: gr.recoveryModeEnteredAt, reason: gr.recoveryModeReason, canExit: false });
          }
        }
      } else {
        const [proposalsResponse, bootstrapResponse] = await Promise.allSettled([
          governanceApi.ruleProposalsApi.getRuleProposals(organization.id),
          governanceApi.getBootstrapStatus(organization.id).catch(() => null),
        ]);
        if (proposalsResponse.status === 'fulfilled') {
          setRuleProposals((proposalsResponse.value.ruleProposals || []) as unknown as RuleProposal[]);
        } else {
          logger.warn('Failed to load rule proposals:', proposalsResponse.reason);
          setRuleProposals([]);
        }
        if (bootstrapResponse.status === 'fulfilled' && bootstrapResponse.value) {
          setBootstrapStatus(bootstrapResponse.value.bootstrap ?? null);
        }
      }
    } catch (error) {
      logger.error('Unexpected error loading governance data:', error);
      toast.error(t('failedToLoadGovernanceData'));
    } finally {
      setLoading(false);
    }
  };

  const RULE_ICONS_AND_CATEGORY: Record<string, { iconName: string; category: string; importance: 'critical' | 'important' | 'standard' }> = {
    representativeTermMonths: { iconName: 'Clock', category: 'Elections', importance: 'important' },
    representativeTermLimits: { iconName: 'Users', category: 'Elections', importance: 'standard' },
    electionVotingMethod: { iconName: 'Vote', category: 'Elections', importance: 'important' },
    electionQuorumPercentage: { iconName: 'Users', category: 'Elections', importance: 'critical' },
    electionNoticeDays: { iconName: 'Clock', category: 'Elections', importance: 'standard' },
    defaultVotingDeadlineHours: { iconName: 'Clock', category: 'Voting', importance: 'important' },
    defaultQuorumPercentage: { iconName: 'Users', category: 'Voting', importance: 'critical' },
    defaultAcceptanceThreshold: { iconName: 'Vote', category: 'Voting', importance: 'critical' },
    documentProposalPeriodDays: { iconName: 'Clock', category: 'Voting', importance: 'standard' },
    paragraphProposalCutoffDays: { iconName: 'Clock', category: 'Voting', importance: 'standard' },
    thresholdCalculationMethod: { iconName: 'Settings', category: 'Voting', importance: 'important' },
    anonymousVotingEnabled: { iconName: 'EyeOff', category: 'Voting', importance: 'important' },
    voteChangeAllowed: { iconName: 'Settings', category: 'Voting', importance: 'standard' },
    representativeCanCreateVotes: { iconName: 'Vote', category: 'Permissions', importance: 'important' },
    representativeCanInviteMembers: { iconName: 'Users', category: 'Permissions', importance: 'important' },
    representativeCanManageDocuments: { iconName: 'FileText', category: 'Permissions', importance: 'important' },
    representativeApprovalRequired: { iconName: 'Shield', category: 'Permissions', importance: 'important' },
    membersCanProposeRules: { iconName: 'Settings', category: 'Permissions', importance: 'important' },
    membersCanCreateDocuments: { iconName: 'FileText', category: 'Permissions', importance: 'important' },
    membersCanInitializeElections: { iconName: 'Vote', category: 'Permissions', importance: 'standard' },
    membersCanInviteMembers: { iconName: 'Users', category: 'Permissions', importance: 'standard' },
    membersCanManageRuleProposals: { iconName: 'Settings', category: 'Permissions', importance: 'standard' },
    membersCanProposeRulesThreshold: { iconName: 'Settings', category: 'Permissions', importance: 'standard' },
    membersCanCreateDocumentsThreshold: { iconName: 'FileText', category: 'Permissions', importance: 'standard' },
    membersCanInitializeElectionsThreshold: { iconName: 'Vote', category: 'Permissions', importance: 'standard' },
    membersCanInviteMembersThreshold: { iconName: 'Users', category: 'Permissions', importance: 'standard' },
    membersCanManageRuleProposalsThreshold: { iconName: 'Settings', category: 'Permissions', importance: 'standard' },
    tamperProofEnabled: { iconName: 'Lock', category: 'Security', importance: 'important' },
    auditTrailEnabled: { iconName: 'FileText', category: 'Security', importance: 'important' },
    defaultStructureProposalsEnabled: { iconName: 'FileText', category: 'Voting', importance: 'standard' },
    defaultVotingAnonymityLocked: { iconName: 'Lock', category: 'Voting', importance: 'standard' },
    minimumQuorumPercentage: { iconName: 'Users', category: 'Safeguards', importance: 'critical' },
    minimumApprovalThreshold: { iconName: 'Vote', category: 'Safeguards', importance: 'critical' },
    minimumVotingPeriodHours: { iconName: 'Clock', category: 'Safeguards', importance: 'critical' },
    membersCanInitiateMistrustVote: { iconName: 'AlertTriangle', category: 'Permissions', importance: 'important' },
    mistrustVoteThreshold: { iconName: 'Vote', category: 'Permissions', importance: 'important' },
    mistrustVoteQuorumPercentage: { iconName: 'Users', category: 'Permissions', importance: 'important' },
  };

  const getRuleDisplayInfo = (field: string) => {
    const base = getLocalizedRuleDisplayInfo(field);
    const extra = RULE_ICONS_AND_CATEGORY[field] ?? { iconName: 'Settings', category: 'Other', importance: 'standard' as const };
    return { ...base, ...extra };
  };

  const getCurrentValueDisplay = (field: string, value: GovernanceRuleValue) => {
    return formatVoteValue(field, value);
  };

  const getActiveProposalForRule = (ruleField: string) => {
    return ruleProposals.find(proposal =>
      proposal.ruleField === ruleField &&
      proposal.status === 'active'
    );
  };

  const handleRuleClick = (ruleField: string) => {
    const activeProposal = getActiveProposalForRule(ruleField);
    const draftProposal = ruleProposals.find(proposal =>
      proposal.ruleField === ruleField && proposal.status === 'draft'
    );

    if (activeProposal) {
      // Show voting interface for this proposal
      setSelectedProposalId(activeProposal.id);
      setShowRuleVotingInterface(true);
    } else if (draftProposal && canManageRuleProposals && canStartDocumentVoting) {
      // Show start voting option for draft proposals (if user can manage and can start votes)
      handleStartVoting(draftProposal.id);
    } else {
      // Show proposal dialog
      setSelectedRuleField(ruleField);
      setShowRuleProposalDialog(true);
    }
  };

  const handleStartVoting = async (proposalId: string) => {
    // Prevent duplicate requests
    if (startingVotingProposalId === proposalId) {
      return;
    }

    // Find the proposal to check its current status
    const proposal = ruleProposals.find(p => p.id === proposalId);
    if (!proposal) {
      toast.error(t('proposalNotFound'));
      return;
    }

    // Validate status before attempting to start voting
    if (proposal.status !== 'draft') {
      toast.error(t('proposalStatusCannotBeStarted', { status: proposal.status }));
      loadData(); // Refresh to get latest status
      return;
    }

    setStartingVotingProposalId(proposalId);
    
    try {
      await governanceApi.ruleProposalsApi.startRuleProposalVoting(organization.id, proposalId);
      toast.success(t('votingStartedSuccessfully'));
      loadData(); // Refresh to show updated status
    } catch (error: unknown) {
      logger.error('Failed to start voting:', error);
      
      // Extract detailed error information from API response
      let errorMessage = 'Failed to start voting';
      type VoteStartErrorDetails = {
        code?: string;
        currentStatus?: string;
        currentStatusInfo?: { description?: string };
        message?: string;
        reason?: string;
        suggestion?: string;
      };
      let errorDetails: VoteStartErrorDetails | null = null;
      
      if (error instanceof Error && 'details' in error) {
        errorDetails = (error as Error & { details?: VoteStartErrorDetails }).details ?? null;
      } else if (error && typeof error === 'object' && error !== null && 'details' in error) {
        errorDetails = (error as { details?: VoteStartErrorDetails }).details ?? null;
      }
      
      if (errorDetails) {
        // Check if it's a status error
        if (errorDetails.code === 'STATUS_INVALID' || errorDetails.currentStatus) {
          const currentStatus = errorDetails.currentStatus || 'unknown';
          const statusInfo = errorDetails.currentStatusInfo || {};
          
          errorMessage = errorDetails.message || `Proposal is currently ${currentStatus}. Only draft proposals can be started.`;
          
          // Provide helpful suggestions based on status
          if (currentStatus === 'active') {
            errorMessage += ' Voting is already in progress.';
          } else if (currentStatus === 'approved') {
            errorMessage += ' This proposal has already been approved.';
          } else if (currentStatus === 'rejected') {
            errorMessage += ' This proposal was rejected and cannot be started.';
          } else if (currentStatus === 'expired') {
            errorMessage += ' This proposal has expired.';
          } else if (currentStatus === 'cancelled') {
            errorMessage += ' This proposal was cancelled.';
          }
          
          // Show explanation if available
          if (statusInfo.description) {
            toast.error(errorMessage, {
              description: statusInfo.description,
              duration: 5000
            });
          } else {
            toast.error(errorMessage, { duration: 5000 });
          }
        } else if (errorDetails.code === 'PERMISSION_DENIED') {
          errorMessage = errorDetails.reason || 'You do not have permission to start voting';
          const suggestion = errorDetails.suggestion || 'Contact your organization representative for assistance.';
          toast.error(errorMessage, {
            description: suggestion,
            duration: 5000
          });
        } else if (errorDetails.message) {
          errorMessage = errorDetails.message;
          toast.error(errorMessage, { duration: 5000 });
        } else {
          toast.error(errorMessage);
        }
      } else {
        toast.error(errorMessage);
      }
      
      // Refresh data to get latest status
      loadData();
    } finally {
      setStartingVotingProposalId(null);
    }
  };

  const handleDeclineRuleProposal = async (proposalId: string, reason: string) => {
    await governanceApi.ruleProposalsApi.declineRuleProposal(organization.id, proposalId, reason);
    toast.success(t('proposalDeclined'));
    setDeclineProposalDialog(null);
    loadData();
  };

  const handleWithdrawRuleProposal = async (proposalId: string) => {
    if (withdrawingProposalId === proposalId) return;
    setWithdrawingProposalId(proposalId);
    try {
      await governanceApi.ruleProposalsApi.withdrawRuleProposal(organization.id, proposalId);
      toast.success(t('proposalWithdrawn'));
      loadData();
    } catch (err) {
      logger.error('Failed to withdraw rule proposal', { error: err, proposalId });
      toast.error(err instanceof Error ? err.message : t('failedToWithdrawProposal'));
    } finally {
      setWithdrawingProposalId(null);
    }
  };

  const handleProposalSuccess = () => {
    setShowRuleProposalDialog(false);
    setSelectedRuleField('');
    loadData(); // Refresh data to show new proposal
  };

  const getRuleStatusBadge = (ruleField: string) => {
    const activeProposal = getActiveProposalForRule(ruleField);
    const draftProposal = ruleProposals.find(proposal =>
      proposal.ruleField === ruleField && proposal.status === 'draft'
    );
    const expiredProposal = ruleProposals.find(proposal =>
      proposal.ruleField === ruleField && proposal.status === 'expired'
    );

    if (activeProposal) {
      return (
        <Badge variant="secondary" className={COLORS.statusBadge.warning}>
          <Icon name="Vote" className="h-3 w-3 mr-1" />
          {t('votingActive')}
        </Badge>
      );
    }
    if (draftProposal) {
      return (
        <Badge variant="secondary" className={COLORS.statusBadge.warning}>
          <Icon name="Settings" className="h-3 w-3 mr-1" />
          {t('rulesPanel.pendingApproval')}
        </Badge>
      );
    }
    if (expiredProposal) {
      return (
        <Badge variant="secondary" className="bg-muted text-foreground">
          <Icon name="Clock" className="h-3 w-3 mr-1" />
          {t('proposalStatusBadge.expired.label')}
        </Badge>
      );
    }
    return null;
  };

  // Use dynamic permissions
  const canProposeRules = permissions?.canProposeRules ?? false;
  const canManageRuleProposals = permissions?.canManageRuleProposals ?? false;
  const canStartDocumentVoting = permissions?.canStartDocumentVoting ?? false;
  const isRepresentative = currentUser ? organization.representatives?.includes(currentUser.id) : false;
  const isActiveMember = currentUser ? organization.members?.some(m => m.userId === currentUser.id && m.status === 'active') : false;

  // Filter and search logic
  const filteredRules = useMemo(() => {
    if (!governanceRules) return [];

    const allRules: Array<{ field: string; value: GovernanceRuleValue; info: ReturnType<typeof getRuleDisplayInfo> }> = [];
    Object.entries(governanceRules).forEach(([field, value]) => {
      if (['id', 'organizationId', 'createdAt', 'updatedAt', 'bootstrapMode', 'bootstrapCompletedAt',
            'recoveryMode', 'recoveryModeEnteredAt', 'recoveryModeReason', 'lastSuccessfulVoteAt',
            'failedProposalsCount', 'lastFailedProposalAt', 'ruleChangesThisMonth', 'lastRuleChangeAt'].includes(field)) {
        return;
      }

      const info = getRuleDisplayInfo(field);
      
      // Filter by category
      if (selectedCategory !== 'all' && info.category !== selectedCategory) {
        return;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesLabel = info.label.toLowerCase().includes(query);
        const matchesDescription = info.description.toLowerCase().includes(query);
        const matchesField = field.toLowerCase().includes(query);
        if (!matchesLabel && !matchesDescription && !matchesField) {
          return;
        }
      }

      allRules.push({ field, value, info });
    });

    return allRules;
  }, [governanceRules, selectedCategory, searchQuery]);

  // Group filtered rules by category
  const filteredRuleCategories = useMemo(() => {
    const categories: Record<string, Array<{ field: string; value: GovernanceRuleValue; info: ReturnType<typeof getRuleDisplayInfo> }>> = {};
    filteredRules.forEach(({ field, value, info }) => {
      if (!categories[info.category]) {
        categories[info.category] = [];
      }
      categories[info.category].push({ field, value, info });
    });
    return categories;
  }, [filteredRules]);

  // Get all unique categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    if (governanceRules) {
      Object.keys(governanceRules).forEach(field => {
        const info = getRuleDisplayInfo(field);
        if (info.category) cats.add(info.category);
      });
    }
    return Array.from(cats);
  }, [governanceRules]);

  // Get proposals by status
  const activeProposals = useMemo(() => ruleProposals.filter(p => p.status === 'active'), [ruleProposals]);
  const draftProposals = useMemo(() => ruleProposals.filter(p => p.status === 'draft'), [ruleProposals]);
  const myProposals = useMemo(() => 
    currentUser ? ruleProposals.filter(p => p.createdBy.id === currentUser.id) : []
  , [ruleProposals, currentUser]);

  if (loading) {
    return (
      <LoadingState isLoading={true} mode="spinner" spinnerSize="md">
        <></>
      </LoadingState>
    );
  }

  if (showRuleVotingInterface) {
    return (
      <RuleProposalVotingInterface
        organization={organization}
        currentUser={currentUser}
        proposalId={selectedProposalId}
        refreshTrigger={refreshTrigger}
        onBack={() => {
          setShowRuleVotingInterface(false);
          setSelectedProposalId('');
          loadData(); // Refresh data after voting
        }}
        onVoteComplete={() => {
          loadData(); // Refresh data after voting
        }}
      />
    );
  }

  if (!governanceRules) {
    return (
      <Alert>
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>
          {t('rulesPanel.rulesNotConfigured')}
        </AlertDescription>
      </Alert>
    );
  }

  // Render rule card component
  const renderRuleCard = ({ field, value, info }: { field: string; value: GovernanceRuleValue; info: ReturnType<typeof getRuleDisplayInfo> }) => {
    const activeProposal = getActiveProposalForRule(field);
    const draftProposal = ruleProposals.find(proposal =>
      proposal.ruleField === field && proposal.status === 'draft'
    );
    const statusBadge = getRuleStatusBadge(field);
    const hasProposals = activeProposal || draftProposal;

    return (
      <div
        key={field}
        className={cn(
          'flex items-center justify-between p-4 border transition-colors cursor-pointer',
          RADIUS.panel,
          hasProposals
            ? cn('border-[var(--status-proposed-border)] hover:opacity-95', COLORS.statusBg.active)
            : 'hover:bg-muted'
        )}
        onClick={() => handleRuleClick(field)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium">{info.label}</h4>
            {statusBadge}
            {info.importance === 'critical' && (
              <Badge variant="outline" className={cn('text-xs', COLORS.statusBadge.error)}>
                {t('rulesPanel.critical')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2 line-clamp-1">{info.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-medium">
              {t('rulesPanel.currentValue', { value: getCurrentValueDisplay(field, value) })}
            </Badge>
            {activeProposal && (
              <Badge variant="secondary" className={cn('text-xs', COLORS.statusBadge.warning)}>
                <Icon name="Vote" className="h-3 w-3 mr-1" />
                {t('votingActive')}
              </Badge>
            )}
            {draftProposal && (
              <Badge variant="secondary" className={cn('text-xs', COLORS.statusBadge.warning)}>
                <Icon name="Settings" className="h-3 w-3 mr-1" />
                {t('rulesPanel.pendingApproval')}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {activeProposal ? (
            <Button size="sm" variant="default" onClick={(e) => {
              e.stopPropagation();
              setSelectedProposalId(activeProposal.id);
              setShowRuleVotingInterface(true);
            }}>
              <Icon name="Vote" className="h-4 w-4 mr-1" />
              {t('rulesPanel.voteNow')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              setSelectedRuleField(field);
              setShowRuleProposalDialog(true);
            }}>
              <Icon name="Plus" className="h-4 w-4 mr-1" />
              {t('rulesPanel.propose')}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('rulesPanel.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('rulesPanel.subtitle')}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tCommon('buttons.close')}
          </Button>
        )}
      </div>

      {bootstrapStatus?.mode && (
        <BootstrapModeBanner
          organization={organization}
          bootstrapStatus={bootstrapStatus}
          onComplete={loadData}
        />
      )}

      {recoveryStatus?.mode && (
        <RecoveryModeBanner recoveryStatus={recoveryStatus} />
      )}

      <Separator />

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 sticky top-0 bg-card z-10 pb-2">
        <div className="relative flex-1">
          <Icon name="Search" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder={t('rulesPanel.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchQuery('')}
            >
              <Icon name="X" className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={cn("h-9 border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring", RADIUS.control)}
          >
            <option value="all">{t('rulesPanel.allCategories')}</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* User Status and Permissions */}
      {currentUser && (
        <Card className={`${COLORS.statusBg.info} border-[var(--status-active-border)]`}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{t('rulesPanel.statusPermissionsTitle')}</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn("inline-flex shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                          aria-label={t('tooltips.statusAndPermissionsHelp')}
                        >
                          <Icon name="Info" className="h-4 w-4 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{t('tooltips.statusAndPermissions')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {isRepresentative && (
                    <Badge variant="default" className="bg-[var(--status-active-solid)]">
                      <Icon name="Shield" className="h-3 w-3 mr-1" />
                      {t('rulesPanel.representative')}
                    </Badge>
                  )}
                  {isActiveMember && (
                    <Badge variant="secondary">
                      <Icon name="Users" className="h-3 w-3 mr-1" />
                      {t('rulesPanel.activeMember')}
                    </Badge>
                  )}
                  {!isRepresentative && !isActiveMember && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t('rulesPanel.limitedAccess')}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {canProposeRules ? (
                      <Icon name="CheckCircle" className={cn('h-3 w-3', COLORS.status.success)} />
                    ) : (
                      <Icon name="XCircle" className="h-3 w-3 text-muted-foreground/70" />
                    )}
                    <span>{t('rulesPanel.canProposeRules')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageRuleProposals ? (
                      <Icon name="CheckCircle" className={cn('h-3 w-3', COLORS.status.success)} />
                    ) : (
                      <Icon name="XCircle" className="h-3 w-3 text-muted-foreground/70" />
                    )}
                    <span>{t('rulesPanel.canManageProposals')}</span>
                  </div>
                  {!canProposeRules && !isRepresentative && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {governanceRules?.membersCanProposeRules 
                        ? t('rulesPanel.needActiveMember')
                        : t('rulesPanel.onlyRepresentatives')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-4 inline-flex flex-row">
          <TabsTrigger value="overview" className={cn(NAVIGATION.tabs.trigger, 'flex-1 items-center')}>
            {t('rulesPanel.tabOverview')}
            {(activeProposals.length > 0 || draftProposals.length > 0) && (
              <Badge variant="secondary" className={cn('ml-1 text-xs', COLORS.statusBadge.warning)}>
                {activeProposals.length + draftProposals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className={cn(NAVIGATION.tabs.trigger, 'flex-1 items-center')}>
            {t('rulesPanel.tabAllRules')}
            {filteredRules.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {filteredRules.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="proposals" className={cn(NAVIGATION.tabs.trigger, 'flex-1 items-center')}>
            {t('rulesPanel.tabProposals')}
            {(activeProposals.length > 0 || draftProposals.length > 0) && (
              <Badge variant="secondary" className={cn('ml-1 text-xs', COLORS.statusBadge.warning)}>
                {activeProposals.length + draftProposals.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <Alert>
            <Icon name="Shield" className="h-4 w-4" />
            <AlertDescription>
              {t('rulesPanel.overviewAlert')}
            </AlertDescription>
          </Alert>

          {/* Rules Needing Attention */}
          {(activeProposals.length > 0 || draftProposals.length > 0) && (
            <Card className={`border-[var(--status-proposed-border)] ${COLORS.statusBg.active}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="AlertTriangle" className={cn('h-5 w-5', COLORS.status.active)} />
                  {t('rulesPanel.rulesNeedingAttention')}
                </CardTitle>
                <CardDescription>
                  {t('rulesPanel.activeAndPendingCount', { active: activeProposals.length, pending: draftProposals.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeProposals.map(proposal => {
                  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
                  return (
                    <div
                      key={proposal.id}
                      className={cn(RADIUS.panel, "flex items-center justify-between p-3 border bg-card cursor-pointer border-[var(--status-proposed-border)] hover:opacity-95", COLORS.statusBg.active)}
                      onClick={() => {
                        setSelectedProposalId(proposal.id);
                        setShowRuleVotingInterface(true);
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.title}</h4>
                          <Badge variant="secondary" className={COLORS.statusBadge.warning}>
                            {t('votingActive')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{ruleInfo.label}</p>
                      </div>
                      <Button size="sm" variant="default">
                        <Icon name="Vote" className="h-4 w-4 mr-1" />
                        {t('vote')}
                      </Button>
                    </div>
                  );
                })}
                {draftProposals.map(proposal => {
                  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
                  return (
                    <div
                      key={proposal.id}
                      className={cn(RADIUS.panel, "flex items-center justify-between p-3 border bg-card border-[var(--status-pending-border)]", COLORS.statusBg.warning)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.title}</h4>
                          <Badge variant="secondary" className={COLORS.statusBadge.warning}>
                            {t('rulesPanel.pendingApproval')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{ruleInfo.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('rulesPanel.proposedBy', { name: proposal.createdBy.name })}</p>
                      </div>
                      {canManageRuleProposals && canStartDocumentVoting && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={startingVotingProposalId === proposal.id || proposal.status !== 'draft'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartVoting(proposal.id);
                          }}
                        >
                          {startingVotingProposalId === proposal.id ? (
                            <>
                              <div className={cn("animate-spin h-4 w-4 border-b-2 border-current mr-1", RADIUS.pill)} />
                              {t('rulesPanel.starting')}
                            </>
                          ) : (
                            <>
                              <Icon name="Vote" className="h-4 w-4 mr-1" />
                              {t('rulesPanel.startVoting')}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Important Rules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="Shield" className="h-5 w-5" />
                {t('rulesPanel.importantRules')}
              </CardTitle>
              <CardDescription>
                {t('rulesPanel.importantRulesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredRules
                .filter(({ info }) => info.importance === 'critical' || info.importance === 'important')
                .slice(0, 8)
                .map(renderRuleCard)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Rules Tab */}
        <TabsContent value="rules" className="space-y-6 mt-4">
          {Object.keys(filteredRuleCategories).length === 0 ? (
            <Alert>
              <Icon name="AlertTriangle" className="h-4 w-4" />
              <AlertDescription>
                {searchQuery || selectedCategory !== 'all' 
                  ? t('rulesPanel.noRulesMatch')
                  : t('rulesPanel.noRulesFound')}
              </AlertDescription>
            </Alert>
          ) : (
            Object.entries(filteredRuleCategories).map(([category, rules]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name={getRuleDisplayInfo(rules[0]?.field || '').iconName || 'Settings'} className="h-5 w-5" />
              {getCategoryLabel(category)}
            </CardTitle>
            <CardDescription>
              {getCategoryDescription(category)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              {rules.map(renderRuleCard)}
          </CardContent>
        </Card>
            ))
          )}
        </TabsContent>

        {/* Proposals Tab - Consolidated View */}
        <TabsContent value="proposals" className="space-y-6 mt-4">
          {/* Active Proposals */}
          {activeProposals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Vote" className="h-5 w-5" />
                  {t('rulesPanel.activeProposals', { count: activeProposals.length })}
                </CardTitle>
                <CardDescription>
                  {t('rulesPanel.activeProposalsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeProposals.map(proposal => {
                  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
                  return (
                    <div
                      key={proposal.id}
                      className={cn(RADIUS.panel, "flex items-center justify-between p-4 border cursor-pointer transition-colors border-[var(--status-proposed-border)]", COLORS.statusBg.active, "hover:opacity-95")}
                      onClick={() => {
                        setSelectedProposalId(proposal.id);
                        setShowRuleVotingInterface(true);
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.title}</h4>
                          <Badge variant="secondary" className={COLORS.statusBadge.warning}>
                            {t('votingActive')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{ruleInfo.label}</p>
                        <p className="text-sm text-muted-foreground">{proposal.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{t('rulesPanel.proposedBy', { name: proposal.createdBy.name })}</span>
                          {proposal.votingDeadline && (
                            <span>• {t('rulesPanel.votingEnds', { date: formatDate(proposal.votingDeadline) })}</span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="default" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProposalId(proposal.id);
                        setShowRuleVotingInterface(true);
                      }}>
                        <Icon name="Vote" className="h-4 w-4 mr-1" />
                        {t('vote')}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Pending Proposals (Draft) */}
          {draftProposals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Settings" className="h-5 w-5" />
                  {t('rulesPanel.pendingProposals', { count: draftProposals.length })}
                </CardTitle>
                <CardDescription>
                  {canManageRuleProposals 
                    ? t('rulesPanel.pendingProposalsDescRep')
                    : t('rulesPanel.pendingProposalsDescMember')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {draftProposals.map(proposal => {
                  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
                  return (
                    <div
                      key={proposal.id}
                      className={cn(RADIUS.panel, "flex items-center justify-between p-4 border border-[var(--status-pending-border)]", COLORS.statusBg.warning)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.title}</h4>
                          <Badge variant="secondary" className={COLORS.statusBadge.warning}>
                            {t('rulesPanel.pendingApproval')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{ruleInfo.label}</p>
                        <p className="text-sm text-muted-foreground">{proposal.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{t('rulesPanel.proposedBy', { name: proposal.createdBy.name })}</span>
                          <span>• {formatDate(proposal.createdAt || new Date().toISOString())}</span>
                        </div>
                      </div>
                      {canManageRuleProposals && (
                        <div className="flex gap-2">
                          {canStartDocumentVoting && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={startingVotingProposalId === proposal.id || proposal.status !== 'draft'}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartVoting(proposal.id);
                              }}
                            >
                              {startingVotingProposalId === proposal.id ? (
                                <>
                                  <div className={cn("animate-spin h-4 w-4 border-b-2 border-current mr-1", RADIUS.pill)} />
                                  {t('rulesPanel.starting')}
                                </>
                              ) : (
                                <>
                                  <Icon name="Vote" className="h-4 w-4 mr-1" />
                                  {t('rulesPanel.startVoting')}
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={startingVotingProposalId === proposal.id || proposal.status !== 'draft'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeclineProposalDialog(proposal);
                            }}
                          >
                            <Icon name="XCircle" className="h-4 w-4 mr-1" />
                            {t('rulesPanel.decline')}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* My Proposals */}
          {currentUser && myProposals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Settings" className="h-5 w-5" />
                  {t('rulesPanel.myProposals', { count: myProposals.length })}
                </CardTitle>
                <CardDescription>
                  {t('rulesPanel.myProposalsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {myProposals.map(proposal => {
                  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
                  const isDraft = proposal.status === 'draft';
                  const isActive = proposal.status === 'active';
                  const isApproved = proposal.status === 'approved';
                  const isRejected = proposal.status === 'rejected';
                  
                  return (
                    <div
                      key={proposal.id}
                      className={cn("flex items-center justify-between p-4 border", RADIUS.panel)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.title}</h4>
                          {isDraft && <Badge variant="secondary" className={COLORS.statusBadge.warning}>{t('proposalStatusBadge.draft.label')}</Badge>}
                          {isActive && <Badge variant="secondary" className={COLORS.statusBadge.warning}>{t('votingActive')}</Badge>}
                          {isApproved && <Badge variant="secondary" className={COLORS.statusBadge.success}>{t('approved')}</Badge>}
                          {isRejected && <Badge variant="secondary" className={COLORS.statusBadge.error}>{t('proposalStatusBadge.rejected.label')}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{ruleInfo.label}</p>
                        <p className="text-sm text-muted-foreground">{proposal.description}</p>
                        {isDraft && (
                          <p className={cn('text-xs mt-2 inline-flex items-center gap-1', COLORS.status.info)}>
                            <Icon name="Hourglass" className="h-3.5 w-3.5 shrink-0" />
                            {t('rulesPanel.awaitingApproval')}
                          </p>
                        )}
                        {isActive && proposal.votingDeadline && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t('rulesPanel.votingEnds', { date: formatDate(proposal.votingDeadline) })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={withdrawingProposalId === proposal.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWithdrawRuleProposal(proposal.id);
                            }}
                          >
                            <Icon name="Undo2" className="h-4 w-4 mr-1" />
                            {withdrawingProposalId === proposal.id ? t('rulesPanel.withdrawing') : t('rulesPanel.withdraw')}
                          </Button>
                        )}
                        {isActive && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposalId(proposal.id);
                              setShowRuleVotingInterface(true);
                            }}
                          >
                            <Icon name="Vote" className="h-4 w-4 mr-1" />
                            {t('rulesPanel.viewVote')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {activeProposals.length === 0 && draftProposals.length === 0 && (!currentUser || myProposals.length === 0) && (
            <Alert>
              <Icon name="Settings" className="h-4 w-4" />
              <AlertDescription>
                {t('rulesPanel.emptyProposals')}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>

      {/* Rule Proposal Dialog */}
      {showRuleProposalDialog && (
        <RuleProposalDialog
          organization={organization}
          currentUser={currentUser}
          open={showRuleProposalDialog}
          onOpenChange={setShowRuleProposalDialog}
          onSuccess={handleProposalSuccess}
          initialRuleField={selectedRuleField}
          governanceRules={governanceRules}
        />
      )}

      {/* Decline Rule Proposal Dialog */}
      {declineProposalDialog && (
        <RepresentativeRejectDialog
          open={!!declineProposalDialog}
          onOpenChange={(open) => !open && setDeclineProposalDialog(null)}
          title={t('declineRuleProposal')}
          description={t('declineRuleProposalDescription')}
          itemName={declineProposalDialog.title}
          onConfirm={(reason) => handleDeclineRuleProposal(declineProposalDialog.id, reason)}
        />
      )}
    </div>
  );
}
