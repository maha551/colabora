import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import { Users, Vote, Clock } from 'lucide-react';
import { Organization, RepresentativeElection, OrganizationGovernanceRules } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';

interface DashboardTabProps {
  organization: Organization;
  permissions: OrganizationPermissions;
  elections: RepresentativeElection[];
  governanceRules: OrganizationGovernanceRules | null;
  onCreateElection: () => void;
}

export function DashboardTab({
  organization,
  permissions,
  elections,
  governanceRules,
  onCreateElection
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      {/* Current Representatives Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Representatives
          </CardTitle>
          <CardDescription>
            Elected representatives who govern this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex -space-x-2 mb-4">
            {organization.representatives?.map((repId, index) => (
              <Avatar key={repId} className="h-12 w-12 border-2 border-white">
                <AvatarFallback className="text-sm">
                  R{index + 1}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Representatives:</span>
              <span className="font-medium ml-2">{organization.representatives?.length || 0}</span>
            </div>
            <div>
              <span className="text-gray-600">Next Election:</span>
              <span className="font-medium ml-2">Dec 2024</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Election Due Warning */}
      {permissions.isRepresentative && governanceRules && (() => {
        // Simple check: if no recent elections, suggest creating one
        const recentElections = elections.filter(e =>
          new Date(e.createdAt || '').getTime() > Date.now() - (governanceRules.representativeTermMonths * 30 * 24 * 60 * 60 * 1000)
        );
        const needsElection = recentElections.length === 0;

        return needsElection && (
          <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <Clock className="h-5 w-5" />
                Election Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-orange-800 mb-4">
                It's time to hold a representative election. The last election was more than {governanceRules.representativeTermMonths} months ago.
              </p>
              {permissions.canCreateElections && (
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={onCreateElection}
                >
                  <Vote className="h-4 w-4 mr-2" />
                  Create Election
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Active Elections Overlay */}
      {elections.some(e => e.status === 'active') && (
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <Vote className="h-5 w-5" />
              Representative Election Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const activeElection = elections.find(e => e.status === 'active');
              if (!activeElection) return null;

              return (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">{activeElection.electionTitle}</h3>
                    <p className="text-sm text-gray-600">{activeElection.electionDescription}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold">{activeElection.positionsAvailable}</div>
                      <div className="text-gray-600">Positions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {activeElection.votesCast || 0}/{activeElection.totalVoters || 0}
                      </div>
                      <div className="text-gray-600">Votes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {activeElection.totalVoters ? Math.round(((activeElection.votesCast || 0) / activeElection.totalVoters) * 100) : 0}%
                      </div>
                      <div className="text-gray-600">Participation</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {permissions.canVoteInElections && (
                      <Button size="sm" variant="outline">
                        <Vote className="h-4 w-4 mr-2" />
                        Cast Vote
                      </Button>
                    )}
                    <Badge variant="secondary">
                      Ends: {activeElection.endDate ? new Date(activeElection.endDate).toLocaleDateString() : 'TBD'}
                    </Badge>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks for managing your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {permissions.canCreateDocuments && (
              <Button variant="outline" className="justify-start gap-2">
                <Vote className="h-4 w-4" />
                Create Policy Vote
              </Button>
            )}

            {permissions.canInviteMembers && (
              <Button variant="outline" className="justify-start gap-2">
                <Users className="h-4 w-4" />
                Invite Members
              </Button>
            )}

            {permissions.canProposeRules && (
              <Button variant="outline" className="justify-start gap-2">
                <Vote className="h-4 w-4" />
                Propose Rule Change
              </Button>
            )}

            {permissions.canViewAnalytics && (
              <Button variant="outline" className="justify-start gap-2">
                <Clock className="h-4 w-4" />
                View Analytics
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
