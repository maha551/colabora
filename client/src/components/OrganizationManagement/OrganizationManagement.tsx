import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, Vote, FileText, BarChart3, Building2 } from 'lucide-react';

import { Organization, User, Document } from '../../types';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { useOrganizationData } from '../../hooks/useOrganizationData';
import { useOrganizationWebSocket, OrganizationUpdate } from '../../hooks/useOrganizationWebSocket';
import { ErrorBoundary } from './ErrorBoundary';
import { toast } from 'sonner';

import { GovernanceTab } from './tabs/GovernanceTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MembersTab } from './tabs/MembersTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { DashboardTab } from './tabs/DashboardTab';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
  onSelectDocument?: (document: Document) => void;
}

export function OrganizationManagement({
  organization,
  currentUser,
  onBack,
  onSelectDocument
}: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Use our custom hooks for data and permissions
  const permissions = useOrganizationPermissions(currentUser, organization);
  const { data, actions } = useOrganizationData(organization.id, activeTab);

  // Handle organization WebSocket updates
  const handleOrganizationUpdate = useCallback((update: OrganizationUpdate) => {
    if (update.organizationId !== organization.id) return;

    console.log('Received organization update:', update);

    switch (update.eventType) {
      case 'governance-rules-updated':
        toast.success('Governance rules updated');
        actions.refreshGovernance();
        break;
      case 'election-created':
        toast.success('New election created');
        actions.refreshElections();
        break;
      case 'election-updated':
      case 'election-completed':
        actions.refreshElections();
        break;
      case 'member-added':
        toast.success('Member added to organization');
        actions.refreshAll(); // Refresh all to update members list
        break;
      case 'member-removed':
        toast.success('Member removed from organization');
        actions.refreshAll(); // Refresh all to update members list
        break;
      case 'member-invited':
        toast.success(`${update.data.invitationCount || 1} invitation(s) sent`);
        break;
      case 'rule-proposal-created':
      case 'rule-proposal-approved':
        actions.refreshGovernance();
        break;
      default:
        console.log('Unhandled organization update:', update.eventType);
    }
  }, [organization.id, actions]);

  // Subscribe to organization WebSocket updates
  useOrganizationWebSocket({
    organizationId: organization.id,
    userId: currentUser?.id || null,
    authToken: localStorage.getItem('authToken'),
    onOrganizationUpdate: handleOrganizationUpdate
  });

  const handleUpdate = () => {
    // Refresh all data
    actions.refreshAll();
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <ErrorBoundary>
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 h-auto">
            <TabsTrigger value="dashboard" className="gap-2">
              <Building2 className="h-4 w-4" />
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
            <ErrorBoundary>
              <DashboardTab
                organization={organization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                elections={data.elections}
                documents={data.documents}
                onCreateElection={actions.createElection}
                onNavigateToDocuments={() => setActiveTab('documents')}
                onNavigateToMembers={() => setActiveTab('members')}
                onNavigateToGovernance={() => setActiveTab('governance')}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="governance" className="mt-6">
            <ErrorBoundary>
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
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <ErrorBoundary>
              <DocumentsTab
                organization={organization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                documents={data.documents}
                policyVotes={data.policyVotes}
                loading={data.loading.documents}
                error={data.errors.documents}
                onCreateDocument={actions.createDocument}
                onCreateChildDocument={actions.createDocument}
                onSelectDocument={onSelectDocument}
                onRefreshDocuments={actions.refreshDocuments}
                onRefreshPolicyVotes={actions.refreshPolicyVotes}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <ErrorBoundary>
              <MembersTab
                organization={organization}
                currentUser={currentUser}
                permissions={permissions}
                onUpdate={handleUpdate}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <ErrorBoundary>
              <AnalyticsTab
                organization={organization}
                permissions={permissions}
                analytics={data.analytics}
                elections={data.elections}
                loading={data.loading.analytics}
              />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </ErrorBoundary>
    </div>
  );
}
