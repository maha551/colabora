import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription } from '../../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Separator } from '../../ui/separator';
import { TrendingUp, Vote, CheckSquare, Users, Shield, Eye, Activity, Clock, BarChart3, FileText, Settings, Crown } from 'lucide-react';
import { Organization, VotingAnalytics, RepresentativeElection } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { governanceApi } from '../../../lib/api';
import { toast } from 'sonner';

interface TransparencyTabProps {
  organization: Organization;
  currentUser: any;
  permissions: OrganizationPermissions;
  analytics: VotingAnalytics | null;
  elections: RepresentativeElection[];
  loading: boolean;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  created_at: string;
  performed_by_name: string;
  affected_user_name?: string;
  details?: any;
}

export function TransparencyTab({
  organization,
  currentUser,
  permissions,
  analytics,
  elections,
  loading,
}: TransparencyTabProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recent');

  useEffect(() => {
    loadAuditLogs();
  }, [organization.id]);

  const loadAuditLogs = async () => {
    try {
      setHistoryLoading(true);
      const response = await governanceApi.auditLogsApi.getPublicAuditLogs(organization.id, {
        limit: 50
      });
      const normalizedLogs = (response.logs || []).map((log: any) => ({
        id: log.id,
        action_type: log.actionType || log.action_type || '',
        created_at: log.createdAt || log.created_at || new Date().toISOString(),
        performed_by_name: log.performedByName || log.performed_by_name || '',
        affected_user_name: log.affectedUserName || log.affected_user_name,
        details: log.details
      }));
      setAuditLogs(normalizedLogs);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      toast.error('Failed to load governance history');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!permissions.canViewAnalytics) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
        <p className="text-gray-600">
          You don't have permission to view transparency data for this organization.
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
      const date = new Date(log.created_at).toLocaleDateString();
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
        return <Activity className="h-4 w-4 text-blue-600" />;
      case 'rep_added':
      case 'rep_removed':
        return <Crown className="h-4 w-4 text-purple-600" />;
      case 'member_invited':
      case 'member_joined':
      case 'member_left':
      case 'member_bulk_added':
        return <Users className="h-4 w-4 text-green-600" />;
      case 'vote_proposed':
      case 'vote_approved':
      case 'vote_started':
      case 'vote_completed':
        return <Vote className="h-4 w-4 text-orange-600" />;
      case 'doc_created':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'rule_proposal_created':
      case 'rule_proposal_approved':
      case 'rule_proposal_rejected':
        return <Settings className="h-4 w-4 text-indigo-600" />;
      case 'election_created':
      case 'election_started':
      case 'election_completed':
        return <Vote className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
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

  if (loading) {
    return <LoadingSkeleton type="analytics" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Transparency</h2>
        <p className="text-gray-600">Organization metrics, history, and governance transparency</p>
      </div>

      {/* Key Metrics - Unified Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Participation Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {participationRate !== null ? `${participationRate}%` : '--'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Elections</p>
                <p className="text-2xl font-bold text-blue-600">
                  {analytics?.totalElections ?? elections.length}
                </p>
              </div>
              <Vote className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Governance Votes</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analytics?.totalDecisions ?? 0}
                </p>
              </div>
              <CheckSquare className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Active Members</p>
                <p className="text-2xl font-bold text-orange-600">
                  {activeMembers.length}
                </p>
              </div>
              <Users className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Actions</p>
                <p className="text-2xl font-bold text-blue-600">
                  {governanceStats.totalActions}
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Recent Activity (7d)</p>
                <p className="text-2xl font-bold text-green-600">
                  {governanceStats.recentActivity}
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Members Added</p>
                <p className="text-2xl font-bold text-orange-600">
                  {governanceStats.membersAdded}
                </p>
              </div>
              <Users className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Rule Changes</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {governanceStats.ruleChanges}
                </p>
              </div>
              <Settings className="h-8 w-8 text-indigo-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Governance History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Governance History
          </CardTitle>
          <CardDescription>
            Public record of all organizational decisions and actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="recent">Recent Activity</TabsTrigger>
                <TabsTrigger value="all">All History</TabsTrigger>
              </TabsList>

              <TabsContent value="recent" className="mt-4">
                {recentLogs.length > 0 ? (
                  <div className="relative">
                    <div className="space-y-2 lg:space-y-2 max-h-[600px] lg:max-h-[600px] overflow-y-auto pr-2 lg:pr-2">
                      {recentLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 lg:gap-2 p-2 lg:p-2 border rounded-lg">
                          <div className="mt-0.5">
                            {getActionIcon(log.action_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name)}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {new Date(log.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Scroll indicator gradient */}
                    <div className="hidden lg:block pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent" />
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No recent governance activity</p>
                    <p className="text-sm">Check back later for updates</p>
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
                              <h4 className="font-medium text-gray-900 text-sm lg:text-sm">{date}</h4>
                              <Badge variant="outline" className="text-xs">
                                {logs.length} action{logs.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="space-y-2 lg:space-y-1.5 ml-4 border-l-2 border-gray-200 pl-3 lg:pl-3">
                              {logs.map((log) => (
                                <div key={log.id} className="flex items-start gap-2 lg:gap-2">
                                  <div className="mt-0.5">
                                    {getActionIcon(log.action_type)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm">
                                      {getActionDescription(log.action_type, log.performed_by_name, log.affected_user_name)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {new Date(log.created_at).toLocaleTimeString()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Separator className="mt-3 lg:mt-2" />
                          </div>
                        ))}
                    </div>
                    {/* Scroll indicator gradient */}
                    <div className="hidden lg:block pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent" />
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No governance history yet</p>
                    <p className="text-sm">Actions will appear here as the organization makes decisions</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Transparency Notice */}
      <Alert>
        <Eye className="h-4 w-4" />
        <AlertDescription>
          <strong>Transparency Notice:</strong> This public governance dashboard shows all organizational
          decisions and actions. Some sensitive details are hidden to protect privacy, but all major
          governance activities are visible to ensure accountability.
        </AlertDescription>
      </Alert>
    </div>
  );
}
