import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Shield, Settings, Vote, BarChart3 } from 'lucide-react';
import { Organization, User, OrganizationGovernanceRules, RepresentativeElection } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { PublicGovernanceDashboard } from '../../governance/PublicGovernanceDashboard';
import { GovernanceRulesDialog } from '../../governance/GovernanceRulesDialog';
import { ElectionCreationDialog } from '../../governance/ElectionCreationDialog';

interface GovernanceTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];
  onRefreshGovernance: () => Promise<void>;
  onRefreshElections: () => Promise<void>;
  onCreateElection: (electionData: any) => Promise<void>;
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
}: GovernanceTabProps) {
  const [showGovernanceRulesDialog, setShowGovernanceRulesDialog] = useState(false);
  const [showElectionCreationDialog, setShowElectionCreationDialog] = useState(false);

  const handleGovernanceRulesSuccess = async () => {
    await onRefreshGovernance();
    setShowGovernanceRulesDialog(false);
  };

  const handleElectionCreationSuccess = async () => {
    await onRefreshElections();
    setShowElectionCreationDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Governance Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Governance Actions
            </span>
            <div className="flex gap-2">
              {permissions.canManageGovernanceRules && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGovernanceRulesDialog(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Rules
                </Button>
              )}
              {permissions.canCreateElections && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowElectionCreationDialog(true)}
                >
                  <Vote className="h-4 w-4 mr-2" />
                  Create Election
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            Manage governance rules and create elections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{elections.length}</div>
              <div className="text-sm text-gray-600">Total Elections</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {elections.filter(e => e.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-600">Completed Elections</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {elections.filter(e => e.status === 'active').length}
              </div>
              <div className="text-sm text-gray-600">Active Elections</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Public Governance Dashboard */}
      <PublicGovernanceDashboard
        organization={organization}
        currentUser={currentUser}
      />

      {/* Dialogs */}
      {showGovernanceRulesDialog && (
        <GovernanceRulesDialog
          organization={organization}
          governanceRules={governanceRules}
          onSuccess={handleGovernanceRulesSuccess}
          onCancel={() => setShowGovernanceRulesDialog(false)}
        />
      )}

      {showElectionCreationDialog && (
        <ElectionCreationDialog
          organization={organization}
          onSuccess={handleElectionCreationSuccess}
          onCancel={() => setShowElectionCreationDialog(false)}
        />
      )}
    </div>
  );
}
