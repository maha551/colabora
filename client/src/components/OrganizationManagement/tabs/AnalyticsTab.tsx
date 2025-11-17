import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { TrendingUp, Vote, CheckSquare, Users, BarChart3, Shield } from 'lucide-react';
import { Organization, VotingAnalytics, RepresentativeElection } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { LoadingSkeleton } from '../LoadingSkeleton';

interface AnalyticsTabProps {
  organization: Organization;
  permissions: OrganizationPermissions;
  analytics: VotingAnalytics | null;
  elections: RepresentativeElection[];
  loading: boolean;
}

export function AnalyticsTab({
  organization,
  permissions,
  analytics,
  elections,
  loading,
}: AnalyticsTabProps) {
  if (!permissions.canViewAnalytics) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
        <p className="text-gray-600">
          You don't have permission to view analytics for this organization.
        </p>
      </div>
    );
  }

  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];

  if (loading) {
    return <LoadingSkeleton type="analytics" />;
  }

  return (
    <div className="space-y-6">
      {/* Analytics Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Governance Analytics</h2>
          <p className="text-gray-600">Track participation, decisions, and organizational health</p>
        </div>
        {permissions.canExportData && (
          <Button variant="outline" size="sm">
            Export Data
          </Button>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Participation Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {analytics 
                    ? `${Math.round(analytics.totalMembers > 0 
                        ? (analytics.activeVoters / analytics.totalMembers) * 100 
                        : analytics.averageElectionTurnout || 0)}%` 
                    : '--'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Member voting participation across all elections
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Elections Held</p>
                <p className="text-2xl font-bold text-blue-600">
                  {analytics ? analytics.totalElections || 0 : elections.length}
                </p>
              </div>
              <Vote className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Representative elections completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Governance Votes</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analytics ? analytics.totalDecisions || 0 : '--'}
                </p>
              </div>
              <CheckSquare className="h-8 w-8 text-purple-600" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Governance decisions and rule changes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Members</p>
                <p className="text-2xl font-bold text-orange-600">
                  {activeMembers.length}
                </p>
              </div>
              <Users className="h-8 w-8 text-orange-600" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Currently active organization members
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Participation Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Participation Trends</CardTitle>
          <CardDescription>Member voting participation over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Participation chart will be implemented here</p>
              <p className="text-sm text-gray-500">Showing voting activity trends</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Governance Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Governance Activity</CardTitle>
          <CardDescription>Latest governance decisions and elections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Sample activity items - replace with real data */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
              <Vote className="h-4 w-4 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Representative Election Completed</p>
                <p className="text-xs text-gray-600">3 new representatives elected • 2 days ago</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
              <Shield className="h-4 w-4 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Governance Rule Updated</p>
                <p className="text-xs text-gray-600">Anonymous voting enabled • 1 week ago</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
              <CheckSquare className="h-4 w-4 text-purple-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Policy Vote Passed</p>
                <p className="text-xs text-gray-600">85% approval on new budget policy • 2 weeks ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
