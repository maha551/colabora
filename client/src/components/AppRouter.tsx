// AppRouter component - handles view routing and component composition
// Extracted from App.tsx to reduce complexity and improve maintainability

import { DocumentsPage } from '../pages/DocumentsPage';
import { ActivityPage } from '../pages/ActivityPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SettingsPage } from '../pages/SettingsPage';
import { MemberProfilePage } from '../pages/MemberProfilePage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { SearchPage } from '../pages/SearchPage';
import { ReportIssuePage } from '../pages/ReportIssuePage';
import { OrganizationDashboard } from './OrganizationDashboard';
import { OrganizationManagement } from './OrganizationManagement/OrganizationManagement';
import { AdminDashboard } from './AdminDashboard';
import { InvitationAcceptDialog } from './InvitationAcceptDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { LoadingState } from './ui/LoadingState';
import { Alert, AlertDescription } from './ui/alert';
import { cn } from './ui/utils';
import { SPACING } from '../lib/designSystem';
import type { AppView, Document, User, Organization, StructureProposal, Comment, SearchResult } from '../types';
import type { PendingInvitationItem } from '../hooks/usePendingInvitations';
import type { DocumentUpdate } from '../hooks/useWebSocket';

interface AppRouterProps {
  currentView: AppView;
  currentUser: User | null;
  currentDocument: Document | null;
  documentLoading: boolean;
  documentLoadKey: number;
  documents: Document[];
  documentsLoading: boolean;
  documentsError?: string | null;
  onRetryDocuments?: () => void;
  organizations: Organization[];
  organizationsLoading: boolean;
  isSingleOrg: boolean;
  primaryOrganization: Organization | null;
  selectedOrganization: Organization | null;
  selectedMemberId: string | null;
  selectedMemberOrganizationId?: string | null;
  structureProposals: StructureProposal[];
  showStructureProposalMode: boolean;
  isCreateDialogOpen: boolean;
  isAuthenticated: boolean;
  pendingInvitation: {
    id: string;
    organizationId: string;
    organizationName: string;
    email: string;
    invitationType: 'member' | 'representative';
    inviterName: string;
    expiresAt: string;
    createdAt: string;
  } | null;
  pendingInvitationToken: string | null;
  invitationDialogOpen: boolean;
  validatingInvitation?: boolean;
  // Handlers
  onSelectDocument: (document: Document, searchQuery?: string) => Promise<void>;
  onSelectSearchResult: (result: SearchResult, searchQuery?: string) => Promise<void>;
  onCreateDocument: (title: string, organizationId?: string) => Promise<void>;
  onDeleteDocument: (documentId: string) => Promise<void>;
  onApplyQueuedUpdates: () => void;
  onSelectOrganization: (org: Organization) => void;
  onNavigateToDocument: (documentId: string) => Promise<void>;
  onNavigateToDocumentWrapper: (documentId: string) => Promise<void>;
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  onNavigateToMemberProfile: (userId: string, organizationId?: string) => void;
  onShowActivity: () => void;
  onAddComment: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => Promise<void>;
  onBack: () => void;
  onSetCreateDialogOpen: (open: boolean) => void;
  onRefreshOrganizations: () => Promise<void | Organization[]>;
  onBrandingUpdate: (organizationId: string) => Promise<void>;
  onShowAdmin?: () => void;
  onAdminOpenOrganization?: (organization: Organization) => void;
  onAddSuggestion: (paragraphId: string, data: { text: string; type?: 'BODY' | 'TITLE'; headingLevel?: import('../types').HeadingLevel }) => Promise<void>;
  onVote: (proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onComment: (suggestionId: string, text: string, parentId?: string) => Promise<void>;
  onLoadMoreComments?: (suggestionId: string, offset: number) => Promise<Comment[]>;
  onUpvoteComment?: (suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => void;
  onEditComment?: (suggestionId: string, commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (suggestionId: string, commentId: string) => Promise<void>;
  onDeleteProposal?: (proposalId: string) => Promise<void>;
  onAddElement: (elementType: import('../types').ElementType, options?: { text?: string; title?: string; headingLevel?: import('../types').HeadingLevel; order?: number }) => Promise<void>;
  onCollaboratorAdded: (user: User) => Promise<void>;
  onCollaboratorRemoved: (userId: string) => Promise<void>;
  onShareDocument: () => void;
  onStructureProposalCompleted: (proposalId: string) => Promise<void>;
  onCreateStructureProposal: () => void;
  onCloseStructureProposalMode: () => void;
  refreshStructureProposals: () => void;
  selectDocument: (document: Document) => Promise<void>;
  handleCloseInvitation: () => void;
  handleAcceptInvitation: () => Promise<void>;
  handleProfileUpdate: (updatedUser: User) => void;
  setActivityFeedUpdateHandler: (handler: (update: DocumentUpdate) => void) => void;
  activeOrganization: Organization | null;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function AppRouter({
  currentView,
  currentUser,
  currentDocument,
  documentLoading,
  documentLoadKey: _documentLoadKey,
  documents,
  documentsLoading,
  documentsError,
  onRetryDocuments,
  organizations,
  organizationsLoading,
  isSingleOrg: _isSingleOrg,
  primaryOrganization: _primaryOrganization,
  selectedOrganization,
  selectedMemberId,
  selectedMemberOrganizationId,
  structureProposals,
  showStructureProposalMode,
  isCreateDialogOpen,
  isAuthenticated,
  pendingInvitation,
  pendingInvitationToken,
  invitationDialogOpen,
  validatingInvitation,
  onSelectDocument,
  onSelectSearchResult,
  onCreateDocument,
  onDeleteDocument,
  onApplyQueuedUpdates,
  onSelectOrganization,
  onNavigateToDocument: _onNavigateToDocument,
  onNavigateToDocumentWrapper,
  onNavigateToOrganization,
  onNavigateToHash,
  onNavigateToMemberProfile,
  onShowActivity,
  onAddComment,
  onBack,
  onSetCreateDialogOpen,
  onRefreshOrganizations,
  onBrandingUpdate,
  onShowAdmin,
  onAdminOpenOrganization,
  onAddSuggestion,
  onVote,
  onComment,
  onLoadMoreComments,
  onUpvoteComment,
  onEditComment,
  onDeleteComment,
  onDeleteProposal,
  onAddElement,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  onShareDocument,
  onStructureProposalCompleted,
  onCreateStructureProposal,
  onCloseStructureProposalMode,
  refreshStructureProposals,
  selectDocument,
  handleCloseInvitation,
  handleAcceptInvitation,
  handleProfileUpdate,
  setActivityFeedUpdateHandler,
  activeOrganization,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: AppRouterProps) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const hasInvitationToken = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('token');
  const showInvitationEmptyState = isAuthenticated && pathname === '/invitation' && !hasInvitationToken;

  return (
    <>
      {showInvitationEmptyState ? (
        <div className={cn('min-h-screen', SPACING.layout.containPage)}>
          <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
          <Alert className="max-w-xl">
            <AlertDescription className="text-muted-foreground">
              No invitation found. Use the full link from your invitation email to accept an invitation.
            </AlertDescription>
          </Alert>
          </div>
        </div>
      ) : (
      <>
      {currentView === 'documents' && (
        <ErrorBoundary>
          <DocumentsPage
            documents={documents}
            currentUser={currentUser}
            onSelectDocument={onSelectDocument}
            onCreateDocument={onCreateDocument}
            onDeleteDocument={onDeleteDocument}
            isLoading={documentsLoading}
            documentsError={documentsError}
            onRetryDocuments={onRetryDocuments}
            isCreateDialogOpen={isCreateDialogOpen}
            onSetCreateDialogOpen={onSetCreateDialogOpen}
            currentOrganizationId={activeOrganization?.id}
            organizations={organizations}
          />
        </ErrorBoundary>
      )}

      {currentView === 'activity' && (
        <ErrorBoundary>
        <ActivityPage
          documents={documents}
          currentUser={currentUser}
          onNavigateToDocument={onNavigateToDocumentWrapper}
          onAddComment={onAddComment}
          onWebSocketUpdate={setActivityFeedUpdateHandler}
          organizations={organizations}
          onNavigateToOrganization={onNavigateToOrganization}
          onNavigateToHash={onNavigateToHash}
        />
        </ErrorBoundary>
      )}

      {currentView === 'profile' && currentUser && (
        <ErrorBoundary>
        <ProfilePage
          user={currentUser}
          onProfileUpdate={handleProfileUpdate}
          organizations={organizations}
          organizationsLoading={organizationsLoading}
          onRefreshOrganizations={onRefreshOrganizations}
          pendingInvitations={pendingInvitations}
          onAcceptInvitationById={onAcceptInvitationById}
          onDeclineInvitationById={onDeclineInvitationById}
          onRefreshPendingInvitations={onRefreshPendingInvitations}
        />
        </ErrorBoundary>
      )}

      {currentView === 'settings' && currentUser && (
        <ErrorBoundary>
        <SettingsPage
          user={currentUser}
          onProfileUpdate={handleProfileUpdate}
          hasOrganizations={organizations.length > 0}
        />
        </ErrorBoundary>
      )}

      {currentView === 'member-profile' && selectedMemberId && (
        <ErrorBoundary>
        <MemberProfilePage
          userId={selectedMemberId}
          organizationId={selectedMemberOrganizationId}
          onBack={onBack}
          onNavigateToHash={onNavigateToHash}
        />
        </ErrorBoundary>
      )}

      {currentView === 'organizations' && currentUser && (
        <ErrorBoundary>
        <OrganizationDashboard
          currentUser={currentUser}
          onSelectOrganization={onSelectOrganization}
          organizations={organizations}
          isLoading={organizationsLoading}
          onShowAdmin={onShowAdmin}
        />
        </ErrorBoundary>
      )}

      {currentView === 'organization' && selectedOrganization && currentUser && (
        <ErrorBoundary>
        <OrganizationManagement
          organization={selectedOrganization}
          currentUser={currentUser}
          onBack={onBack}
          onNavigateToHash={onNavigateToHash}
          onSelectDocument={onSelectDocument}
          onBrandingUpdate={onBrandingUpdate}
          onNavigateToMemberProfile={onNavigateToMemberProfile}
          onNavigateToActivity={onShowActivity}
          onNavigateToDocument={onNavigateToDocumentWrapper}
          onAddComment={onAddComment}
        />
        </ErrorBoundary>
      )}

      {currentView === 'admin' && currentUser?.role === 'admin' && currentUser && (
        <ErrorBoundary>
          <AdminDashboard
            currentUser={currentUser}
            onBack={onBack}
            onOrganizationCreated={async () => { await onRefreshOrganizations(); }}
            onAdminOpenOrganization={onAdminOpenOrganization}
          />
        </ErrorBoundary>
      )}

      {currentView === 'search' && currentUser && (
        <ErrorBoundary>
          <SearchPage
            onSelectResult={onSelectSearchResult}
          />
        </ErrorBoundary>
      )}

      {currentView === 'report-issue' && (
        <ErrorBoundary>
          <ReportIssuePage onBack={onBack} />
        </ErrorBoundary>
      )}

      {currentView === 'document' && (
        <ErrorBoundary>
        {documentLoading ? (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
              <LoadingState isLoading={true} mode="spinner" spinnerSize="lg" className="mx-auto mb-4">
                <span />
              </LoadingState>
              <p className="text-muted-foreground text-lg">Loading document...</p>
              <p className="text-muted-foreground/70 text-sm mt-2">Please wait while we fetch the document</p>
            </div>
          </div>
        ) : currentDocument ? (
          <DocumentViewPage
            structureProposals={structureProposals}
            showStructureProposalMode={showStructureProposalMode}
            onAddSuggestion={onAddSuggestion}
            onVote={onVote}
            onComment={onComment}
            onLoadMoreComments={onLoadMoreComments}
            onUpvoteComment={onUpvoteComment}
            onEditComment={onEditComment}
            onDeleteComment={onDeleteComment}
            onDeleteProposal={onDeleteProposal}
            onAddElement={onAddElement}
            onCollaboratorAdded={onCollaboratorAdded}
            onCollaboratorRemoved={onCollaboratorRemoved}
            onShareDocument={onShareDocument}
            onStructureProposalCompleted={onStructureProposalCompleted}
            onCreateStructureProposal={onCreateStructureProposal}
            onCloseStructureProposalMode={onCloseStructureProposalMode}
            refreshStructureProposals={refreshStructureProposals}
            onSelectDocument={selectDocument}
            onDeleteDocument={onDeleteDocument}
            onApplyQueuedUpdates={onApplyQueuedUpdates}
            onNavigateToOrganization={onNavigateToOrganization}
            onNavigateToHash={onNavigateToHash}
          />
        ) : null}
        </ErrorBoundary>
      )}

      </>
      )}

      {/* Validating invitation overlay */}
      {validatingInvitation && (
        <div
          className="fixed inset-0 z-[99] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-sm font-medium text-muted-foreground">Checking invitation...</p>
          </div>
        </div>
      )}

      {/* Invitation Acceptance Dialog for Logged-in Users */}
      {isAuthenticated && currentUser && (
        <InvitationAcceptDialog
          invitation={pendingInvitation}
          invitationToken={pendingInvitationToken}
          isOpen={invitationDialogOpen}
          onClose={handleCloseInvitation}
          onAccept={handleAcceptInvitation}
        />
      )}
    </>
  );
}

