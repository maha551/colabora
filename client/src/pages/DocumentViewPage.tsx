import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, User, HeadingLevel, Organization, Paragraph, Proposal, DocumentCollaborator } from '../types';
import type { Comment as AppComment } from '../types';
import { organizationsApi, documentsApi } from '../lib/api';
import { DocumentEditor } from '../components/DocumentEditor';
import { AgreedDocument } from '../components/AgreedDocument';
import { MinutesDocumentView } from '../components/MinutesDocumentView';
import { replaceHash } from '../lib/hashRoutes';
import { UnifiedHistoryTimeline } from '../components/UnifiedHistoryTimeline';
import { CollaboratorManagement } from '../components/CollaboratorManagement';
import { TabPanelFilters } from '../components/layout/TabPanelFilters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Icon } from '../components/ui/Icon';
import { OrganizationAvatar } from '../components/shared/OrganizationAvatar';
import { resolveOrganizationAvatarData } from '../utils/organizationUtils';
import { DocumentLifecycleStepper } from '../components/DocumentLifecycleStepper';
import { isDocumentReadOnly } from '../lib/documentLifecycle';
// @ts-expect-error - JSX file without types
import OrganizationalDocumentVoting from '../components/OrganizationalDocumentVoting';
import { DocumentDeletionProposal } from '../components/DocumentDeletionProposal';
import { ExportDialog } from '../components/ExportDialog';
import { StructureProposalCardWrapper } from '../components/StructureProposalCardWrapper';
import { StructureProposalMode } from '../components/StructureProposalMode';
import { StructureProposal } from '../types';
import { useTimezone } from '../hooks/useTimezone';
import { useScreenSize } from '../contexts/ScreenSizeContext';
import { DocumentSidebar } from '../components/DocumentSidebar';
import { LoadingState } from '../components/ui/LoadingState';
import { cn } from '../components/ui/utils';
import { logger } from '../lib/logger';
import { SPACING, HIERARCHY, COLORS, NAVIGATION, RADIUS } from '../lib/designSystem';
import { getUserColor } from '../lib/userColors';
import { getVotingEligibleCollaborators } from '../utils/documentHelpers';
import { useAuthStore, type AuthState } from '../stores/useAuthStore';
import { useDocumentStore, type DocumentState } from '../stores/useDocumentStore';
import { useVotingStore, type VotingState } from '../stores/useVotingStore';
import { useRealTimeStore, type RealTimeState } from '../stores/useRealTimeStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';

interface DocumentViewPageProps {
  structureProposals: StructureProposal[];
  showStructureProposalMode: boolean;
  onAddSuggestion: (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
    }
  ) => Promise<void>;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onComment: (suggestionId: string, text: string, parentId?: string) => Promise<void>;
  onEditComment?: (suggestionId: string, commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (suggestionId: string, commentId: string) => Promise<void>;
  onDeleteProposal?: (suggestionId: string) => Promise<void>;
  onLoadMoreComments?: (suggestionId: string, offset: number) => Promise<AppComment[]>;
  onUpvoteComment?: (suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => void;
  onAddElement: (
    elementType: 'heading' | 'paragraph',
    options?: {
      text?: string;
      title?: string;
      headingLevel?: HeadingLevel;
      order?: number;
    }
  ) => Promise<void>;
  onCollaboratorAdded: (user: User) => Promise<void>;
  onCollaboratorRemoved: (userId: string) => Promise<void>;
  onShareDocument?: () => void;
  onStructureProposalCompleted: (proposalId: string) => Promise<void>;
  onCreateStructureProposal: () => void;
  onCloseStructureProposalMode: () => void;
  refreshStructureProposals: () => void;
  onSelectDocument?: (document: Document) => void;
  onDeleteDocument?: (documentId: string) => Promise<void>;
  onApplyQueuedUpdates?: () => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
}

export function DocumentViewPage({
  structureProposals,
  showStructureProposalMode,
  onAddSuggestion,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onDeleteProposal,
  onLoadMoreComments,
  onUpvoteComment,
  onAddElement,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  onStructureProposalCompleted,
  onCreateStructureProposal,
  onCloseStructureProposalMode,
  refreshStructureProposals,
  onSelectDocument,
  onDeleteDocument,
  onApplyQueuedUpdates,
  onNavigateToOrganization,
  onNavigateToHash,
}: DocumentViewPageProps) {
  const { t } = useTranslation();
  const { formatDate } = useTimezone();
  const { isMobile, isTablet } = useScreenSize();
  const document = useDocumentStore((s: DocumentState) => s.document);
  const documentLoadKey = useDocumentStore((s: DocumentState) => s.documentLoadKey);
  const agreedViewRefreshKey = useDocumentStore((s: DocumentState) => s.agreedViewRefreshKey);
  const agreedDocument = useDocumentStore((s: DocumentState) => s.agreedDocument);
  const agreedDocumentId = useDocumentStore((s: DocumentState) => s.agreedDocumentId);
  const setAgreedDocument = useDocumentStore((s: DocumentState) => s.setAgreedDocument);
  const setDocument = useDocumentStore((s: DocumentState) => s.setDocument);
  const currentUser = useAuthStore((s: AuthState) => s.currentUser);
  const realTimeUpdatesEnabled = useRealTimeStore((s: RealTimeState) => s.realTimeUpdatesEnabled);
  const queuedUpdates = useRealTimeStore((s: RealTimeState) => s.queuedUpdates);
  const setRealTimeUpdatesEnabled = useRealTimeStore((s: RealTimeState) => s.setRealTimeUpdatesEnabled);
  const votingState = useVotingStore((s: VotingState) => s.votingState);
  const setVotingState = useVotingStore((s: VotingState) => s.setVotingState);
  const totalUsers = document ? getVotingEligibleCollaborators(document).length || 1 : 1;
  const queuedUpdatesCount = queuedUpdates.length;
  const [showDeleteDocumentConfirm, setShowDeleteDocumentConfirm] = useState(false);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [startingVoting, setStartingVoting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<{ proposed: boolean } | null>(null);
  const [proposingDeletion, setProposingDeletion] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'discussion' | 'agreed' | 'history'>(() =>
    isDocumentReadOnly(document) ? 'agreed' : 'discussion'
  );

  // Reset tab when switching documents; read-only docs always open on Agreed
  useEffect(() => {
    if (isDocumentReadOnly(document)) {
      setActiveTab('agreed');
    } else {
      setActiveTab('discussion');
    }
  }, [document?.id]);

  // Sync tab to Agreed when document becomes read-only (e.g. after vote or real-time status change)
  useEffect(() => {
    if (isDocumentReadOnly(document)) {
      setActiveTab('agreed');
    }
  }, [document?.status, document?.amendmentsOpen, document?.amendmentAdoptionVoteId]);

  // Get all collaborators (owner + collaborators) for structure proposal vote display
  const allCollaborators = useMemo(() =>
    document ? getVotingEligibleCollaborators(document) : [],
    [document]
  );
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [organizationDocuments, setOrganizationDocuments] = useState<Document[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // For mobile drawer only
  const [sidebarWidth, setSidebarWidth] = useState(0); // Track sidebar width to adjust padding
  const [loadingAgreedView, setLoadingAgreedView] = useState(false);
  const [agreedViewMode, setAgreedViewMode] = useState<'accepted' | 'amended'>('accepted');

  // Load agreed view when user switches to agreed tab or when refresh is triggered (lightweight endpoint)
  // Result is stored in document store so WebSocket can update it in-place
  useEffect(() => {
    const loadAgreedView = async () => {
      if ((activeTab === 'agreed' || isDocumentReadOnly(document)) && document?.id && currentUser) {
        setLoadingAgreedView(true);
        try {
          const response = await documentsApi.getAgreedDocument(document.id, { view: agreedViewMode });
          if (response.document) {
            setAgreedDocument(response.document, document.id);
          }
        } catch (error) {
          logger.error('Failed to load agreed view:', error);
          if (document) setAgreedDocument(document, document.id);
        } finally {
          setLoadingAgreedView(false);
        }
      }
    };

    loadAgreedView();
  }, [activeTab, document?.id, document, currentUser, agreedViewRefreshKey, agreedViewMode, setAgreedDocument]);

  // Reset agreed document when document changes
  useEffect(() => {
    setAgreedDocument(null);
  }, [document?.id, setAgreedDocument]);

  // Fetch organization data and check if user is a representative
  useEffect(() => {
    const fetchOrganization = async () => {
      if (document?.organizationId && currentUser) {
        try {
          const response = await organizationsApi.getOrganization(document.organizationId);
          setOrganization(response.organization);
          // Check if current user is a representative
          const userIsRepresentative = response.organization.representatives?.includes(currentUser.id) || false;
          setIsRepresentative(userIsRepresentative);
        } catch (error) {
          logger.error('Failed to fetch organization:', error);
          setIsRepresentative(false);
        }
      } else {
        setIsRepresentative(false);
      }
    };

    fetchOrganization();
  }, [document?.organizationId, currentUser?.id]);

  // Fetch organization documents for sidebar
  useEffect(() => {
    const fetchOrganizationDocuments = async () => {
      if (document?.organizationId && document?.ownershipType === 'organizational' && currentUser) {
        try {
          const response = await organizationsApi.getOrganizationDocuments(document.organizationId);
          setOrganizationDocuments(response.documents || []);
        } catch (error) {
          logger.error('Failed to fetch organization documents:', error);
          setOrganizationDocuments([]);
        }
      } else {
        setOrganizationDocuments([]);
      }
    };

    fetchOrganizationDocuments();
  }, [document?.organizationId, document?.ownershipType, currentUser?.id]);

  // Handle document selection from sidebar
  const handleSelectDocument = useCallback(
    async (doc: Document) => {
      if (onSelectDocument) {
        onSelectDocument(doc);
      }
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [onSelectDocument, isMobile]
  );

  const totalSuggestions = useMemo(
    () =>
      document?.paragraphs?.reduce(
        (sum: number, p: Paragraph) => sum + (p.proposals?.length || 0),
        0
      ) ?? 0,
    [document?.paragraphs]
  );

  const acceptedSuggestions = useMemo(
    () =>
      document?.paragraphs?.reduce((sum: number, p: Paragraph) => {
        return sum + (p.proposals?.filter((s: Proposal) => s.approved).length || 0);
      }, 0) ?? 0,
    [document?.paragraphs]
  );

  const isMinutesDocument = document?.documentKind === 'meeting_minutes';

  const handleNavigateToMeeting = useCallback(
    (hash: string) => {
      if (onNavigateToHash) {
        onNavigateToHash(hash);
      } else {
        replaceHash(hash);
      }
    },
    [onNavigateToHash],
  );

  const handleNavigateToDocumentFromMinutes = useCallback(
    (documentId: string) => {
      if (onSelectDocument && organizationDocuments.length > 0) {
        const target = organizationDocuments.find((d) => d.id === documentId);
        if (target) {
          void handleSelectDocument(target);
          return;
        }
      }
      replaceHash(`#/document/${documentId}`);
    },
    [onSelectDocument, organizationDocuments, handleSelectDocument],
  );

  const showSidebar = document?.ownershipType === 'organizational' && organization && onSelectDocument;

  const handleDeleteDocument = useCallback(() => {
    if (!onDeleteDocument || !document?.id) return;
    setShowDeleteDocumentConfirm(true);
  }, [onDeleteDocument, document?.id]);

  const confirmDeleteDocument = useCallback(async () => {
    if (!onDeleteDocument || !document?.id) return;
    setIsDeletingDocument(true);
    try {
      await onDeleteDocument(document.id);
      toast.success(t('toasts.documentDeleted'));
      setShowDeleteDocumentConfirm(false);
    } catch (error) {
      logger.error('Failed to delete document:', error);
      toast.error(t('toasts.failedToDeleteDocument'));
    } finally {
      setIsDeletingDocument(false);
    }
  }, [onDeleteDocument, document?.id, t]);

  const refreshDeletionStatus = useCallback(async () => {
    if (!document?.id || document?.ownershipType !== 'organizational') {
      setDeletionStatus(null);
      return;
    }
    try {
      const status = await documentsApi.getDeletionStatus(document.id);
      setDeletionStatus(status);
    } catch (error) {
      logger.error('Failed to load deletion status:', error);
      setDeletionStatus(null);
    }
  }, [document?.id, document?.ownershipType]);

  useEffect(() => {
    void refreshDeletionStatus();
  }, [refreshDeletionStatus]);

  const handleProposeDeletion = useCallback(async () => {
    if (!document?.id) return;
    if (!confirm(t('common:confirm.proposeDeletion'))) {
      return;
    }
    setProposingDeletion(true);
    try {
      await documentsApi.proposeDeletion(document.id);
      toast.success(t('documents:deletionProposalCreated'));
      await refreshDeletionStatus();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('errors:tryAgain');
      toast.error(errorMessage);
    } finally {
      setProposingDeletion(false);
    }
  }, [document?.id, refreshDeletionStatus, t]);

  if (!document) {
    return null;
  }

  const documentIsFinalized = isDocumentReadOnly(document);
  const showAmendedPreview =
    document?.status === 'agreed' &&
    (!!document.amendmentsOpen || !!document.amendmentAdoptionVoteId);

  const canProposeRestructuring =
    !isMinutesDocument &&
    !showStructureProposalMode &&
    document.structureProposalsEnabled &&
    (document.status !== 'agreed' || document.amendmentsOpen) &&
    document.status !== 'rejected' &&
    (document.ownershipType === 'organizational' ||
      (document.ownershipType === 'personal' &&
        currentUser &&
        document.ownerId === currentUser.id));

  const canProposeDeletion =
    !isMinutesDocument &&
    document.ownershipType === 'organizational' &&
    isRepresentative &&
    deletionStatus?.proposed !== true;

  const canDeletePersonal =
    !isMinutesDocument &&
    document.ownershipType === 'personal' &&
    currentUser &&
    document.ownerId === currentUser.id &&
    !!onDeleteDocument;

  const showManageMenu =
    currentUser && (canProposeRestructuring || canProposeDeletion || canDeletePersonal);

  const canExportDocument = document.status === 'agreed';
  const showManageSection = currentUser && (showManageMenu || canExportDocument);

  return (
    <div 
      className={cn('flex', SPACING.layout.containPage, SPACING.layout.shrinkContent)}
      style={{
        minHeight:
          'calc(100dvh - var(--header-height, 3.5rem) - var(--mobile-chrome-bottom, 0px))',
        position: 'relative',
      }}
    >
      {/* Document Sidebar - Only for organizational documents, hidden on mobile */}
      {showSidebar && !isMobile && (
        <DocumentSidebar
          organization={organization}
          documents={organizationDocuments}
          currentDocument={document}
          onSelectDocument={handleSelectDocument}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onWidthChange={setSidebarWidth}
        />
      )}

      {/* Main Content - Flex layout with sidebar */}
      <main 
        className={cn('bg-background flex-1 transition-all duration-300 ease-in-out overflow-x-hidden mx-auto', SPACING.layout.shrinkContent)}
        style={{
          minHeight:
            'calc(100dvh - var(--header-height, 3.5rem) - var(--mobile-chrome-bottom, 0px))',
          maxWidth: !isMobile ? '56rem' : undefined,
        }}
      >
        {/* Responsive content container - 56rem to match other views */}
        <div
          className={cn(
            'w-full',
            SPACING.layout.shrinkContent,
            SPACING.page.x,
            SPACING.page.top,
            SPACING.page.y,
            isMobile ? 'max-w-full mx-auto min-w-0' : SPACING.layout.contentMax
          )}
        style={
          isMobile
            ? undefined
            : {
                paddingLeft: (() => {
                  const isExpanded = sidebarWidth > 56;
                  return isExpanded
                    ? isTablet
                      ? '0.75rem'
                      : '1rem'
                    : isTablet
                      ? '1.5rem'
                      : '2rem';
                })(),
                paddingRight: isTablet ? '1.5rem' : '2rem',
              }
        }>
        {/* Document lifecycle stepper */}
        {document?.ownershipType === 'organizational' && (
          <DocumentLifecycleStepper document={document} />
        )}

        {/* Organizational Document Components - Voting (hidden when finalized) */}
        {document?.ownershipType === 'organizational' && !isMinutesDocument && !documentIsFinalized && (
          <div className={SPACING.section.margin}>
            {/* Proposal: allow starting voting manually (do not wait for scheduler) */}
            {document?.status === 'proposal' && (
              <div className={cn("border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex flex-wrap items-center justify-between gap-3", RADIUS.panel)}>
                <p className="text-sm text-muted-foreground">
                  {t('documents:view.proposalPhaseHint', { defaultValue: 'This document is in the proposal phase. When the proposal deadline passes, it will move to voting automatically. You can also start voting now if you have permission.' })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={startingVoting || !document?.id}
                  onClick={async () => {
                    if (!document?.id) return;
                    setStartingVoting(true);
                    try {
                      await documentsApi.startVoting(document.id);
                      toast.success(t('organization:voteApprovedAndOpened', { defaultValue: 'Voting started. Document is now in voting phase.' }));
                      const response = await documentsApi.getDocument(document.id);
                      if (response?.document) setDocument(response.document);
                    } catch (err) {
                      logger.error('Start document voting failed', { documentId: document.id, err });
                      toast.error(err instanceof Error ? err.message : t('errors:tryAgain'));
                    } finally {
                      setStartingVoting(false);
                    }
                  }}
                  className="border-amber-500/60 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                >
                  {startingVoting ? (
                    <>
                      <span className={cn("animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent mr-2", RADIUS.pill)} aria-hidden />
                      {t('organization:startingVoting', { defaultValue: 'Starting…' })}
                    </>
                  ) : (
                    <>
                      <Icon name="Vote" className="h-4 w-4 mr-2" />
                      {t('organization:startVoting', { defaultValue: 'Start voting' })}
                    </>
                  )}
                </Button>
              </div>
            )}
            {/* Only show voting component when document is in voting status (not proposal) */}
            {document?.status === 'voting' && (
              <OrganizationalDocumentVoting 
                document={document} 
                user={currentUser}
                onVoteCast={() => {
                  // Reload document to get updated voting data
                  // This will be handled by parent component
                }}
              />
            )}
          </div>
        )}

        {/* Meeting minutes: timeline-powered read-only protocol view */}
        {isMinutesDocument && document.organizationId && (
          <div className={SPACING.section.margin}>
            <MinutesDocumentView
              document={document}
              organizationId={document.organizationId}
              onNavigateToMeeting={handleNavigateToMeeting}
              onNavigateToDocument={handleNavigateToDocumentFromMinutes}
              onNavigateToHash={onNavigateToHash ?? replaceHash}
            />
          </div>
        )}

        {/* Document Actions Section - Tabs and Collaborators */}
        {!isMinutesDocument && (
        <div className={SPACING.content.gap}>
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "discussion" | "agreed" | "history")}>
            {!documentIsFinalized && (
            <div className={cn(NAVIGATION.tabs.wrapper, NAVIGATION.tabs.wrapperInner)}>
              <TabsList className={isMobile ? 'w-full' : isTablet ? 'w-full md:w-auto' : 'w-full sm:w-auto'}>
                <TabsTrigger value="discussion" className={cn(NAVIGATION.tabs.triggerResponsive, 'flex-1 sm:flex-none')} aria-label={`Discussion tab with ${totalSuggestions} proposals`}>
                  <Icon name="Edit3" className={cn(isMobile ? NAVIGATION.tabs.iconMobile : NAVIGATION.tabs.iconDesktop)} aria-hidden="true" />
                  <span aria-hidden="true">{t('documents:view.tabDiscussion')}</span>
                  {totalSuggestions > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs" aria-label={`${totalSuggestions} proposals`}>
                      {totalSuggestions}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="agreed" className={cn(NAVIGATION.tabs.triggerResponsive, 'flex-1 sm:flex-none')} aria-label={`Agreed tab with ${acceptedSuggestions} approved paragraphs`}>
                  <Icon name="FileText" className={cn(isMobile ? NAVIGATION.tabs.iconMobile : NAVIGATION.tabs.iconDesktop)} aria-hidden="true" />
                  <span aria-hidden="true">{t('documents:view.tabAgreed')}</span>
                  {acceptedSuggestions > 0 && (
                    <Badge variant="default" className={cn('ml-1 text-xs', COLORS.statusBadge.success)} aria-label={`${acceptedSuggestions} approved paragraphs`}>
                      {acceptedSuggestions}
                    </Badge>
                  )}
                </TabsTrigger>
                {document?.structureProposalsEnabled && 
                 document.status !== 'agreed' && 
                 document.status !== 'rejected' && (
                  <TabsTrigger value="history" className={cn(NAVIGATION.tabs.triggerResponsive, 'flex-1 sm:flex-none')} aria-label="Document structure history">
                    <Icon name="Clock" className={cn(isMobile ? NAVIGATION.tabs.iconMobile : NAVIGATION.tabs.iconDesktop)} aria-hidden="true" />
                    <span aria-hidden="true">{t('documents:view.tabHistory')}</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
            )}

          {/* Finalized reading header / agreed status */}
          {(documentIsFinalized || activeTab === 'agreed') && (
            <div className={cn('text-center', SPACING.section.margin)}>
              {document?.status === 'agreed' && (
                <Badge variant="outline" className={cn('mb-3 gap-1', COLORS.statusBadge.success)}>
                  <Icon name="CheckCircle2" className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('documents:lifecycleStepper.adopted')}
                </Badge>
              )}
              {document?.amendmentAdoptionVoteId && (
                <div className={cn('mb-3 p-3 text-sm border rounded-md', COLORS.statusBg.info, COLORS.border.standard)}>
                  <p>{t('documents:amendmentAdoptionVoteBanner')}</p>
                  {onNavigateToOrganization && document.organizationId && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 mt-1"
                      onClick={() => onNavigateToOrganization(document.organizationId!)}
                    >
                      {t('documents:viewVote')}
                    </Button>
                  )}
                </div>
              )}
              <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground', SPACING.content.inline)}>
                <span className="flex items-center gap-1">
                  <Icon name="Clock" className="h-4 w-4" />
                  {t('documents:view.lastUpdated')}: {formatDate(document.updatedAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="CheckCircle2" className={cn('h-4 w-4', COLORS.status.success)} />
                  {document.paragraphs.filter((p: Paragraph) => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '').length} {t('documents:view.sectionsAgreed')} ({document.paragraphs.filter((p: Paragraph) => p.history && p.history.length > 0).length} {t('documents:view.modified')})
                </span>
              </div>
            </div>
          )}

            {/* Collaborators Display - Integrated with tabs */}
            {currentUser && (
            <TabPanelFilters align="centered" withMarginBottom={false}>
              <CollaboratorManagement
                document={document}
                currentUser={currentUser}
                onCollaboratorAdded={onCollaboratorAdded}
                onCollaboratorRemoved={onCollaboratorRemoved}
                realTimeUpdatesEnabled={realTimeUpdatesEnabled}
                organization={organization}
                queuedUpdatesCount={queuedUpdatesCount}
                queuedUpdates={queuedUpdates}
                onToggleRealTimeUpdates={setRealTimeUpdatesEnabled}
                onApplyQueuedUpdates={onApplyQueuedUpdates}
              >
                <div className="flex items-center gap-3 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <Icon name="Users" className="h-4 w-4 shrink-0" />
                  <div className="flex items-center -space-x-1 sm:-space-x-2 shrink-0">
                    {/* Owner */}
                    {document.owner.type === 'organization' ? (
                      <OrganizationAvatar
                        organization={resolveOrganizationAvatarData(organization, document.owner.name)}
                        size="sm"
                        className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white"
                      />
                    ) : (
                      <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2" style={{ borderColor: getUserColor(document.owner.id) }}>
                        <AvatarImage src={document.owner.avatar} alt={document.owner.name || 'Owner'} />
                        <AvatarFallback className={cn('text-xs', COLORS.statusBg.info, COLORS.status.info)}>
                          {document.owner.name ? document.owner.name.split(' ').map((n: string) => n[0]).join('') : '?'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {/* Collaborators */}
                    {document.collaborators.slice(0, 3).map((collaborator: DocumentCollaborator) => (
                      <Avatar key={collaborator.id} className="h-6 w-6 sm:h-8 sm:w-8 border-2" style={{ borderColor: getUserColor(collaborator.user.id) }}>
                        <AvatarImage src={collaborator.user.avatar} alt={collaborator.user.name} />
                        <AvatarFallback className="text-xs bg-muted text-foreground">
                          {collaborator.user.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {document.collaborators.length > 3 && (
                      <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                        <AvatarFallback className="text-xs bg-muted text-foreground">
                          +{document.collaborators.length - 3}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <span className="font-medium text-xs sm:text-sm ml-2">
                    {(document.collaborators.length || 0) + (document.owner.type !== 'organization' ? 1 : 0)} collab{(document.collaborators.length || 0) + (document.owner.type !== 'organization' ? 1 : 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </CollaboratorManagement>
            </TabPanelFilters>
            )}

            {/* Document Description */}
            {document?.ownershipType === 'organizational' && document?.description && (
              <div className={cn(SPACING.section.margin, 'text-center')}>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Description:</span> {document.description}
                </p>
              </div>
            )}

            {currentUser && !documentIsFinalized && (
            <TabsContent value="discussion" className={NAVIGATION.tabs.contentMargin}>
              <DocumentEditor
                key={documentLoadKey}
                document={document}
                totalUsers={totalUsers}
                currentUser={currentUser}
                onAddSuggestion={onAddSuggestion}
                onVote={onVote}
                onComment={onComment}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
                onDeleteProposal={onDeleteProposal}
                onLoadMoreComments={onLoadMoreComments}
                onUpvoteComment={onUpvoteComment}
                onAddElement={onAddElement}
                organization={organization}
                votingState={votingState}
                setVotingState={setVotingState}
              />
            </TabsContent>
            )}

            <TabsContent value="agreed" className={NAVIGATION.tabs.contentMargin}>
              <LoadingState isLoading={loadingAgreedView} mode="inline" className="flex justify-center py-12">
                <AgreedDocument
                  document={(agreedDocument && agreedDocumentId === document?.id ? agreedDocument : document) ?? document}
                  totalUsers={totalUsers}
                  organization={organization}
                  agreedViewMode={agreedViewMode}
                  onAgreedViewModeChange={showAmendedPreview ? setAgreedViewMode : undefined}
                  isRepresentative={isRepresentative}
                  onNavigateToOrganizationVotes={onNavigateToOrganization}
                />
              </LoadingState>
            </TabsContent>

            {document?.structureProposalsEnabled && 
             (document.status !== 'agreed' || document.amendmentsOpen) && 
             document.status !== 'rejected' && 
             currentUser && (
              <TabsContent value="history" className={NAVIGATION.tabs.contentMargin}>
                <UnifiedHistoryTimeline
                  document={document}
                  documentId={document.id}
                  organization={organization}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>
        )}

        {/* Structure Proposals Section - hidden when finalized; empty state only for users with manage rights */}
        {!documentIsFinalized &&
         document?.structureProposalsEnabled && 
         (document.status !== 'agreed' || document.amendmentsOpen) && 
         document.status !== 'rejected' &&
         (structureProposals.length > 0 || (showStructureProposalMode && canProposeRestructuring)) && (
          <div className={cn(HIERARCHY.majorSection)}>
            <div className="flex items-center gap-3 mb-6">
              <Icon name="Network" className="h-6 w-6 shrink-0" />
              <h2 className="text-xl font-semibold">Structure Proposals</h2>
              {!showStructureProposalMode && structureProposals.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {structureProposals.length}
                </Badge>
              )}
            </div>

            {/* Show the form inline when active (only users with manage rights can open it) */}
            {showStructureProposalMode && canProposeRestructuring && (
              <div className={SPACING.section.margin}>
                <StructureProposalMode
                  documentId={document.id}
                  paragraphs={document.paragraphs}
                  document={document}
                  onClose={onCloseStructureProposalMode}
                  onSuccess={() => {
                    onCloseStructureProposalMode();
                    refreshStructureProposals();
                  }}
                  inline={true}
                />
              </div>
            )}

            {/* Show proposals list when form is not active */}
            {!showStructureProposalMode && structureProposals.length > 0 && (
              <div className="space-y-6">
                {structureProposals.map((proposal) => (
                  <StructureProposalCardWrapper
                    key={proposal.id}
                    structureProposal={proposal}
                    documentId={document.id}
                    currentUser={currentUser!}
                    allCollaborators={allCollaborators}
                    onVote={refreshStructureProposals}
                    onComplete={() => onStructureProposalCompleted(proposal.id)}
                    canComplete={document.ownerId === currentUser?.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Document Deletion Proposal - voting status when deletion is proposed */}
        {document?.ownershipType === 'organizational' && deletionStatus?.proposed && (
          <div className={cn(HIERARCHY.majorSection)}>
            <DocumentDeletionProposal
              document={document}
              currentUser={currentUser}
              isRepresentative={isRepresentative}
              onDeletionProposed={() => {
                void refreshDeletionStatus();
              }}
              onDeletionCancelled={() => {
                void refreshDeletionStatus();
              }}
            />
          </div>
        )}

        {/* Manage document - bottom of page */}
        {showManageSection && (
          <div className={cn(HIERARCHY.majorSection, 'border-t pt-6')}>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canExportDocument && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExportDialogOpen(true)}
                  className="gap-2"
                >
                  <Icon name="Download" className="h-4 w-4" />
                  {t('documents:view.export', { defaultValue: 'Export' })}
                </Button>
              )}
              {showManageMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Icon name="MoreHorizontal" className="h-4 w-4" />
                      {t('documents:view.manageDocument')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canProposeRestructuring && (
                      <DropdownMenuItem onClick={onCreateStructureProposal}>
                        <Icon name="Network" className="h-4 w-4" />
                        {document.ownershipType === 'personal'
                          ? t('documents:view.restructureDocument')
                          : t('documents:view.proposeRestructuring')}
                      </DropdownMenuItem>
                    )}
                    {canProposeDeletion && (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={proposingDeletion}
                        onClick={() => void handleProposeDeletion()}
                      >
                        <Icon name="Trash2" className="h-4 w-4" />
                        {proposingDeletion
                          ? t('documents:view.proposeDeletionInProgress')
                          : t('documents:view.proposeDeletion')}
                      </DropdownMenuItem>
                    )}
                    {canProposeRestructuring && (canProposeDeletion || canDeletePersonal) && (
                      <DropdownMenuSeparator />
                    )}
                    {canDeletePersonal && (
                      <DropdownMenuItem variant="destructive" onClick={handleDeleteDocument}>
                        <Icon name="Trash2" className="h-4 w-4" />
                        {t('documents:view.deleteDocument')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      <ExportDialog
        document={document}
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
      />

      <AlertDialog open={showDeleteDocumentConfirm} onOpenChange={setShowDeleteDocumentConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              {document ? t('confirm.deleteDocument', { title: document.title }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingDocument}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDocument}
              disabled={isDeletingDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingDocument ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
