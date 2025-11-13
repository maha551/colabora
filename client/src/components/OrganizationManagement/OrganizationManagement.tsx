import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Users, Vote, FileText, Settings, BarChart3 } from 'lucide-react';

import { Organization, User } from '../../types';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { useOrganizationData } from '../../hooks/useOrganizationData';

import { DashboardTab } from './tabs/DashboardTab';
import { GovernanceTab } from './tabs/GovernanceTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MembersTab } from './tabs/MembersTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
  onCreateOrganizationalDocument?: (organizationId: string) => void;
}

export function OrganizationManagement({
  organization,
  currentUser,
  onBack,
  onCreateOrganizationalDocument
}: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Use our custom hooks for data and permissions
  const permissions = useOrganizationPermissions(currentUser, organization);
  const { data, actions } = useOrganizationData(organization.id, activeTab);

  // Calculate derived data
  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
  const legacyMembers = organization.members?.filter(m => m.status === 'legacy') || [];

  const handleUpdate = () => {
    // Refresh all data
    actions.refreshAll();
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* User Role Badges */}
      <div className="flex justify-end gap-2 mb-6">
        {permissions.isRepresentative && (
          <Badge variant="default" className="bg-purple-100 text-purple-800">
            Representative
          </Badge>
        )}
        {permissions.isActiveMember && (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Active Member
          </Badge>
        )}
      </div>

      {/* Organization Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{activeMembers.length}</div>
            <div className="text-sm text-gray-600">Active Members</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{organization.representatives?.length || 0}</div>
            <div className="text-sm text-gray-600">Representatives</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{legacyMembers.length}</div>
            <div className="text-sm text-gray-600">Legacy Members</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{Math.round(organization.votingThreshold * 100)}%</div>
            <div className="text-sm text-gray-600">Vote Threshold</div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 h-auto">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <Vote className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab
            organization={organization}
            permissions={permissions}
            elections={data.elections}
            governanceRules={data.governanceRules}
            onCreateElection={() => {/* TODO: Implement */}}
          />
        </TabsContent>

        <TabsContent value="governance" className="mt-6">
          <GovernanceTab
            organization={organization}
            currentUser={currentUser}
            permissions={permissions}
            governanceRules={data.governanceRules}
            elections={data.elections}
            onRefreshGovernance={actions.refreshGovernance}
            onRefreshElections={actions.refreshElections}
            onCreateElection={actions.createElection}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab
            organization={organization}
            currentUser={currentUser}
            permissions={permissions}
            documents={data.documents}
            policyVotes={data.policyVotes}
            loading={data.loading.documents}
            onCreateDocument={onCreateOrganizationalDocument}
            onRefreshDocuments={actions.refreshDocuments}
            onRefreshPolicyVotes={actions.refreshPolicyVotes}
          />
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <MembersTab
            organization={organization}
            currentUser={currentUser}
            permissions={permissions}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <AnalyticsTab
            organization={organization}
            permissions={permissions}
            analytics={data.analytics}
            elections={data.elections}
            loading={data.loading.analytics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
