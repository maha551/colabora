import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Separator } from '../ui/separator';
import { Icon } from '../ui/Icon';
import { Organization, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface PublicGovernanceDashboardProps {
  organization: Organization;
  currentUser: User | null;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  created_at: string;
  performed_by_name: string;
  affected_user_name?: string;
  details?: Record<string, unknown>;
}

export function PublicGovernanceDashboard({ organization, currentUser }: PublicGovernanceDashboardProps) {
  const { t } = useTranslation('governance');
  const { t: tOrg } = useTranslation('organization');
  const { formatDate, formatDateTime, formatTime } = useTimezone();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recent');

  useEffect(() => {
    loadAuditLogs();
  }, [organization.id]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const response = await governanceApi.auditLogsApi.getPublicAuditLogs(organization.id, {
        limit: 50
      });
      // API returns logs array, normalize to our interface format
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
      setLoading(false);
    }
  };

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
      case 'election_created':
      case 'election_started':
      case 'election_completed':
        return <Icon name="Vote" className={`h-4 w-4 ${COLORS.status.error}`} />;
      default:
        return <Icon name="Activity" className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionDescription = (actionType: string, performedBy: string, affectedUser?: string) => {
    const actor = performedBy || 'Unknown';

    switch (actionType) {
      case 'org_created':
        return `${actor} created this organization`;
      case 'rep_added':
        return `${actor} added ${affectedUser || 'a representative'}`;
      case 'rep_removed':
        return `${actor} removed ${affectedUser || 'a representative'}`;
      case 'member_invited':
        return `${actor} invited ${affectedUser || 'members'}`;
      case 'member_joined':
        return `${affectedUser || 'A member'} joined the organization`;
      case 'member_left':
        return `${affectedUser || 'A member'} left the organization`;
      case 'member_bulk_added':
        return `${actor} bulk-added members`;
      case 'vote_proposed':
        return `${actor} proposed a new vote`;
      case 'vote_approved':
        return `${actor} approved a vote`;
      case 'vote_started':
        return `${actor} started a vote`;
      case 'vote_completed':
        return `${actor} completed a vote`;
      case 'doc_created':
        return `${actor} created an organizational document`;
      case 'rule_proposal_created':
        return `${actor} proposed a governance rule change`;
      case 'rule_proposal_approved':
        return `${actor} approved a governance rule change`;
      case 'rule_proposal_rejected':
        return `${actor} rejected a governance rule change`;
      case 'election_created':
        return `${actor} created a representative election`;
      case 'election_started':
        return `${actor} started a representative election`;
      case 'election_completed':
        return `${actor} completed a representative election`;
      default:
        return `${actor} performed ${actionType.replace('_', ' ')}`;
    }
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

  const getRecentActivity = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return auditLogs.filter(log => new Date(log.created_at) >= sevenDaysAgo);
  };

  const getGovernanceStats = () => {
    const stats = {
      totalActions: auditLogs.length,
      recentActivity: getRecentActivity().length,
      electionsHeld: auditLogs.filter(log => log.action_type === 'election_completed').length,
      membersAdded: auditLogs.filter(log => log.action_type && ['member_invited', 'member_joined', 'member_bulk_added'].includes(log.action_type)).length,
      ruleChanges: auditLogs.filter(log => log.action_type && log.action_type.includes('rule_proposal')).length
    };

    return stats;
  };

  const stats = getGovernanceStats();
  const recentLogs = getRecentActivity();
  const groupedLogs = groupLogsByDate(auditLogs);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className={cn("animate-spin h-8 w-8 border-b-2 border-[var(--status-active-solid)]", RADIUS.pill)}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Governance Transparency</h2>
          <p className="text-muted-foreground">Public record of all organizational decisions and actions</p>
        </div>
        <Badge variant="secondary" className="gap-2">
          <Icon name="Eye" className="h-4 w-4" />
          Public View
        </Badge>
      </div>

      {/* Key Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${COLORS.status.info}`}>{stats.totalActions}</div>
            <div className="text-sm text-muted-foreground">Total Actions</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${COLORS.status.success}`}>{stats.recentActivity}</div>
            <div className="text-sm text-muted-foreground">Recent Activity</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.electionsHeld}</div>
            <div className="text-sm text-muted-foreground">Elections Held</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${COLORS.status.active}`}>{stats.membersAdded}</div>
            <div className="text-sm text-muted-foreground">Members Added</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{stats.ruleChanges}</div>
            <div className="text-sm text-muted-foreground">Rule Changes</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="all">All History</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="Clock" className="h-5 w-5" />
                Recent Activity (Last 7 Days)
              </CardTitle>
              <CardDescription>
                Latest governance actions in {organization.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentLogs.length > 0 ? (
                <div className="space-y-6">
                  {recentLogs.map((log) => (
                    <div key={log.id} className={cn("flex items-start gap-3 p-3 border", RADIUS.panel)}>
                      <div className="mt-1">
                        {getActionIcon(log.action_type)}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(log.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon name="Clock" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No recent governance activity</p>
                  <p className="text-sm">Check back later for updates</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="BarChart3" className="h-5 w-5" />
                Complete Governance History
              </CardTitle>
              <CardDescription>
                Full chronological record of organizational governance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(groupedLogs).length > 0 ? (
                <div className="space-y-8">
                  {Object.entries(groupedLogs)
                    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                    .map(([date, logs]) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-foreground">{date}</h4>
                        <Badge variant="outline" className="text-xs">
                          {logs.length} action{logs.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="space-y-3 ml-4 border-l-2 border-border pl-4">
                        {logs.map((log) => (
                          <div key={log.id} className="flex items-start gap-3">
                            <div className="mt-1">
                              {getActionIcon(log.action_type)}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm">
                                {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name)}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatTime(log.created_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon name="FileText" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No governance history yet</p>
                  <p className="text-sm">Actions will appear here as the organization makes decisions</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transparency Notice */}
      <Alert>
        <Icon name="Eye" className="h-4 w-4" />
        <AlertDescription>
          <strong>{tOrg('transparencySection.transparencyNoticeTitle')}</strong>{' '}
          {tOrg('transparencySection.transparencyNoticeBody')}
        </AlertDescription>
      </Alert>
    </div>
  );
}
