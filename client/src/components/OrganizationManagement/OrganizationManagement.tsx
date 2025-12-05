import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, Vote, FileText, Eye, Building2 } from 'lucide-react';

import { Organization, User, Document } from '../../types';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { useOrganizationData } from '../../hooks/useOrganizationData';
import { useOrganizationWebSocket, OrganizationUpdate } from '../../hooks/useOrganizationWebSocket';
import { ErrorBoundary } from './ErrorBoundary';
import { toast } from 'sonner';

import { GovernanceTab } from './tabs/GovernanceTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MembersTab } from './tabs/MembersTab';
import { TransparencyTab } from './tabs/TransparencyTab';
import { DashboardTab } from './tabs/DashboardTab';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
  onSelectDocument?: (document: Document) => void;
  onBrandingUpdate?: (organizationId: string) => void;
}

export function OrganizationManagement({
  organization,
  currentUser,
  onSelectDocument,
  onBrandingUpdate
}: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [governanceRefreshTrigger, setGovernanceRefreshTrigger] = useState(0);
  
  // Maintain local organization state that can be updated immediately
  const [localOrganization, setLocalOrganization] = useState<Organization>(organization);

  // Sync local organization state with prop changes
  useEffect(() => {
    setLocalOrganization(organization);
  }, [organization]);

  // Use our custom hooks for data and permissions
  const { data, actions } = useOrganizationData(localOrganization.id, activeTab);
  const permissions = useOrganizationPermissions(currentUser, localOrganization, data.governanceRules);

  // Handle organization WebSocket updates
  const handleOrganizationUpdate = useCallback((update: OrganizationUpdate) => {
    if (update.organizationId !== localOrganization.id) return;

    console.log('Received organization update:', update);

    switch (update.eventType) {
      case 'governance-rules-updated':
        toast.success('Governance rules updated');
        actions.refreshGovernance();
        setGovernanceRefreshTrigger(prev => prev + 1);
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
      case 'member-invited': {
        const invitationData = update.data as { invitationCount?: number } | undefined;
        toast.success(`${invitationData?.invitationCount || 1} invitation(s) sent`);
        break;
      }
      case 'rule-proposal-created':
      case 'rule-proposal-approved':
      case 'rule-proposal-rejected':
      case 'rule-proposal-expired':
      case 'rule-proposal-vote-cast':
        actions.refreshGovernance();
        setGovernanceRefreshTrigger(prev => prev + 1);
        break;
      case 'branding-updated':
        toast.success('Organization branding updated');
        // Update local organization state immediately with branding data from WebSocket
        const brandingData = update.data as { brandingColor?: string; brandingLogoUrl?: string; brandingTitle?: string } | undefined;
        if (brandingData) {
          setLocalOrganization(prev => ({
            ...prev,
            brandingColor: brandingData.brandingColor !== undefined ? brandingData.brandingColor : prev.brandingColor,
            brandingLogoUrl: brandingData.brandingLogoUrl !== undefined ? brandingData.brandingLogoUrl : prev.brandingLogoUrl,
            brandingTitle: brandingData.brandingTitle !== undefined ? brandingData.brandingTitle : prev.brandingTitle,
          }));
        }
        if (onBrandingUpdate) {
          onBrandingUpdate(localOrganization.id);
        }
        break;
      case 'document-created':
        // Refresh documents list to show newly created document
        actions.refreshDocuments();
        break;
      default:
        console.log('Unhandled organization update:', update.eventType);
    }
  }, [localOrganization.id, localOrganization, actions, onBrandingUpdate]);

  // Subscribe to organization WebSocket updates
  useOrganizationWebSocket({
    organizationId: localOrganization.id,
    userId: currentUser?.id || null,
    authToken: localStorage.getItem('authToken'),
    onOrganizationUpdate: handleOrganizationUpdate
  });

  const handleUpdate = () => {
    // Refresh all data
    actions.refreshAll();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
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
            <TabsTrigger value="transparency" className="gap-2">
              <Eye className="h-4 w-4" />
              Transparency
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}

          <TabsContent value="dashboard" className="mt-6">
            <ErrorBoundary>
              <DashboardTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                elections={data.elections}
                documents={data.documents}
                onCreateElection={(): void => {
                  // Navigate to governance tab where election creation is available
                  setActiveTab('governance');
                }}
                onNavigateToDocuments={() => setActiveTab('documents')}
                onNavigateToMembers={() => setActiveTab('members')}
                onNavigateToGovernance={() => setActiveTab('governance')}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="governance" className="mt-6">
            <ErrorBoundary>
              <GovernanceTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                elections={data.elections}
                onRefreshGovernance={actions.refreshGovernance}
                onRefreshElections={actions.refreshElections}
                onCreateElection={actions.createElection}
                governanceRefreshTrigger={governanceRefreshTrigger}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <ErrorBoundary>
              <DocumentsTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                documents={data.documents}
                loading={data.loading.documents}
                error={data.errors.documents}
                onCreateDocument={actions.createDocument}
                onCreateChildDocument={actions.createDocument}
                onSelectDocument={onSelectDocument}
                onRefreshDocuments={actions.refreshDocuments}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <ErrorBoundary>
              <MembersTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                onUpdate={handleUpdate}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="transparency" className="mt-6">
            <ErrorBoundary>
              <TransparencyTab
                organization={localOrganization}
                currentUser={currentUser}
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
    </div>
  );
}
