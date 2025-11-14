import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, Vote, FileText, BarChart3, Building2 } from 'lucide-react';

import { Organization, User, Document } from '../../types';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { useOrganizationData } from '../../hooks/useOrganizationData';

import { GovernanceTab } from './tabs/GovernanceTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MembersTab } from './tabs/MembersTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';

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
  const [activeTab, setActiveTab] = useState('documents');

  // Use our custom hooks for data and permissions
  const permissions = useOrganizationPermissions(currentUser, organization);
  const { data, actions } = useOrganizationData(organization.id, activeTab);


  const handleUpdate = () => {
    // Refresh all data
    actions.refreshAll();
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-6 w-6 text-gray-600" />
          <h1 className="text-3xl font-bold text-gray-900">{organization.name}</h1>
        </div>
        {organization.description && (
          <p className="text-gray-600 ml-9">{organization.description}</p>
        )}
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4 h-auto">
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
            documentProposals={data.documentProposals}
            policyVotes={data.policyVotes}
            loading={data.loading.documents}
            error={data.errors.documents}
            onCreateDocumentProposal={actions.createDocumentProposal}
            onVoteOnDocumentProposal={actions.voteOnDocumentProposal}
            onSelectDocument={onSelectDocument}
            onRefreshDocuments={actions.refreshDocuments}
            onRefreshDocumentProposals={actions.refreshDocumentProposals}
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
