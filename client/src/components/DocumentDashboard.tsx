import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Document, User, Organization, OrganizationGovernanceRules } from "../types";
import { governanceApi } from "../lib/api";
import { useOrganizationPermissions } from "../hooks/useOrganizationPermissions";
import { Button } from "./ui/button";
import { Icon } from "./ui/Icon";
import { Welcome } from "./Welcome";
import { toast } from "sonner";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";
import { useOnboarding } from "../hooks/useOnboarding";
import { cn } from "./ui/utils";
import { ErrorState } from "./shared/ErrorState";
import { useProposals } from "../hooks/useProposals";
import { useDocumentFiltering, type ContentTypeFilter, type StatusFilterValue } from "../hooks/useDocumentFiltering";
import { useProposalNotifications } from "../hooks/useProposalNotifications";
import { SPACING } from '../lib/designSystem';
import { DocumentFilters, type DocumentFilterValue, type ViewMode } from "./dashboard/DocumentFilters";
import { DocumentDashboardCreateSection } from "./dashboard/DocumentDashboardCreateSection";
import { DocumentDeleteDialog } from "./dashboard/DocumentDeleteDialog";
import { DocumentListView } from "./dashboard/DocumentListView";
import { DocumentTreeView } from "./dashboard/DocumentTreeView";
import { ProposalsOverview } from "./dashboard/ProposalsOverview";

interface DocumentDashboardProps {
  documents: Document[];
  currentUser: User;
  onSelectDocument: (document: Document) => void;
  onCreateDocument: (
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => void | Promise<void>;
  onDeleteDocument: (documentId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isCreateDialogOpen?: boolean;
  onSetCreateDialogOpen?: (open: boolean) => void;
  // New props for organizational context
  organizations?: Organization[];
  currentOrganizationId?: string;
}

export function DocumentDashboard({
  documents,
  currentUser,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  isLoading = false,
  error: documentsError,
  onRetry,
  isCreateDialogOpen: externalIsCreateDialogOpen,
  onSetCreateDialogOpen: externalSetCreateDialogOpen,
  organizations = [],
  currentOrganizationId,
}: DocumentDashboardProps) {
  const { t: tDoc } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { experienceLevel, trackDocument } = useOnboarding();
  const [searchQuery, setSearchQuery] = useState("");
  const [internalIsCreateDialogOpen, setInternalIsCreateDialogOpen] = useState(false);
  const [showProposals, setShowProposals] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [documentFilter, setDocumentFilter] = useState<DocumentFilterValue>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>('documents');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [sortBy, setSortBy] = useState<string>("modified");
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showWelcome, setShowWelcome] = useState(() => {
    return documents.length === 0 && !localStorage.getItem('welcomeDismissed');
  });
  const [orgGovernanceRules, setOrgGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);

  const activeOrganization = useMemo(
    () => (currentOrganizationId ? organizations.find((org) => org.id === currentOrganizationId) ?? null : null),
    [currentOrganizationId, organizations]
  );

  useEffect(() => {
    if (!currentOrganizationId) {
      setOrgGovernanceRules(null);
      return;
    }

    let cancelled = false;
    governanceApi
      .getGovernanceRules(currentOrganizationId)
      .then((response) => {
        if (!cancelled) {
          setOrgGovernanceRules(response.governanceRules);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrgGovernanceRules(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrganizationId]);

  const orgPermissions = useOrganizationPermissions(
    currentUser,
    activeOrganization ?? ({ id: currentOrganizationId ?? '', name: '' } as Organization),
    orgGovernanceRules
  );

  const canCreateInCurrentContext =
    !currentOrganizationId || !activeOrganization || orgPermissions.canCreateDocuments;

  const proposalsData = useProposals({
    organizationId: currentOrganizationId,
    currentUserId: currentUser.id,
    autoRefresh: false,
  });
  const notifications = useProposalNotifications(currentUser.id);
  const dashboardContextId = currentOrganizationId || 'all';
  useEffect(() => {
    notifications.markDashboardAsViewed(dashboardContextId);
  }, [dashboardContextId, notifications]);

  const isCreateDialogOpen = externalIsCreateDialogOpen !== undefined ? externalIsCreateDialogOpen : internalIsCreateDialogOpen;
  const setIsCreateDialogOpen = externalSetCreateDialogOpen || setInternalIsCreateDialogOpen;

  const { filteredDocuments, governanceDocuments, meetingMinutes, hasHierarchy } = useDocumentFiltering({
    documents,
    organizations,
    currentUserId: currentUser.id,
    searchQuery,
    documentFilter,
    contentTypeFilter,
    statusFilter,
    sortBy,
  });

  const handleWelcomeCreateDocument = useCallback(() => {
    setShowWelcome(false);
    setIsCreateDialogOpen(true);
  }, [setIsCreateDialogOpen]);

  const handleWelcomeDismiss = useCallback(() => {
    setShowWelcome(false);
    localStorage.setItem('welcomeDismissed', 'true');
  }, []);

  const handleDeleteDocument = useCallback((documentId: string, documentTitle: string) => {
    setDocumentToDelete({ id: documentId, title: documentTitle });
  }, []);

  const confirmDeleteDocument = useCallback(async () => {
    if (!documentToDelete) return;
    setIsDeletingDocument(true);
    try {
      await onDeleteDocument(documentToDelete.id);
      toast.success(tCommon('toasts.documentDeleted'));
      setDocumentToDelete(null);
    } catch (error) {
      toast.error(tCommon('toasts.failedToDeleteDocument'));
    } finally {
      setIsDeletingDocument(false);
    }
  }, [documentToDelete, onDeleteDocument, tCommon]);

  // Get display label for selected filter
  const getFilterLabel = useCallback((filter: typeof documentFilter): string => {
    if (filter === 'all') return tDoc('dashboard.filterAll');
    if (filter === 'owned') return tDoc('dashboard.filterMy');
    if (filter === 'personal') return tDoc('dashboard.filterPersonal');
    if (filter === 'shared') return tDoc('dashboard.filterShared');
    if (filter === 'organizational') return tDoc('dashboard.filterOrganizational');
    const org = organizations.find(o => o.id === filter);
    return org ? org.name : tDoc('dashboard.filterAll');
  }, [organizations, tDoc]);

  const handleCreateDocumentSubmit = useCallback(
    async (
      title: string,
      description?: string,
      contributors?: string[],
      options?: Parameters<DocumentDashboardProps['onCreateDocument']>[3],
      ownershipType?: 'personal' | 'shared' | 'organizational',
      organizationId?: string
    ) => {
      await Promise.resolve(onCreateDocument(title, description, contributors, options, ownershipType, organizationId));
    },
    [onCreateDocument]
  );

  const openCreateDialog = useCallback(() => setIsCreateDialogOpen(true), [setIsCreateDialogOpen]);
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDocumentFilter('all');
    setContentTypeFilter('documents');
    setStatusFilter('all');
  }, []);
  const handleDeleteDialogClose = useCallback((open: boolean) => {
    if (!open) setDocumentToDelete(null);
  }, []);

  if (isLoading) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage)}>
        <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
          <div className="mb-6">
            <div className="animate-pulse bg-muted h-8 w-48 rounded mb-2"></div>
            <div className="animate-pulse bg-muted h-4 w-64 rounded"></div>
          </div>
          <LoadingState isLoading={true} mode="skeleton" skeletonVariant="card" skeletonCount={5}>
            <div />
          </LoadingState>
        </div>
      </div>
    );
  }

  if (documentsError) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage, 'flex items-center justify-center p-4')}>
        <ErrorState
          variant="full-page"
          message={documentsError}
          onRetry={onRetry}
        />
      </div>
    );
  }

  // Show welcome tour for new users
  if (showWelcome) {
    return (
      <Welcome
        currentUser={currentUser}
        onCreateDocument={handleWelcomeCreateDocument}
        onDismiss={handleWelcomeDismiss}
      />
    );
  }

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn('max-w-4xl mx-auto', SPACING.layout.shrinkContent, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <div className={cn(SPACING.section.margin, SPACING.content.gap, 'min-w-0')}>
          <DocumentFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            contentTypeFilter={contentTypeFilter}
            onContentTypeFilterChange={setContentTypeFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            documentFilter={documentFilter}
            onDocumentFilterChange={setDocumentFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            hasHierarchy={hasHierarchy}
            filteredCount={filteredDocuments.length}
            organizations={organizations}
            getFilterLabel={getFilterLabel}
          />
          {canCreateInCurrentContext && (
            <DocumentDashboardCreateSection
              isOpen={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
              onSubmit={handleCreateDocumentSubmit}
              currentUser={currentUser}
              currentOrganizationId={currentOrganizationId}
              organizations={organizations}
              experienceLevel={experienceLevel}
              trackDocument={trackDocument}
              createLabel={tDoc('newDocument')}
            />
          )}
        </div>

        {currentOrganizationId && (
          <ProposalsOverview
            proposals={proposalsData.proposals}
            loading={proposalsData.loading}
            error={proposalsData.error}
            onRetry={proposalsData.refresh}
            onVote={proposalsData.vote}
            onRefresh={proposalsData.refresh}
            organizationId={currentOrganizationId}
            currentUserId={currentUser.id}
            fetchFullProposalData={proposalsData.fetchFullProposalData}
            fullProposalData={proposalsData.fullProposalData}
            showProposals={showProposals}
            onToggleShowProposals={setShowProposals}
          />
        )}

        <div className="min-w-0">
          {filteredDocuments.length === 0 ? (
            <EmptyState
              icon={<Icon name="FileText" className="h-16 w-16" />}
              title={
                contentTypeFilter === 'minutes'
                  ? tDoc('noMeetingMinutes', { defaultValue: 'No meeting minutes' })
                  : searchQuery || documentFilter !== 'all' || contentTypeFilter !== 'documents' || statusFilter !== 'all'
                    ? tDoc('dashboard.noDocumentsFound')
                    : tDoc('dashboard.noDocumentsYet')
              }
              description={
                contentTypeFilter === 'minutes'
                  ? tDoc('noMeetingMinutesMatchFilters', { defaultValue: 'No meeting minutes match your filters.' })
                  : searchQuery || documentFilter !== 'all' || contentTypeFilter !== 'documents' || statusFilter !== 'all'
                    ? tDoc('dashboard.noDocumentsFoundDescription')
                    : tDoc('dashboard.noDocumentsYetDescription')
              }
              action={
                !searchQuery && documentFilter === 'all' && contentTypeFilter === 'documents' && statusFilter === 'all' ? (
                  canCreateInCurrentContext ? (
                    <Button onClick={openCreateDialog} className="gap-2">
                      <Icon name="Plus" className="h-4 w-4" />
                      {tDoc('dashboard.createFirstDocument')}
                    </Button>
                  ) : undefined
                ) : (searchQuery || documentFilter !== 'all' || contentTypeFilter !== 'documents' || statusFilter !== 'all') ? (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    className="gap-2"
                  >
                    {tDoc('dashboard.clearFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : viewMode === 'tree' && hasHierarchy && contentTypeFilter !== 'minutes' ? (
            <DocumentTreeView
              documents={governanceDocuments}
              onSelectDocument={onSelectDocument}
              searchQuery={searchQuery}
            />
          ) : (
            <DocumentListView
              contentTypeFilter={contentTypeFilter}
              governanceDocuments={governanceDocuments}
              meetingMinutes={meetingMinutes}
              organizations={organizations}
              currentUserId={currentUser.id}
              onSelectDocument={onSelectDocument}
            />
          )}
        </div>

        <DocumentDeleteDialog
          documentToDelete={documentToDelete}
          isDeletingDocument={isDeletingDocument}
          onConfirm={confirmDeleteDocument}
          onOpenChange={handleDeleteDialogClose}
          confirmMessage={documentToDelete ? tCommon('confirm.deleteDocument', { title: documentToDelete.title }) : ''}
        />
      </div>
    </div>
  );
}
