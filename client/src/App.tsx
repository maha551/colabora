import { useState, useEffect, useCallback } from 'react';
import type { AppView, Organization } from './types';

// Hooks
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import { useDocuments } from './hooks/useDocuments';
import { useDocumentView } from './hooks/useDocumentView';
import { useUserOrganizations } from './hooks/useUserOrganizations';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { useDocumentOperations } from './hooks/useDocumentOperations';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useWebSocketUpdates } from './hooks/useWebSocketUpdates';
import { useOrganizationManagement } from './hooks/useOrganizationManagement';
import { useStructureProposals } from './hooks/useStructureProposals';
import { useInvitationHandling } from './hooks/useInvitationHandling';
import { usePendingInvitations } from './hooks/usePendingInvitations';
import { useDocumentActions } from './hooks/useDocumentActions';
import { useDocumentStore } from './stores/useDocumentStore';

// Layout and Pages
import { AppLayout } from './components/layout/AppLayout';
import { AppLoadingScreen } from './components/AppLoadingScreen';
import { Login } from './components/Login';
import { ResetPassword } from './components/ResetPassword';
import { GuestPollPage } from './pages/GuestPollPage';
import { InfoPageRouter } from './pages/info/InfoPageRouter';
import { parseInfoPath } from './lib/infoRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRouter } from './components/AppRouter';
import { OrganizationDesignProvider } from './contexts/OrganizationDesignContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ScreenSizeProvider } from './contexts/ScreenSizeContext';
import { ConnectionStatusIndicator } from './components/ConnectionStatus';
import { Alert, AlertDescription } from './components/ui/alert';
import { SPACING } from './lib/designSystem';
import { RTL_LOCALES_SET } from './lib/supportedLocales';

// API and utilities
import { toast } from 'sonner';
import { logger } from './lib/logger';
import { resetOrganizationFonts } from './utils/organizationTerritory';
import { authApi } from './lib/api';
import { getCurrentHash } from './lib/hashRoutes';

export default function App() {
  const { t, i18n } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { clear: clearHistory } = useNavigationHistory();

  // Sync document dir and lang for RTL (e.g. Arabic, Persian) and locale
  useEffect(() => {
    const root = document.documentElement;
    const lng = i18n.language?.split('-')[0] || 'en';
    root.setAttribute('dir', RTL_LOCALES_SET.has(lng) ? 'rtl' : 'ltr');
    root.setAttribute('lang', i18n.language || 'en');
  }, [i18n.language]);

  // Authentication state
  const {
    currentUser,
    authLoading,
    handleLogin,
    handleLogout: originalHandleLogout,
    handleProfileUpdate,
    isAuthenticated,
  } = useAuth();

  // Apply saved locale from user profile when user loads (e.g. after login)
  useEffect(() => {
    const savedLocale = currentUser?.preferences?.locale;
    if (savedLocale && savedLocale !== i18n.language?.split('-')[0]) {
      i18n.changeLanguage(savedLocale);
    }
  }, [currentUser?.id, currentUser?.preferences?.locale]); // Omit i18n to avoid feedback loop

  // Wrap logout to clear navigation history and organization fonts
  const handleLogout = useCallback(async () => {
    // Clear organization fonts before logout
    resetOrganizationFonts();
    
    clearHistory();
    await originalHandleLogout();
  }, [originalHandleLogout, clearHistory]);

  // Document management state
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    loadDocuments,
    createDocument,
    deleteDocument,
  } = useDocuments(currentUser);

  // Document view state
  const {
    currentDocument,
    documentLoadKey,
    loading: documentLoading,
    loadDocumentById,
    selectDocument,
    clearDocument,
    reloadDocument,
    updateDocument,
  } = useDocumentView();

  // Sync current document and load key to store for DocumentViewPage and children (sync on render so store is ready)
  useDocumentStore.getState().setDocument(currentDocument);
  useDocumentStore.getState().setDocumentLoadKey(documentLoadKey);

  // User organizations for smart navigation
  const { organizations, loading: organizationsLoading, isSingleOrg, primaryOrganization, refreshOrganizations } = useUserOrganizations(currentUser);

  // Navigation state and handlers
  const {
    navigationKey,
    currentView,
    setCurrentView,
    selectedOrganization,
    setSelectedOrganization,
    selectedMemberId,
    selectedMemberOrganizationId,
    setSelectedMemberId: _setSelectedMemberId,
    canGoBack,
    handleShowDocuments,
    handleShowActivity,
    handleShowProfile,
    handleShowSettings,
    handleShowOrganizations,
    handleShowAdmin,
    handleShowSearch,
    handleShowReportIssue,
    handleNavigateToMemberProfile,
    handleDocumentSelect,
    handleSearchResultSelect,
    handleNavigateToDocument,
    handleBack,
    navigateToHash,
  } = useAppNavigation({
    currentUser,
    organizations,
    isSingleOrg,
    primaryOrganization,
    organizationsLoading,
    isAuthenticated,
    currentDocument,
    documentOrganization: null, // Will be set by useOrganizationManagement
    loadDocumentById,
    selectDocument,
    clearDocument,
    loadStructureProposals: undefined, // Will be set by useStructureProposals
  });

  const handleNavigateToOrganization = useCallback((organizationId: string) => {
    navigateToHash(`#/organization/${organizationId}/dashboard`);
  }, [navigateToHash]);

  const handleAdminOpenOrganization = useCallback((organization: Organization) => {
    setSelectedOrganization(organization);
    setCurrentView('organization');
    navigateToHash(`#/organization/${organization.id}/dashboard`);
  }, [navigateToHash, setSelectedOrganization, setCurrentView]);

  // Organization management hook (uses navigateToHash for URL-driven navigation)
  const {
    documentOrganization,
    getActiveOrganization,
    handleSelectOrganization,
    handleOrganizationBrandingUpdate,
  } = useOrganizationManagement({
    currentView,
    currentDocument,
    currentUser,
    organizations,
    isSingleOrg,
    primaryOrganization,
    selectedOrganization,
    setSelectedOrganization,
    setCurrentView: (view: AppView) => setCurrentView(view),
    clearDocument,
    refreshOrganizations,
    navigateToHash,
  });

  // Structure proposals hook
  const {
    structureProposals,
    showStructureProposalMode,
    refreshStructureProposals,
    onStructureProposalCompleted,
    handleCreateStructureProposal,
    handleCloseStructureProposalMode,
  } = useStructureProposals({
    currentDocument,
    reloadDocument,
  });

  // Pending invitations (for UserMenu list)
  const { pendingInvitations, refresh: refreshPendingInvitations } = usePendingInvitations(isAuthenticated);

  // Invitation handling hook
  const {
    invitationDialogOpen,
    pendingInvitation,
    pendingInvitationToken,
    validatingInvitation,
    handleCloseInvitation,
    handleAcceptInvitation,
  } = useInvitationHandling({
    isAuthenticated,
    currentUser,
    organizations,
    refreshOrganizations,
    setSelectedOrganization,
    setCurrentView: (view: string) => setCurrentView(view as AppView),
    onNavigateToDocument: handleNavigateToDocument,
    onAfterAccept: refreshPendingInvitations,
  });

  // Handlers for pending invitations (UserMenu Accept/Decline by id)
  const handleAcceptInvitationById = useCallback(async (invitationId: string) => {
    try {
      const result = await authApi.acceptInvitationById(invitationId);
      if (result.success) {
        toast.success(result.message ?? tCommon('toasts.invitationAccepted'));
        const updated = await refreshOrganizations();
        refreshPendingInvitations();
        const org = result.organization;
        if (org) {
          const newOrg = updated.find(o => o.id === org.id);
          if (newOrg) {
            setSelectedOrganization(newOrg);
            setCurrentView('organization');
          }
        }
      } else {
        toast.error(result.message ?? tCommon('toasts.failedToAcceptInvitation'));
      }
    } catch (error) {
      logger.error('Accept invitation by id failed', error);
      toast.error(error instanceof Error ? error.message : tCommon('toasts.failedToAcceptInvitation'));
    }
  }, [refreshOrganizations, refreshPendingInvitations, setSelectedOrganization, setCurrentView]);

  const handleDeclineInvitationById = useCallback(async (invitationId: string) => {
    try {
      await authApi.declineInvitationById(invitationId);
      toast.success(tCommon('toasts.invitationDeclined'));
      refreshPendingInvitations();
    } catch (error) {
      logger.error('Decline invitation by id failed', error);
      toast.error(error instanceof Error ? error.message : tCommon('toasts.failedToDeclineInvitation'));
    }
  }, [refreshPendingInvitations]);

  // Normalize URL: logged-in users with invitation token see /invitation instead of /register
  useEffect(() => {
    if (!isAuthenticated) return;
    const pathname = window.location.pathname;
    const search = window.location.search;
    if (pathname === '/register' && search && new URLSearchParams(search).get('token')) {
      window.history.replaceState({}, '', `/invitation${search}`);
    }
  }, [isAuthenticated]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Document operations hook (proposals, votes, comments) - voting state from useVotingStore
  const {
    handleAddSuggestion,
    handleVote,
    handleComment,
    handleUpvoteComment,
    handleDeleteComment,
    handleEditComment,
    handleLoadMoreComments,
    handleDeleteProposal,
  } = useDocumentOperations({
    currentDocument,
    currentUser,
    updateDocument,
    reloadDocument,
  });

  // WebSocket update processing hook - real-time and voting state from stores
  const { setActivityFeedUpdateHandler, applyQueuedUpdates } = useWebSocketUpdates({
    currentDocument,
    currentUser,
    currentView,
    documents,
    updateDocument,
    reloadDocument,
    loadDocumentById,
    onAgreedViewRefresh: () => {
      useDocumentStore.getState().incrementAgreedViewRefreshKey();
    },
  });

  // Refresh document list when navigating to documents view
  // Note: loadDocuments is stable (only depends on currentUser), so safe to include
  useEffect(() => {
    if (currentView === 'documents' && currentUser) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, currentUser]); // Only depend on view and user, not loadDocuments

  // Document actions hook (editing, collaborators, sharing)
  const {
    handleAddElement,
    handleCollaboratorAdded,
    handleCollaboratorRemoved,
    handleShareDocument,
  } = useDocumentActions({
    currentDocument,
    reloadDocument,
  });

  // Consolidated comment handler - single source of truth for comment creation
  // Used by ActivityFeedView, DashboardTab, and other components that need the 5-param signature
  // Note: SuggestionCard uses handleComment from useDocumentOperations directly (better UX with optimistic updates)
  const handleAddComment = useCallback(async (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    text: string,
    parentId?: string
  ) => {
    const { commentsApi } = await import('./lib/api');
    try {
      const response = await commentsApi.addComment(documentId, paragraphId, proposalId, { 
        text, 
        parentId: parentId ?? undefined 
      });
      toast.success(parentId ? tCommon('toasts.replyAdded') : tCommon('toasts.commentAdded'));
      return response; // Return response for components that need it (ActivityFeedView)
    } catch (error) {
      logger.error('Failed to add comment:', error);
      toast.error(parentId ? tCommon('toasts.failedToAddReply') : tCommon('toasts.failedToAddComment'));
      throw error;
    }
  }, []);

  // Activity feed handlers
  const handleNavigateToDocumentWrapper = async (documentId: string) => {
    try {
      await handleNavigateToDocument(documentId);
    } catch (error) {
      logger.error('Failed to load document:', error);
      toast.error(tCommon('toasts.failedToLoadDocument'));
    }
  };

  // Defensive cleanup: ensure fonts are reset when showing login
  // This runs whenever isAuthenticated becomes false
  useEffect(() => {
    if (!isAuthenticated) {
      resetOrganizationFonts();
    }
  }, [isAuthenticated]);

  /** Ensures immersive layout recomputes when URL changes without altering React router state (e.g. browser Back between meetings). */
  const [hashRevision, setHashRevision] = useState(0);
  useEffect(() => {
    const bump = () => setHashRevision((r) => r + 1);
    window.addEventListener('hashchange', bump);
    window.addEventListener('popstate', bump);
    return () => {
      window.removeEventListener('hashchange', bump);
      window.removeEventListener('popstate', bump);
    };
  }, []);

  // Show loading while checking authentication OR loading organizations
  if (authLoading || (isAuthenticated && organizationsLoading)) {
    return <AppLoadingScreen stage={authLoading ? 'auth' : 'organizations'} />;
  }

  // Public info / legal pages — pathname /info/*
  const infoRoute = parseInfoPath(window.location.pathname);
  if (infoRoute) {
    return (
      <ThemeProvider defaultTheme="system">
        <ScreenSizeProvider>
          <InfoPageRouter route={infoRoute} isAuthenticated={isAuthenticated} />
        </ScreenSizeProvider>
      </ThemeProvider>
    );
  }

  // Guest poll page (no account required) — pathname /guest/poll/:token
  const guestPollMatch = window.location.pathname.match(/^\/guest\/poll\/([^/]+)\/?$/);
  if (guestPollMatch) {
    return (
      <ThemeProvider defaultTheme="system">
        <GuestPollPage token={guestPollMatch[1]} />
      </ThemeProvider>
    );
  }

  // Check if we're on the reset password page
  const searchParams = new URLSearchParams(window.location.search);
  const resetPasswordToken = searchParams.get('token');
  // Only treat as password reset if pathname includes 'reset-password' OR
  // if there's a token but NOT on register or invitation (invitation links use /invitation?token=... or /register?token=...)
  const isResetPasswordPage = window.location.pathname.includes('reset-password') ||
    (resetPasswordToken && !window.location.pathname.includes('register') && !window.location.pathname.includes('invitation'));

  // Show reset password page if token is present
  if (!isAuthenticated && isResetPasswordPage) {
    return (
      <ThemeProvider defaultTheme="system">
        <ResetPassword onBackToLogin={() => {
          // Clear URL params and show login
          window.history.replaceState({}, '', '/');
        }} />
      </ThemeProvider>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    const loginPathname = window.location.pathname;
    const loginHasToken = !!new URLSearchParams(window.location.search).get('token');
    const showInvitationEmptyOnLogin = loginPathname === '/invitation' && !loginHasToken;
    return (
      <ThemeProvider defaultTheme="system">
        <ScreenSizeProvider>
          {showInvitationEmptyOnLogin && (
            <div className={`${SPACING.page.all} absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-xl z-10 px-4`}>
              <Alert>
                <AlertDescription className="text-muted-foreground">
                  {t('noInvitationFound')}
                </AlertDescription>
              </Alert>
            </div>
          )}
          <Login onLogin={handleLogin} onRefreshOrganizations={() => refreshOrganizations().then(() => {})} />
        </ScreenSizeProvider>
      </ThemeProvider>
    );
  }

  // Calculate layout props
  const showBackButton = canGoBack;
  const title: string | undefined = (currentView === 'activity' ? t('activityFeed') :
                currentView === 'profile' ? t('profile') :
                currentView === 'settings' ? t('settings') :
                currentView === 'organizations' ? (isSingleOrg && primaryOrganization ? primaryOrganization.name : t('organizations')) :
                currentView === 'organization' && selectedOrganization ? selectedOrganization.name :
                currentView === 'documents' ? t('documents') :
                currentView === 'admin' ? t('adminDashboard') :
                currentView === 'search' ? t('search') :
                currentView === 'report-issue' ? t('reportIssue') :
                undefined) ?? undefined;

  const activeOrganization = getActiveOrganization();

  // Debug logging for organization context (using logger instead of console.log)
  if (currentView === 'documents') {
    logger.log('Documents view - organization context:', {
      activeOrganization: activeOrganization?.id,
      activeOrganizationName: activeOrganization?.name,
      selectedOrganization: selectedOrganization?.id,
      documentOrganization: documentOrganization?.id,
      isSingleOrg,
      primaryOrganization: primaryOrganization?.id
    });
  }

  return (
    <ThemeProvider>
    <ScreenSizeProvider>
    <ErrorBoundary>
    <OrganizationDesignProvider 
      organization={activeOrganization}
      currentView={currentView}
      isSingleOrg={isSingleOrg}
      user={currentUser}
      currentDocument={currentDocument}
    >
    <AppLayout
        key={currentUser?.id ?? 'anon'}
        currentUser={currentUser}
        onLogout={handleLogout}
        onShowActivity={handleShowActivity}
        onShowProfile={handleShowProfile}
        onShowSettings={handleShowSettings}
        onShowDocuments={handleShowDocuments}
        onShowOrganizations={handleShowOrganizations}
        onShowAdmin={currentUser?.role === 'admin' ? handleShowAdmin : undefined}
        onShowSearch={handleShowSearch}
        onShowReportIssue={handleShowReportIssue}
      showBackButton={showBackButton}
        onBack={handleBack}
      title={title}
        organization={activeOrganization}
        organizations={organizations}
        isSingleOrg={isSingleOrg}
        onSelectOrganization={handleSelectOrganization}
        pendingInvitations={pendingInvitations}
        onAcceptInvitationById={handleAcceptInvitationById}
        onDeclineInvitationById={handleDeclineInvitationById}
        onRefreshPendingInvitations={refreshPendingInvitations}
        currentView={currentView}
        routeHash={getCurrentHash()}
    >
      <AppRouter
        currentView={currentView}
        currentUser={currentUser}
        currentDocument={currentDocument}
        documentLoading={documentLoading}
        documentLoadKey={documentLoadKey}
        documents={documents}
        documentsLoading={documentsLoading}
        documentsError={documentsError}
        onRetryDocuments={loadDocuments}
        organizations={organizations}
        organizationsLoading={organizationsLoading}
        isSingleOrg={isSingleOrg}
        primaryOrganization={primaryOrganization}
        selectedOrganization={selectedOrganization}
        selectedMemberId={selectedMemberId}
        selectedMemberOrganizationId={selectedMemberOrganizationId}
        structureProposals={structureProposals}
        showStructureProposalMode={showStructureProposalMode}
        isCreateDialogOpen={isCreateDialogOpen}
        isAuthenticated={isAuthenticated}
        pendingInvitation={pendingInvitation}
        pendingInvitationToken={pendingInvitationToken}
        invitationDialogOpen={invitationDialogOpen}
        validatingInvitation={validatingInvitation}
        onSelectDocument={handleDocumentSelect}
        onSelectSearchResult={handleSearchResultSelect}
        onCreateDocument={createDocument}
        onDeleteDocument={deleteDocument}
        onApplyQueuedUpdates={applyQueuedUpdates}
        onSelectOrganization={handleSelectOrganization}
        onNavigateToDocument={handleNavigateToDocument}
        onNavigateToDocumentWrapper={handleNavigateToDocumentWrapper}
        onNavigateToOrganization={handleNavigateToOrganization}
        onNavigateToHash={navigateToHash}
        onNavigateToMemberProfile={handleNavigateToMemberProfile}
        onShowActivity={handleShowActivity}
        onAddComment={async (proposalId, documentId, paragraphId, text, parentId) => { await handleAddComment(proposalId, documentId, paragraphId, text, parentId); }}
        onBack={handleBack}
        onSetCreateDialogOpen={setIsCreateDialogOpen}
        onRefreshOrganizations={refreshOrganizations}
        onBrandingUpdate={handleOrganizationBrandingUpdate}
        onShowAdmin={handleShowAdmin}
        onAdminOpenOrganization={handleAdminOpenOrganization}
        onAddSuggestion={handleAddSuggestion}
        onVote={handleVote}
        onComment={handleComment}
        onLoadMoreComments={handleLoadMoreComments}
        onUpvoteComment={handleUpvoteComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onDeleteProposal={handleDeleteProposal}
        onAddElement={handleAddElement}
        onCollaboratorAdded={handleCollaboratorAdded}
        onCollaboratorRemoved={handleCollaboratorRemoved}
        onShareDocument={handleShareDocument}
        onStructureProposalCompleted={onStructureProposalCompleted}
        onCreateStructureProposal={handleCreateStructureProposal}
        onCloseStructureProposalMode={handleCloseStructureProposalMode}
        refreshStructureProposals={refreshStructureProposals}
        selectDocument={selectDocument}
        handleCloseInvitation={handleCloseInvitation}
        handleAcceptInvitation={handleAcceptInvitation}
        handleProfileUpdate={handleProfileUpdate}
        setActivityFeedUpdateHandler={setActivityFeedUpdateHandler}
        activeOrganization={activeOrganization}
        pendingInvitations={pendingInvitations}
        onAcceptInvitationById={handleAcceptInvitationById}
        onDeclineInvitationById={handleDeclineInvitationById}
        onRefreshPendingInvitations={refreshPendingInvitations}
      />
    </AppLayout>
    <ConnectionStatusIndicator />
    </OrganizationDesignProvider>
    </ErrorBoundary>
    </ScreenSizeProvider>
    </ThemeProvider>
  );
}