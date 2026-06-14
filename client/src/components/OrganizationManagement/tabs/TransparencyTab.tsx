import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription } from '../../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { Organization, VotingAnalytics, RepresentativeElection, User, OrganizationVote } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { LoadingState } from '../../ui/LoadingState';
import { governanceApi, verificationApi } from '../../../lib/api';
import type { VerifyResult, VoteLogEntry, VerifiableContest, UserVoteReceipt } from '../../../lib/api';
import { VerificationResultCard } from '../../verification/VerificationResultCard';
import { VoteReceiptBadge } from '../../verification/VoteReceiptBadge';
import { listLocalReceipts } from '../../../lib/verification/voteReceipt';
import type { VoteReceiptPayload } from '../../../lib/verification/voteReceipt';
import { toast } from 'sonner';
import { logger } from '../../../lib/logger';
import { useTimezone } from '../../../hooks/useTimezone';
import { SPACING, COLORS, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';

interface TransparencyTabProps {
  organization: Organization;
  currentUser: User | null;
  permissions: OrganizationPermissions;
  analytics: VotingAnalytics | null;
  elections: RepresentativeElection[];
  isLoading: boolean;
  organizationVotes?: OrganizationVote[];
  organizationVotesLoading?: boolean;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  created_at: string;
  performed_by_name: string;
  affected_user_name?: string;
  details?: Record<string, unknown>;
}

export function TransparencyTab({
  organization,
  currentUser,
  permissions,
  analytics,
  elections,
  isLoading,
  organizationVotes = [],
  organizationVotesLoading = false,
}: TransparencyTabProps) {
  const { t } = useTranslation('organization');
  const { formatDate, formatDateTime, formatTime } = useTimezone();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recent');
  const [verifyingContestId, setVerifyingContestId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [contests, setContests] = useState<VerifiableContest[]>([]);
  const [contestsLoading, setContestsLoading] = useState(true);
  const [myReceipts, setMyReceipts] = useState<UserVoteReceipt[]>([]);
  const [myReceiptsLoading, setMyReceiptsLoading] = useState(true);
  const [logEntries, setLogEntries] = useState<VoteLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [exportingContestId, setExportingContestId] = useState<string | null>(null);

  const orgContestIds = useMemo(
    () => new Set(contests.map((c) => c.contestId)),
    [contests]
  );

  const mergedReceipts = useMemo((): VoteReceiptPayload[] => {
    const local = currentUser?.id
      ? listLocalReceipts(currentUser.id, organization.id)
      : [];
    const byKey = new Map<string, VoteReceiptPayload>();
    for (const r of myReceipts) {
      byKey.set(`${r.voteType}:${r.contestId}`, {
        receiptId: r.receiptId,
        contestId: r.contestId,
        voteType: r.voteType,
        voteRecordedAt: r.voteRecordedAt,
        organizationId: r.organizationId,
        contestTitle: r.contestTitle,
      });
    }
    for (const r of local) {
      const key = `${r.voteType}:${r.contestId}`;
      if (!byKey.has(key)) byKey.set(key, r);
    }
    return Array.from(byKey.values());
  }, [myReceipts, currentUser?.id, organization.id]);

  useEffect(() => {
    loadAuditLogs();
  }, [organization.id]);

  useEffect(() => {
    let cancelled = false;
    setContestsLoading(true);
    verificationApi.listContests(organization.id, { limit: 200 })
      .then(({ contests: items }) => {
        if (!cancelled) setContests(items || []);
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load verifiable contests', err);
          toast.error(t('transparencySection.contestsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setContestsLoading(false);
      });
    return () => { cancelled = true; };
  }, [organization.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      setMyReceipts([]);
      setMyReceiptsLoading(false);
      return;
    }
    let cancelled = false;
    setMyReceiptsLoading(true);
    verificationApi.listMyReceipts(organization.id, { limit: 100 })
      .then(({ receipts }) => {
        if (!cancelled) setMyReceipts(receipts || []);
      })
      .catch((err) => {
        if (!cancelled) logger.warn('Failed to load server receipts', err);
      })
      .finally(() => {
        if (!cancelled) setMyReceiptsLoading(false);
      });
    return () => { cancelled = true; };
  }, [organization.id, currentUser?.id]);

  useEffect(() => {
    if (orgContestIds.size === 0) {
      setLogEntries([]);
      return;
    }
    let cancelled = false;
    setLogLoading(true);
    verificationApi.getLogChain(organization.id, 200)
      .then(({ entries }) => {
        if (cancelled) return;
        const filtered = entries.filter(entry => orgContestIds.has(entry.contestId));
        setLogEntries(filtered);
      })
      .catch(err => {
        if (!cancelled) {
          logger.error('Failed to load vote log', err);
          toast.error(t('failedToLoadVoteEventLog'));
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgContestIds]);

  const handleVerify = async (voteType: string, contestId: string) => {
    const key = `${voteType}:${contestId}`;
    setVerifyingContestId(key);
    try {
      const result = await verificationApi.verify(voteType, contestId);
      setVerifyResults((prev) => ({ ...prev, [key]: result }));
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('transparencySection.verificationFailed');
      toast.error(message);
    } finally {
      setVerifyingContestId(null);
    }
  };

  const handleDownloadExport = async (voteType: string, contestId: string, title: string) => {
    const key = `${voteType}:${contestId}`;
    setExportingContestId(key);
    try {
      const data = await verificationApi.getBallots(voteType, contestId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ballot-export-${contestId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('transparencySection.exportFailed');
      toast.error(message);
    } finally {
      setExportingContestId(null);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setHistoryLoading(true);
      const response = await governanceApi.auditLogsApi.getPublicAuditLogs(organization.id, {
        limit: 50
      });
      const normalizedLogs = (response.logs || []).map((log: {
        id?: string;
        actionType?: string;
        action_type?: string;
        createdAt?: string;
        created_at?: string;
        performedByName?: string;
        performed_by_name?: string;
        affectedUserName?: string;
        affected_user_name?: string;
        details?: string;
      }) => ({
        id: log.id,
        action_type: log.actionType || log.action_type || '',
        created_at: log.createdAt || log.created_at || new Date().toISOString(),
        performed_by_name: log.performedByName || log.performed_by_name || '',
        affected_user_name: log.affectedUserName || log.affected_user_name,
        details: log.details
      }));
      setAuditLogs(normalizedLogs);
    } catch (error) {
      logger.error('Failed to load audit logs:', error);
      toast.error(t('failedToLoadGovernanceHistory'));
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!permissions.canViewAnalytics) {
    return (
      <div className="text-center py-12">
        <Icon name="Shield" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('accessRestricted')}</h3>
        <p className="text-muted-foreground">
          {t('accessRestrictedDescription')}
        </p>
      </div>
    );
  }

  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
  const completedElections = elections.filter(e => e.status === 'completed');
  const participationRate = analytics && analytics.totalMembers > 0
    ? Math.round((analytics.activeVoters / analytics.totalMembers) * 100)
    : analytics?.averageElectionTurnout
      ? Math.round(analytics.averageElectionTurnout * 100)
      : null;

  // Governance stats from audit logs
  const getRecentActivity = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return auditLogs.filter(log => new Date(log.created_at) >= sevenDaysAgo);
  };

  const recentLogs = getRecentActivity();
  const governanceStats = {
    totalActions: auditLogs.length,
    recentActivity: recentLogs.length,
    electionsHeld: auditLogs.filter(log => log.action_type === 'election_completed').length,
    membersAdded: auditLogs.filter(log => log.action_type && ['member_invited', 'member_joined', 'member_bulk_added'].includes(log.action_type)).length,
    ruleChanges: auditLogs.filter(log => log.action_type && log.action_type.includes('rule_proposal')).length
  };

  const groupLogsByDate = (logs: AuditLogEntry[]) => {
    const groups: { [key: string]: AuditLogEntry[] } = {};
    logs.forEach(log => {
      const date = formatDate(log.created_at);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(log);
    });
    return groups;
  };

  const groupedLogs = groupLogsByDate(auditLogs);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'org_created':
        return <Icon name="Activity" className={`h-4 w-4 ${COLORS.status.info}`} />;
      case 'rep_added':
      case 'rep_removed':
        return <Icon name="Crown" className="h-4 w-4 text-[var(--badge-purple-text)]" />;
      case 'member_invited':
      case 'member_joined':
      case 'member_left':
      case 'member_bulk_added':
        return <Icon name="Users" className={`h-4 w-4 ${COLORS.status.success}`} />;
      case 'vote_proposed':
      case 'vote_approved':
      case 'vote_started':
      case 'vote_completed':
        return <Icon name="Vote" className={`h-4 w-4 ${COLORS.status.active}`} />;
      case 'doc_created':
        return <Icon name="FileText" className={`h-4 w-4 ${COLORS.status.info}`} />;
      case 'rule_proposal_created':
      case 'rule_proposal_approved':
      case 'rule_proposal_rejected':
        return <Icon name="Settings" className="h-4 w-4 text-indigo-600" />;
      case 'structure_proposal_approved':
      case 'structure_proposal_rejected':
        return <Icon name="FileText" className="h-4 w-4 text-indigo-600" />;
      case 'tree_proposal_approved':
      case 'tree_proposal_rejected':
      case 'tree_proposal_applied':
        return <Icon name="FolderTree" className={`h-4 w-4 ${COLORS.status.warning}`} />;
      case 'document_status_agreed':
      case 'document_status_rejected':
        return <Icon name="CheckSquare" className={`h-4 w-4 ${COLORS.status.success}`} />;
      case 'election_created':
      case 'election_started':
      case 'election_completed':
        return <Icon name="Vote" className={`h-4 w-4 ${COLORS.status.error}`} />;
      default:
        return <Icon name="Activity" className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionDescription = (actionType: string, performedBy: string, affectedUser?: string, details?: Record<string, unknown>) => {
    const actor = performedBy || t('transparencySection.unknownActor');
    const proposalTitle = details?.proposalTitle as string | undefined;
    const documentTitle = details?.documentTitle as string | undefined;
    const reason = details?.reason as string | undefined;
    const reasonSuffix = reason ? ` (${reason})` : '';
    switch (actionType) {
      case 'org_created':
        return t('auditAction.org_created', { actor });
      case 'rep_added':
        return t('auditAction.rep_added', { actor, user: affectedUser || t('transparencySection.aRepresentative') });
      case 'rep_removed':
        return t('auditAction.rep_removed', { actor, user: affectedUser || t('transparencySection.aRepresentative') });
      case 'member_invited':
        return t('auditAction.member_invited', { actor, user: affectedUser || t('transparencySection.membersFallback') });
      case 'member_joined':
        return t('auditAction.member_joined', { user: affectedUser || t('transparencySection.aMember') });
      case 'member_left':
        return t('auditAction.member_left', { user: affectedUser || t('transparencySection.aMember') });
      case 'member_bulk_added':
        return t('auditAction.member_bulk_added', { actor });
      case 'vote_proposed':
        return t('auditAction.vote_proposed', { actor });
      case 'vote_approved':
        return t('auditAction.vote_approved', { actor });
      case 'vote_started':
        return t('auditAction.vote_started', { actor });
      case 'vote_completed':
        return t('auditAction.vote_completed', { actor });
      case 'doc_created':
        return t('auditAction.doc_created', { actor });
      case 'rule_proposal_created':
        return t('auditAction.rule_proposal_created', { actor });
      case 'rule_proposal_approved':
        return t('auditAction.rule_proposal_approved', { actor });
      case 'rule_proposal_rejected':
        return t('auditAction.rule_proposal_rejected', { actor });
      case 'structure_proposal_approved':
        return proposalTitle
          ? t('auditAction.structure_proposal_approved', { actor, title: proposalTitle })
          : t('auditAction.structure_proposal_approved_no_title', { actor });
      case 'structure_proposal_rejected':
        return proposalTitle
          ? t('auditAction.structure_proposal_rejected', { actor, title: proposalTitle })
          : t('auditAction.structure_proposal_rejected_no_title', { actor });
      case 'tree_proposal_approved':
        return documentTitle
          ? t('auditAction.tree_proposal_approved', { actor, title: documentTitle })
          : t('auditAction.tree_proposal_approved_no_title', { actor });
      case 'tree_proposal_applied':
        return documentTitle
          ? t('auditAction.tree_proposal_applied', { actor, title: documentTitle })
          : t('auditAction.tree_proposal_applied_no_title', { actor });
      case 'tree_proposal_rejected':
        return documentTitle
          ? t('auditAction.tree_proposal_rejected', { actor, title: documentTitle })
          : t('auditAction.tree_proposal_rejected_no_title', { actor });
      case 'document_status_agreed':
        return documentTitle
          ? t('auditAction.document_status_agreed', { actor, title: documentTitle })
          : t('auditAction.document_status_agreed_no_title', { actor });
      case 'document_status_rejected':
        return documentTitle
          ? t('auditAction.document_status_rejected', { actor, title: documentTitle, reason: reasonSuffix })
          : t('auditAction.document_status_rejected_no_title', { actor, reason: reasonSuffix });
      case 'election_created':
        return t('auditAction.election_created', { actor });
      case 'election_started':
        return t('auditAction.election_started', { actor });
      case 'election_completed':
        return t('auditAction.election_completed', { actor });
      default:
        return t('auditAction.default', { actor, action: actionType.replace(/_/g, ' ') });
    }
  };

  const getVoteTypeLabel = (voteType: string) => {
    const key = `transparencySection.voteType_${voteType}` as const;
    const translated = t(key);
    return translated !== key ? translated : voteType;
  };

  if (isLoading) {
    return (
      <LoadingState isLoading={true} mode="skeleton" skeletonVariant="card" skeletonCount={4} className={SPACING.section.gap}>
        <div />
      </LoadingState>
    );
  }

  return (
    <TabPanelBody>
      <TabPanelHeader title={t('transparency')} subtitle={t('transparencySubtitle')} />

      {/* Key Metrics - responsive grid: 1 col mobile, 2 sm, 3 md, 4 lg, 5 xl */}
      <div className={`grid ${SPACING.content.inline} sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`}>
        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.participationRate')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.success}`}>
                  {participationRate !== null ? `${participationRate}%` : '--'}
                </p>
              </div>
              <Icon name="TrendingUp" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.success}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.elections')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.info}`}>
                  {analytics?.electionsHeld ?? elections.length}
                </p>
              </div>
              <Icon name="Vote" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.info}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.governanceVotes')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.info}`}>
                  {analytics?.totalDecisionsMade ?? 0}
                </p>
              </div>
              <Icon name="CheckSquare" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-[var(--badge-purple-text)]" aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.activeMembers')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.active}`}>
                  {activeMembers.length}
                </p>
              </div>
              <Icon name="Users" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.active}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.totalActions')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.info}`}>
                  {governanceStats.totalActions}
                </p>
              </div>
              <Icon name="Activity" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.info}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.recentActivity7d')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.success}`}>
                  {governanceStats.recentActivity}
                </p>
              </div>
              <Icon name="Clock" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.success}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.membersAdded')}</p>
                <p className={`text-xl sm:text-2xl font-bold ${COLORS.status.active}`}>
                  {governanceStats.membersAdded}
                </p>
              </div>
              <Icon name="Users" className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 ${COLORS.status.active}`} aria-hidden />
            </div>
          </CardContent>
        </Card>

        <Card className={SPACING.card.base}>
          <CardContent className={`${SPACING.card.padding} pt-6`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm ${COLORS.text.secondary} mb-1`}>{t('stats.ruleChanges')}</p>
                <p className={`text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400`}>
                  {governanceStats.ruleChanges}
                </p>
              </div>
              <Icon name="Settings" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verify vote results */}
      <Card className={SPACING.card.base}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="CheckCircle" className="h-5 w-5" />
            {t('transparencySection.verifyVoteResultsTitle')}
          </CardTitle>
          <CardDescription className={COLORS.text.secondary}>
            {t('transparencySection.verifyVoteResultsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className={SPACING.card.padding}>
          {contestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon name="Loader2" className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : contests.length === 0 ? (
            <div className={`text-center py-8 ${COLORS.text.secondary}`}>
              <Icon name="Vote" className="h-12 w-12 mx-auto mb-3 opacity-50" aria-hidden />
              <p>{t('transparencySection.noClosedVotesToVerify')}</p>
            </div>
          ) : (
            <div className={SPACING.content.gap}>
              {contests.map((c) => {
                const key = `${c.voteType}:${c.contestId}`;
                const result = verifyResults[key];
                return (
                  <div key={key} className={cn(RADIUS.panel, 'flex flex-col gap-2 p-3 border', COLORS.border.standard)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate" title={c.title}>{c.title}</p>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {getVoteTypeLabel(c.voteType)}
                          </Badge>
                        </div>
                        <p className={`text-sm ${COLORS.text.secondary}`}>
                          {c.statusLabel && `${c.statusLabel} · `}
                          {c.closedAt ? formatDate(c.closedAt) : '—'}
                        </p>
                      </div>
                      <div className={`flex items-center gap-2 shrink-0 ${SPACING.tight.inline}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={verifyingContestId !== null || exportingContestId !== null}
                          onClick={() => handleVerify(c.voteType, c.contestId)}
                          aria-label={t('transparencySection.verifyTallyAria', { title: c.title })}
                        >
                          {verifyingContestId === key ? (
                            <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                          ) : (
                            t('transparencySection.verify')
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={exportingContestId !== null || verifyingContestId !== null}
                          onClick={() => handleDownloadExport(c.voteType, c.contestId, c.title)}
                          aria-label={t('transparencySection.downloadBallotExportAria', { title: c.title })}
                        >
                          {exportingContestId === key ? (
                            <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                          ) : (
                            t('transparencySection.export')
                          )}
                        </Button>
                      </div>
                    </div>
                    {result && <VerificationResultCard result={result} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My receipts */}
      <Card className={SPACING.card.base}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="FileText" className="h-5 w-5" />
            {t('transparencySection.myReceiptsTitle')}
          </CardTitle>
          <CardDescription className={COLORS.text.secondary}>
            {t('transparencySection.myReceiptsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className={SPACING.card.padding}>
          {myReceiptsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Icon name="Loader2" className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mergedReceipts.length === 0 ? (
            <p className={`text-sm ${COLORS.text.secondary}`}>{t('transparencySection.noReceiptsYet')}</p>
          ) : (
            <div className={SPACING.content.gap}>
              {mergedReceipts.map((r) => (
                <div key={`${r.voteType}:${r.contestId}`}>
                  <p className="text-sm font-medium mb-1">
                    {r.contestTitle || getVoteTypeLabel(r.voteType)}
                  </p>
                  <VoteReceiptBadge receipt={r} compact />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vote event log */}
      <Card className={SPACING.card.base}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="ListOrdered" className="h-5 w-5" />
            {t('voteEventLog')}
          </CardTitle>
          <CardDescription className={COLORS.text.secondary}>
            {t('transparencySection.voteEventLogDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className={SPACING.card.padding}>
          {logLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon name="Loader2" className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logEntries.length === 0 ? (
            <div className={`text-center py-8 ${COLORS.text.secondary}`}>
              <Icon name="ListOrdered" className="h-12 w-12 mx-auto mb-3 opacity-50" aria-hidden />
              <p>{t('transparencySection.noVoteEventsInLog')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto -mx-1 px-1 min-w-0">
              <table className="w-full min-w-[480px] text-sm" role="table" aria-label={t('voteEventLog')}>
                <thead>
                  <tr className={`border-b ${COLORS.border.standard}`}>
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">{t('transparencySection.columnTime')}</th>
                    <th className="text-left py-2 font-medium">{t('transparencySection.columnType')}</th>
                    <th className="text-left py-2 font-medium">{t('transparencySection.columnContest')}</th>
                    <th className="text-left py-2 font-medium">{t('transparencySection.columnChoice')}</th>
                    <th className="text-left py-2 font-medium">{t('transparencySection.columnPrevHash')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logEntries.map((entry, i) => (
                    <tr key={`${entry.logSequenceId}-${i}`} className={`border-b ${COLORS.border.muted}`}>
                      <td className="py-1.5">{entry.logSequenceId}</td>
                      <td className={`py-1.5 ${COLORS.text.secondary}`}>{formatDateTime(entry.timestamp)}</td>
                      <td className="py-1.5">{getVoteTypeLabel(entry.voteType)}</td>
                      <td className="py-1.5 font-mono text-xs truncate max-w-[120px]" title={entry.contestId}>{entry.contestId}</td>
                      <td className="py-1.5">{entry.choice}</td>
                      <td className="py-1.5 font-mono text-xs truncate max-w-[80px]" title={entry.previousEntryHash}>{entry.previousEntryHash ? `${entry.previousEntryHash.slice(0, 8)}…` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Governance History */}
      <Card className={SPACING.card.base}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Eye" className="h-5 w-5" />
            {t('transparencySection.governanceHistoryTitle')}
          </CardTitle>
          <CardDescription className={COLORS.text.secondary}>
            {t('transparencySection.governanceHistoryDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className={SPACING.card.padding}>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className={cn("animate-spin h-8 w-8 border-b-2 border-[var(--status-active-solid)]", RADIUS.pill)}></div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="recent">{t('transparencySection.recentActivityTab')}</TabsTrigger>
                <TabsTrigger value="all">{t('transparencySection.allHistoryTab')}</TabsTrigger>
              </TabsList>

              <TabsContent value="recent" className="mt-4">
                {recentLogs.length > 0 ? (
                  <div className="relative">
                    <div className="space-y-2 lg:space-y-2 max-h-[600px] lg:max-h-[600px] overflow-y-auto pr-2 lg:pr-2">
                      {recentLogs.map((log) => (
                        <div key={log.id} className={cn("flex items-start gap-2 lg:gap-2 p-2 lg:p-2 border", RADIUS.panel)}>
                          <div className="mt-0.5">
                            {getActionIcon(log.action_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name, log.details as Record<string, unknown>)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatDateTime(log.created_at)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Scroll indicator gradient - theme aware */}
                    <div className="hidden lg:block pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-background to-transparent" />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon name="Clock" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('transparencySection.noRecentGovernanceActivity')}</p>
                    <p className="text-sm">{t('checkBackLater')}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                {Object.keys(groupedLogs).length > 0 ? (
                  <div className="relative">
                    <div className="space-y-4 lg:space-y-3 max-h-[600px] lg:max-h-[600px] overflow-y-auto pr-2 lg:pr-2">
                      {Object.entries(groupedLogs)
                        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                        .map(([date, logs]) => (
                          <div key={date}>
                            <div className="flex items-center gap-2 mb-2 lg:mb-2">
                              <h4 className="font-medium text-foreground text-sm lg:text-sm">{date}</h4>
                              <Badge variant="outline" className="text-xs">
                                {t('transparencySection.actionCount', { count: logs.length })}
                              </Badge>
                            </div>
                            <div className="space-y-2 lg:space-y-1.5 ml-4 border-l-2 border-border pl-3 lg:pl-3">
                              {logs.map((log) => (
                                <div key={log.id} className="flex items-start gap-2 lg:gap-2">
                                  <div className="mt-0.5">
                                    {getActionIcon(log.action_type)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm">
                                      {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name, log.details as Record<string, unknown>)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {formatTime(log.created_at)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Separator className="mt-3 lg:mt-2" />
                          </div>
                        ))}
                    </div>
                    {/* Scroll indicator gradient - theme aware */}
                    <div className="hidden lg:block pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-background to-transparent" />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon name="FileText" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('transparencySection.noGovernanceHistoryYet')}</p>
                    <p className="text-sm">{t('transparencySection.governanceHistoryEmptyDescription')}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Transparency Notice */}
      <Alert>
        <Icon name="Eye" className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('transparencySection.transparencyNoticeTitle')}</strong> {t('transparencySection.transparencyNoticeBody')}
        </AlertDescription>
      </Alert>
    </TabPanelBody>
  );
}
