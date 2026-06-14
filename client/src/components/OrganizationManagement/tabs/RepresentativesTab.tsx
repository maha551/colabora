import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/Icon';
import { Organization, User, OrganizationGovernanceRules, RepresentativeElection, Document, RuleProposal, StructureProposal, DocumentTreeProposal, OrganizationVote } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RepresentativeManager } from '../../RepresentativeManager';
import { ElectionCreationDialog } from '../../governance/ElectionCreationDialog';
import { DocumentCreationModal } from '../DocumentCreationModal';
import { InviteMembersDialog } from '../InviteMembersDialog';
import { GovernanceRulesVotingInterface } from '../../governance/GovernanceRulesVotingInterface';
import { OrganizationBrandingDialog } from '../OrganizationBrandingDialog';
import { DEFAULT_ORGANIZATION_COLOR } from '../../../lib/constants';
import { OrganizationDecisionsPanel } from '../OrganizationDecisionsPanel';
import { TabPanelHeader } from '../../layout/TabPanelHeader';
import { TabPanelBody } from '../../layout/TabPanelBody';

interface RepresentativeLoading {
  ruleProposals: boolean;
  organizationVotes: boolean;
  structureProposals: boolean;
  treeProposals: boolean;
  deletionStatuses: boolean;
}

interface RepresentativesTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];
  documents?: Document[];
  ruleProposals: RuleProposal[];
  organizationVotes: OrganizationVote[];
  structureProposals: StructureProposal[];
  treeProposals: DocumentTreeProposal[];
  deletionStatuses: Record<string, import('../../../lib/api').DeletionStatusResponse>;
  representativeLoading: RepresentativeLoading;
  onRefreshRepresentativeActions: () => Promise<void>;
  onRefreshRuleProposals: () => Promise<void>;
  onRefreshOrganizationVotes: () => Promise<void>;
  onRefreshStructureProposals: () => Promise<void>;
  onRefreshTreeProposals: () => Promise<void>;
  onCompleteOrganizationVote: (voteId: string) => Promise<void>;
  onRefreshGovernance: () => Promise<void>;
  onRefreshElections: () => Promise<void>;
  onRefreshDocuments?: () => Promise<void>;
  onCreateElection?: (electionData: {
    title: string;
    description?: string;
    votingStartsAt: string;
    votingEndsAt: string;
    candidates: string[];
  }) => Promise<void>;
  governanceRefreshTrigger?: number;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToGovernance?: () => void;
}

export function RepresentativesTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  elections,
  documents,
  ruleProposals,
  organizationVotes,
  structureProposals,
  treeProposals,
  deletionStatuses,
  representativeLoading,
  onRefreshRepresentativeActions: _onRefreshAll, // Available for bulk refresh if needed
  onRefreshRuleProposals,
  onRefreshOrganizationVotes,
  onRefreshStructureProposals,
  onRefreshTreeProposals,
  onCompleteOrganizationVote,
  onRefreshGovernance,
  onRefreshElections,
  onRefreshDocuments,
  governanceRefreshTrigger,
  onNavigateToMemberProfile,
  onNavigateToDocument,
}: RepresentativesTabProps) {
  const { t } = useTranslation('organization');
  const { t: tGov } = useTranslation('governance');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showElectionDialog, setShowElectionDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [showGovernanceRules, setShowGovernanceRules] = useState(false);
  const [showBrandingDialog, setShowBrandingDialog] = useState(false);

  const draftProposals = ruleProposals.filter((p) => p.status === 'draft');
  const activeProposals = ruleProposals.filter((p) => p.status === 'active');
  const activeElections = elections.filter((e) => {
    return e.status === 'draft' || e.status === 'nomination' || e.status === 'voting';
  });

  const pendingDecisionsCount =
    draftProposals.length +
    activeProposals.length +
    activeElections.filter((e) => e.status === 'draft' || e.status === 'nomination').length +
    organizationVotes.filter((v) => v.status === 'proposed').length;

  if (!permissions.isRepresentative) {
    return (
      <div className="text-center py-12">
        <Icon name="Shield" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('accessRestricted')}</h3>
        <p className="text-muted-foreground">
          {t('accessRestrictedRepDescription')}
        </p>
      </div>
    );
  }

  return (
    <TabPanelBody>
      <TabPanelHeader
        title={
          <span className="flex items-center gap-2">
            <Icon name="UserCheck" className="h-6 w-6 text-[var(--badge-purple-text)]" />
            {t('representatives')}
          </span>
        }
        subtitle={t('manageDecisionsDescription')}
      />

      {/* Representative Actions - All vote types requiring rep action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Vote" className="h-5 w-5" />
            {t('representativeActions')}
            {pendingDecisionsCount > 0 && (
              <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800">
                {t('needAttention', { count: pendingDecisionsCount })}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t('representativeActionsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <OrganizationDecisionsPanel
            organization={organization}
            currentUser={currentUser}
            permissions={permissions}
            governanceRules={governanceRules}
            elections={elections}
            documents={documents}
            ruleProposals={ruleProposals}
            organizationVotes={organizationVotes}
            structureProposals={structureProposals}
            treeProposals={treeProposals}
            deletionStatuses={deletionStatuses}
            representativeLoading={representativeLoading}
            onRefreshRuleProposals={onRefreshRuleProposals}
            onRefreshOrganizationVotes={onRefreshOrganizationVotes}
            onRefreshStructureProposals={onRefreshStructureProposals}
            onRefreshTreeProposals={onRefreshTreeProposals}
            onCompleteOrganizationVote={onCompleteOrganizationVote}
            onRefreshGovernance={onRefreshGovernance}
            onRefreshElections={onRefreshElections}
            onRefreshDocuments={onRefreshDocuments}
            onNavigateToDocument={onNavigateToDocument}
            showRepActions
            includeDocumentAmendmentActions
          />
        </CardContent>
      </Card>

      {/* Quick Actions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Plus" className="h-5 w-5" />
            {t('quickActions')}
          </CardTitle>
          <CardDescription>
            {t('quickActionsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row flex-wrap gap-3">
            {permissions.canCreateElections && (
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setShowElectionDialog(true)}
              >
                <Icon name="Vote" className="h-5 w-5" />
                <span>{t('createElection')}</span>
              </Button>
            )}
            {permissions.canCreateDocuments && (
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setShowDocumentDialog(true)}
              >
                <Icon name="FileText" className="h-5 w-5" />
                <span>{t('createDocument')}</span>
              </Button>
            )}
            {permissions.canInviteMembers && (
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setShowInviteDialog(true)}
              >
                <Icon name="UserPlus" className="h-5 w-5" />
                <span>{t('inviteMembers')}</span>
              </Button>
            )}
            {permissions.canManageGovernanceRules && (
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setShowGovernanceRules(!showGovernanceRules)}
              >
                <Icon name="Settings" className="h-5 w-5" />
                <span>{showGovernanceRules ? t('hideRules') : t('manageRules')}</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Representative Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="UserCheck" className="h-5 w-5 text-[var(--badge-purple-text)]" />
            {t('representativeManagement')}
          </CardTitle>
          <CardDescription>
            {t('representativeManagementDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RepresentativeManager
            organization={organization}
            currentUser={currentUser}
            onUpdate={onRefreshGovernance}
            onNavigateToMemberProfile={onNavigateToMemberProfile}
          />
        </CardContent>
      </Card>

      {/* Organization Branding */}
      {permissions.canManageOrganization && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Icon name="Palette" className="h-5 w-5" />
                {t('organizationDesign')}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBrandingDialog(true)}
              >
                <Icon name="Palette" className="h-4 w-4 mr-2" />
                {t('customize')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('headerColor')}</span>
                <span className="font-medium">
                  <span
                    className="inline-block w-4 h-4 rounded border border-border mr-2"
                    style={{ backgroundColor: organization.brandingColor || DEFAULT_ORGANIZATION_COLOR }}
                  />
                  {organization.brandingColor || t('defaultBrandingColor', { color: DEFAULT_ORGANIZATION_COLOR })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('logo')}</span>
                <span className="font-medium">
                  {organization.brandingLogoUrl ? t('brandingSet') : t('notSet')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('customTitle')}</span>
                <span className="font-medium">
                  {organization.brandingTitle || t('usingOrganizationName')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('iconSet')}</span>
                <span className="font-medium capitalize">
                  {organization.iconSet || t('lucideDefault')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fontFamily')}</span>
                <span className="font-medium capitalize">
                  {organization.fontFamily ? organization.fontFamily.replace('-', ' ') : 'Inter'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Governance Rules Management */}
      {showGovernanceRules && permissions.canManageGovernanceRules && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Icon name="Settings" className="h-5 w-5" />
                {tGov('tab.governanceRules')}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGovernanceRules(false)}
              >
                <Icon name="XCircle" className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <GovernanceRulesVotingInterface
              organization={organization}
              currentUser={currentUser}
              onClose={() => setShowGovernanceRules(false)}
              refreshTrigger={governanceRefreshTrigger}
              governanceRules={governanceRules}
            />
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <InviteMembersDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        organization={organization}
        currentUser={currentUser}
        canInviteMembers={permissions.canInviteMembers}
        onInvitesUpdated={onRefreshGovernance}
      />

      {showElectionDialog && (
        <ElectionCreationDialog
          organization={organization}
          currentUser={currentUser}
          open={showElectionDialog}
          onOpenChange={setShowElectionDialog}
          onSuccess={async () => {
            setShowElectionDialog(false);
            onRefreshElections();
          }}
          governanceRules={governanceRules}
        />
      )}

      {showDocumentDialog && (
        <DocumentCreationModal
          organization={organization}
          governanceRules={governanceRules}
          isOpen={showDocumentDialog}
          onClose={() => setShowDocumentDialog(false)}
          onSuccess={() => {
            setShowDocumentDialog(false);
            if (onRefreshDocuments) {
              onRefreshDocuments();
            }
          }}
          // Note: Representatives can only create root documents from this tab
          // For creating child documents or positioning relative to others, use DocumentsTab
        />
      )}

      {showBrandingDialog && (
        <OrganizationBrandingDialog
          organization={organization}
          currentUser={currentUser}
          open={showBrandingDialog}
          onOpenChange={setShowBrandingDialog}
          onSuccess={async () => {
            // WebSocket will handle the update via 'branding-updated' event
            setShowBrandingDialog(false);
          }}
        />
      )}
    </TabPanelBody>
  );
}
