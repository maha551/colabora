import { useState, useCallback, useEffect, useRef, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent } from '../ui/tabs';

import { Organization, User, Document } from '../../types';
import { useOrganizationPermissions } from '../../hooks/useOrganizationPermissions';
import { useOrganizationData } from '../../hooks/useOrganizationData';
import { useRepresentativeActions } from '../../hooks/useRepresentativeActions';
import { useOrganizationWebSocket, OrganizationUpdate } from '../../hooks/useOrganizationWebSocket';
import { useDebouncedTab } from '../../hooks/useDebouncedTab';
import { ErrorBoundary } from '../ErrorBoundary';
import { toast } from 'sonner';
import { organizationsApi, invalidateCache } from '../../lib/api';

import { GovernanceTab } from './tabs/GovernanceTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MembersTab } from './tabs/MembersTab';
import { TransparencyTab } from './tabs/TransparencyTab';
import { DashboardTab } from './tabs/DashboardTab';
import { RepresentativesTab } from './tabs/RepresentativesTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { SchedulingTab } from './tabs/SchedulingTab';
import { MeetingsTab } from './tabs/MeetingsTab';
import { NewMeetingPage } from './NewMeetingPage';
import { SPACING, NAVIGATION } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { logger } from '../../lib/logger';
import { DEFAULT_ORGANIZATION_COLOR } from '../../lib/constants';
import { getOrgFolderTabColors } from '../../utils/colorUtils';
import { useTheme } from '../../hooks/useTheme';
import { parseHash, buildHash, getCurrentHash, isOrgTab, type OrgTab } from '../../lib/hashRoutes';
import { getPrimaryGroup, getGroupChildren } from '../../lib/orgTabGroups';
import type { Meeting } from '../../lib/api/types/meetings';
import {
  OrgFolderPanel,
  OrgFolderPrimaryNav,
  OrgFolderSecondaryNav,
} from './navigation';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack?: () => void;
  onNavigateToHash?: (hash: string) => void;
  onSelectDocument?: (document: Document) => void;
  onBrandingUpdate?: (organizationId: string) => void;
  onNavigateToMemberProfile?: (userId: string, organizationId?: string) => void;
  onNavigateToActivity?: () => void;
  onNavigateToDocument?: (documentId: string) => void;
  onAddComment?: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => Promise<void>;
}

export function OrganizationManagement({
  organization,
  currentUser,
  onBack,
  onNavigateToHash,
  onSelectDocument,
  onBrandingUpdate,
  onNavigateToMemberProfile,
  onNavigateToActivity,
  onNavigateToDocument,
  onAddComment
}: OrganizationManagementProps) {
  const { t } = useTranslation('organization');
  const { resolvedTheme } = useTheme();
  // Use debounced tab to prevent excessive API requests when rapidly switching tabs
  const [activeTab, debouncedTab, setActiveTab, setActiveTabImmediate] = useDebouncedTab('dashboard', 200);
  const [governanceRefreshTrigger, setGovernanceRefreshTrigger] = useState(0);
  const [autoOpenGovernanceRules, setAutoOpenGovernanceRules] = useState(false);
  // Track current request to prevent race conditions when organization changes
  const currentOrgRequestRef = useRef<string | null>(null);
  const loadingOrgRef = useRef<boolean>(false);
  
  // Maintain local organization state that can be updated immediately
  const [localOrganization, setLocalOrganization] = useState<Organization>(organization);
  // When navigating to a meeting right after creating it (e.g. from scheduling poll), pass it so the page can show immediately without waiting for getMeeting
  const [lastCreatedMeeting, setLastCreatedMeeting] = useState<Meeting | null>(null);

  // Sync local organization state with prop changes
  useEffect(() => {
    setLocalOrganization(organization);
    // Reset the request tracker when organization changes
    currentOrgRequestRef.current = null;
  }, [organization]);

  // React to hash changes: sync activeTab from URL (so Back returns to correct tab). Use immediate setter so Schedule tab loads without delay.
  useEffect(() => {
    const checkHash = () => {
      const hash = getCurrentHash();
      const parsed = parseHash(hash);
      if (parsed.view === 'organization' && parsed.organizationId === organization?.id && parsed.orgTab && isOrgTab(parsed.orgTab)) {
        setActiveTabImmediate(parsed.orgTab);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    window.addEventListener('popstate', checkHash);
    return () => {
      window.removeEventListener('hashchange', checkHash);
      window.removeEventListener('popstate', checkHash);
    };
  }, [organization?.id, setActiveTabImmediate]);

  // Load full organization details (including members) if missing
  useEffect(() => {
    // Check if members are missing - this happens when organization comes from list endpoint
    const needsFullDetails = !localOrganization.members || 
      (Array.isArray(localOrganization.members) && localOrganization.members.length === 0 && 
       localOrganization.representatives && localOrganization.representatives.length > 0);
    
    // Track the organization ID for this request
    const requestedOrgId = localOrganization.id;
    
    // Skip if already fetching this specific organization
    if (needsFullDetails && currentOrgRequestRef.current !== requestedOrgId) {
      currentOrgRequestRef.current = requestedOrgId;
      organizationsApi.getOrganization(requestedOrgId)
        .then(response => {
          // Only update state if this is still the current organization
          // This prevents race conditions when organization changes during the request
          if (currentOrgRequestRef.current === requestedOrgId) {
            setLocalOrganization(prev => {
              // Double-check the ID matches to prevent stale updates
              if (prev.id !== requestedOrgId) {
                return prev;
              }
              return {
                ...prev,
                ...response.organization,
                // Preserve any local updates that might have happened
                brandingColor: response.organization.brandingColor ?? prev.brandingColor,
                brandingLogoUrl: response.organization.brandingLogoUrl ?? prev.brandingLogoUrl,
                brandingTitle: response.organization.brandingTitle ?? prev.brandingTitle,
                brandingBannerUrl: response.organization.brandingBannerUrl ?? prev.brandingBannerUrl,
                iconSet: response.organization.iconSet ?? prev.iconSet,
                fontFamily: response.organization.fontFamily ?? prev.fontFamily,
              };
            });
          }
        })
        .catch(error => {
          logger.error('Failed to load full organization details:', error);
          // Don't show toast for this - it's a background operation
        })
        .finally(() => {
          // Clear the request tracker only if this was the current request
          if (currentOrgRequestRef.current === requestedOrgId) {
            currentOrgRequestRef.current = null;
          }
        });
    }
  }, [localOrganization.id, localOrganization.members, localOrganization.representatives]);

  // Use our custom hooks for data and permissions
  // Use debouncedTab for data loading to prevent excessive requests from rapid tab switching
  const { data, actions } = useOrganizationData(localOrganization.id, debouncedTab);
  const representativeActionsEnabled = debouncedTab === 'dashboard' || debouncedTab === 'representatives' || debouncedTab === 'transparency';
  const { data: representativeData, actions: representativeActions } = useRepresentativeActions(
    localOrganization.id,
    data.documents,
    {
      enabled: representativeActionsEnabled,
      organization: localOrganization,
      governanceRules: data.governanceRules,
      onRefreshGovernance: actions.refreshGovernance,
    }
  );
  const permissions = useOrganizationPermissions(currentUser, localOrganization, data.governanceRules);
  const orgFolderAccent = localOrganization.brandingColor || DEFAULT_ORGANIZATION_COLOR;
  const orgFolderTabStyle = useMemo(() => {
    const colors = getOrgFolderTabColors(orgFolderAccent, resolvedTheme === 'dark');
    return {
      '--org-folder-accent': colors.accent,
      '--org-folder-tab-inactive': colors.tabInactive,
      '--org-folder-tab-inactive-border': colors.tabInactiveBorder,
      '--org-folder-tab-highlight': colors.tabHighlight,
      '--org-folder-shelf': colors.shelf,
    } as CSSProperties;
  }, [orgFolderAccent, resolvedTheme]);

  // Handle organization WebSocket updates
  const handleOrganizationUpdate = useCallback((update: OrganizationUpdate) => {
    if (update.organizationId !== localOrganization.id) return;

    const repActionsEnabled = debouncedTab === 'dashboard' || debouncedTab === 'representatives';

    switch (update.eventType) {
      case 'governance-rules-updated':
        toast.success(t('governanceRulesUpdated'));
        // Invalidate governance cache before refreshing to ensure fresh data
        invalidateCache(`/api/governance/${localOrganization.id}/governance-rules`);
        invalidateCache(`/api/governance/${localOrganization.id}/rule-proposals`);
        actions.refreshGovernance();
        setGovernanceRefreshTrigger(prev => prev + 1);
        break;
      case 'election-created':
        toast.success(t('newElectionCreated'));
        // Invalidate elections cache before refreshing
        invalidateCache(`/api/governance/${localOrganization.id}/elections`);
        actions.refreshElections();
        break;
      case 'election-updated':
      case 'election-completed':
        // Invalidate elections cache before refreshing
        invalidateCache(`/api/governance/${localOrganization.id}/elections`);
        actions.refreshElections();
        break;
      case 'member-added':
        toast.success(t('memberAdded'));
        // Invalidate organization and related caches before refreshing
        invalidateCache(`/api/organizations/${localOrganization.id}`);
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        // Refresh organization details to get updated members list
        if (!loadingOrgRef.current) {
          loadingOrgRef.current = true;
          organizationsApi.getOrganization(localOrganization.id)
            .then(response => {
              setLocalOrganization(prev => ({
                ...prev,
                members: response.organization.members,
                representatives: response.organization.representatives,
              }));
            })
            .catch(error => {
              logger.error('Failed to refresh organization after member added:', error);
            })
            .finally(() => {
              loadingOrgRef.current = false;
            });
        }
        actions.refreshAll(); // Refresh all to update members list
        break;
      case 'member-removed':
        toast.success(t('memberRemoved'));
        // Invalidate organization and related caches before refreshing
        invalidateCache(`/api/organizations/${localOrganization.id}`);
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        // Refresh organization details to get updated members list
        if (!loadingOrgRef.current) {
          loadingOrgRef.current = true;
          organizationsApi.getOrganization(localOrganization.id)
            .then(response => {
              setLocalOrganization(prev => ({
                ...prev,
                members: response.organization.members,
                representatives: response.organization.representatives,
              }));
            })
            .catch(error => {
              logger.error('Failed to refresh organization after member removed:', error);
            })
            .finally(() => {
              loadingOrgRef.current = false;
            });
        }
        actions.refreshAll(); // Refresh all to update members list
        break;
      case 'member-invited': {
        const invitationData = update.data as { invitationCount?: number } | undefined;
        toast.success(t('invitationsSent', { count: invitationData?.invitationCount || 1 }));
        break;
      }
      case 'rule-proposal-created':
      case 'rule-proposal-approved':
      case 'rule-proposal-rejected':
      case 'rule-proposal-declined':
      case 'rule-proposal-expired':
      case 'rule-proposal-vote-cast':
      case 'rule-proposal-voting-started':
        // Invalidate governance cache before refreshing to ensure fresh data
        invalidateCache(`/api/governance/${localOrganization.id}/governance-rules`);
        invalidateCache(`/api/governance/${localOrganization.id}/rule-proposals`);
        actions.refreshGovernance();
        setGovernanceRefreshTrigger(prev => prev + 1);
        if (repActionsEnabled) {
          representativeActions.refreshRuleProposals();
        }
        break;
      case 'overview-pin-updated': {
        const pinData = update.data as {
          overviewPinnedEventId?: string | null;
          overviewPinnedAt?: string | null;
          overviewPinnedByUserId?: string | null;
          overviewPinnedEvent?: import('../../lib/api/calendar').CalendarEvent | null;
        };
        setLocalOrganization((prev) => ({
          ...prev,
          overviewPinnedEventId: pinData.overviewPinnedEventId ?? null,
          overviewPinnedAt: pinData.overviewPinnedAt ?? null,
          overviewPinnedByUserId: pinData.overviewPinnedByUserId ?? null,
          overviewPinnedEvent: pinData.overviewPinnedEvent ?? null,
        }));
        break;
      }
      case 'branding-updated': {
        toast.success(t('brandingUpdated'));
        // Call onBrandingUpdate BEFORE state update to avoid stale closure issue
        // Use update.organizationId since we already verified it matches localOrganization.id
        if (onBrandingUpdate) {
          onBrandingUpdate(update.organizationId);
        }
        // Update local organization state immediately with branding/design data from WebSocket
        const brandingData = update.data as { brandingColor?: string; brandingLogoUrl?: string; brandingTitle?: string; brandingBannerUrl?: string; iconSet?: string; fontFamily?: string } | undefined;
        if (brandingData) {
          setLocalOrganization(prev => ({
            ...prev,
            brandingColor: brandingData.brandingColor !== undefined ? brandingData.brandingColor : prev.brandingColor,
            brandingLogoUrl: brandingData.brandingLogoUrl !== undefined ? brandingData.brandingLogoUrl : prev.brandingLogoUrl,
            brandingTitle: brandingData.brandingTitle !== undefined ? brandingData.brandingTitle : prev.brandingTitle,
            brandingBannerUrl: brandingData.brandingBannerUrl !== undefined ? brandingData.brandingBannerUrl : prev.brandingBannerUrl,
            iconSet: brandingData.iconSet !== undefined ? brandingData.iconSet as 'lucide' | 'tabler' | 'heroicons' : prev.iconSet,
            fontFamily: brandingData.fontFamily !== undefined ? brandingData.fontFamily as 'inter' | 'work-sans' | 'poppins' | 'merriweather' : prev.fontFamily,
          }));
        }
        break;
      }
      case 'organization-vote-created':
      case 'organization-vote-completed':
      case 'organization-vote-cast':
      case 'vote-declined':
        if (repActionsEnabled) {
          representativeActions.refreshOrganizationVotes();
        }
        break;
      case 'structure-proposal-vote':
      case 'structure-proposal-completed':
        if (repActionsEnabled) {
          representativeActions.refreshStructureProposals();
        }
        break;
      case 'tree-proposal-vote':
      case 'document-tree-proposal-completed':
        if (repActionsEnabled) {
          representativeActions.refreshTreeProposals();
        }
        break;
      case 'deletion-vote-completed':
        if (repActionsEnabled) {
          representativeActions.refreshStructureProposals();
          representativeActions.refreshTreeProposals();
        }
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        actions.refreshDocuments();
        break;
      case 'document-updated': {
        const updateData = update.data as { amendmentsOpen?: boolean } | undefined;
        if (updateData && 'amendmentsOpen' in updateData) {
          invalidateCache(`/api/documents/organization/${localOrganization.id}`);
          actions.refreshDocuments();
        }
        break;
      }
      case 'document-vote':
      case 'proposal-vote':
      case 'proposal-comment':
      case 'structure-proposal-comment':
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        actions.refreshDocuments();
        break;
      case 'document-created':
        // Refresh documents list to show newly created document
        // Invalidate documents cache before refreshing
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        invalidateCache('/api/documents');
        actions.refreshDocuments();
        break;
      case 'document-status-changed': {
        // Refresh documents list to show updated status
        // Invalidate documents cache before refreshing
        invalidateCache(`/api/documents/organization/${localOrganization.id}`);
        invalidateCache('/api/documents');
        const statusData = update.data as { documentId: string; oldStatus: string; newStatus: string };
        if (statusData.documentId) {
          invalidateCache(`/api/documents/${statusData.documentId}`);
        }
        actions.refreshDocuments();
        toast.success(t('documentStatusChanged', { oldStatus: statusData.oldStatus, newStatus: statusData.newStatus }));
        break;
      }
      case 'representative-resignation-pending':
        // Refresh organization to update representatives list and pending resignations
        invalidateCache(`/api/organizations/${localOrganization.id}`);
        invalidateCache(`/api/governance/${localOrganization.id}/representatives/pending-resignations`);
        invalidateCache(`/api/governance/${localOrganization.id}/elections`);
        // Refresh organization details
        if (!loadingOrgRef.current) {
          loadingOrgRef.current = true;
          organizationsApi.getOrganization(localOrganization.id)
            .then(response => {
              setLocalOrganization(prev => ({
                ...prev,
                representatives: response.organization.representatives,
              }));
            })
            .catch(error => {
              logger.error('Failed to refresh organization after resignation:', error);
            })
            .finally(() => {
              loadingOrgRef.current = false;
            });
        }
        actions.refreshAll();
        break;
      case 'representative-resignation-finalized':
        // Refresh organization to update representatives list after resignation is finalized
        invalidateCache(`/api/organizations/${localOrganization.id}`);
        invalidateCache(`/api/governance/${localOrganization.id}/representatives/pending-resignations`);
        invalidateCache(`/api/governance/${localOrganization.id}/elections`);
        // Refresh organization details
        if (!loadingOrgRef.current) {
          loadingOrgRef.current = true;
          organizationsApi.getOrganization(localOrganization.id)
            .then(response => {
              setLocalOrganization(prev => ({
                ...prev,
                representatives: response.organization.representatives,
                members: response.organization.members,
              }));
            })
            .catch(error => {
              logger.error('Failed to refresh organization after resignation finalized:', error);
            })
            .finally(() => {
              loadingOrgRef.current = false;
            });
        }
        actions.refreshAll();
        toast.success(t('resignationFinalized'));
        break;
      default:
        // Debug logging removed - use logger if needed
        // logger.debug('Unhandled organization update:', update.eventType);
    }
  }, [localOrganization.id, actions, onBrandingUpdate, debouncedTab, representativeActions, t]);

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

  // Derive full-page state from current URL at render (single source: parseHash). Aligns with pushState navigations (no hashchange) and avoids duplicate regex.
  const currentHash = getCurrentHash();
  const parsedOrg = parseHash(currentHash);
  const isOrgForThis = parsedOrg.view === 'organization' && parsedOrg.organizationId === localOrganization?.id;
  const isNewMeetingPage = isOrgForThis && parsedOrg.meetingId === 'new';
  const isMeetingPage = isOrgForThis && !!parsedOrg.meetingId && parsedOrg.meetingId !== 'new';
  const meetingPageMeetingId = isMeetingPage ? parsedOrg.meetingId! : null;
  const isPollPage = isOrgForThis && !!parsedOrg.pollId;
  const pollPagePollId = isPollPage ? parsedOrg.pollId! : null;

  const handleBackFromMeetingPage = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleBackFromPollPage = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const navigateToOrgTab = useCallback(
    (tab: OrgTab) => {
      setActiveTab(tab);
      if (onNavigateToHash) {
        onNavigateToHash(buildHash({ view: 'organization', organizationId: localOrganization.id, orgTab: tab }));
      }
    },
    [localOrganization.id, onNavigateToHash, setActiveTab]
  );

  const handleNavigateToMeeting = useCallback(
    (meetingId: string, preferEmbed = false) => {
      if (preferEmbed) {
        try {
          localStorage.setItem('meeting.video.preference', 'embed');
        } catch {
          /* ignore */
        }
      }
      const hash = `#/organization/${localOrganization.id}/meetings/${meetingId}`;
      if (onNavigateToHash) onNavigateToHash(hash);
      else if (typeof window !== 'undefined') window.location.hash = hash;
    },
    [localOrganization.id, onNavigateToHash]
  );

  const handleNavigateToPoll = useCallback(
    (pollId: string) => {
      const hash = `#/organization/${localOrganization.id}/schedule/polls/${pollId}`;
      if (onNavigateToHash) onNavigateToHash(hash);
      else if (typeof window !== 'undefined') window.location.hash = hash;
    },
    [localOrganization.id, onNavigateToHash]
  );

  const handlePinOverviewEvent = useCallback(
    async (eventId: string) => {
      try {
        const result = await organizationsApi.setOverviewPin(localOrganization.id, eventId);
        setLocalOrganization((prev) => ({
          ...prev,
          overviewPinnedEventId: result.overviewPinnedEventId,
          overviewPinnedAt: result.overviewPinnedAt,
          overviewPinnedByUserId: result.overviewPinnedByUserId,
          overviewPinnedEvent: result.overviewPinnedEvent,
        }));
        toast.success(t('dashboardPinSuccess'));
      } catch (error) {
        logger.error('Failed to pin overview event:', error);
        toast.error(t('dashboardPinError'));
        throw error;
      }
    },
    [localOrganization.id, t]
  );

  const handleUnpinOverviewEvent = useCallback(async () => {
    try {
      const result = await organizationsApi.setOverviewPin(localOrganization.id, null);
      setLocalOrganization((prev) => ({
        ...prev,
        overviewPinnedEventId: result.overviewPinnedEventId,
        overviewPinnedAt: result.overviewPinnedAt,
        overviewPinnedByUserId: result.overviewPinnedByUserId,
        overviewPinnedEvent: result.overviewPinnedEvent,
      }));
      toast.success(t('dashboardUnpinSuccess'));
    } catch (error) {
      logger.error('Failed to unpin overview event:', error);
      toast.error(t('dashboardPinError'));
      throw error;
    }
  }, [localOrganization.id, t]);

  const handlePollCreatedFromNewMeeting = useCallback(
    (poll: { id: string }) => {
      onNavigateToHash?.(`#/organization/${localOrganization.id}/schedule/polls/${poll.id}`);
      setActiveTab('schedule');
    },
    [localOrganization.id, onNavigateToHash]
  );

  // Clear lastCreatedMeeting once we've passed it to the meeting page (so we don't reuse it if user navigates away and back). Must run before any conditional return to satisfy Rules of Hooks.
  useEffect(() => {
    if (meetingPageMeetingId && lastCreatedMeeting?.id === meetingPageMeetingId) {
      setLastCreatedMeeting(null);
    }
  }, [meetingPageMeetingId, lastCreatedMeeting?.id]);

  if (isNewMeetingPage) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage)}>
        <div className={cn(SPACING.layout.contentMax, SPACING.layout.shrinkContent, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
          <ErrorBoundary>
            <NewMeetingPage
              organizationId={localOrganization.id}
              onBack={handleBackFromMeetingPage}
              showCreateViaPoll={permissions.isRepresentative}
              onPollCreated={handlePollCreatedFromNewMeeting}
              onNavigateToHash={onNavigateToHash}
            />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  if (isMeetingPage && meetingPageMeetingId) {
    return (
      <div className={cn('flex h-full min-h-0 w-full flex-col', SPACING.layout.containPage)}>
        {/* Full-width wrapper; no bottom padding — immersive meeting shell hides AppFooter */}
        <div className={cn('flex h-full min-h-0 w-full min-w-0 flex-1 flex-col', SPACING.page.x)}>
          <ErrorBoundary>
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <MeetingsTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                isActive
                initialMeetingId={meetingPageMeetingId}
                initialMeeting={meetingPageMeetingId && lastCreatedMeeting?.id === meetingPageMeetingId ? lastCreatedMeeting : null}
                onClearInitialMeetingId={() => {}}
                onBack={handleBackFromMeetingPage}
                onNavigateToHash={onNavigateToHash}
                onNavigateToDocument={onNavigateToDocument}
              />
            </div>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  if (isPollPage && pollPagePollId) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage)}>
        <div className={cn(SPACING.layout.contentMax, SPACING.layout.shrinkContent, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
          <ErrorBoundary>
            <div className={cn(SPACING.section.gap, 'flex flex-col')}>
              <SchedulingTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                isActive
                detailOnlyMode
                initialPollId={pollPagePollId}
                onBack={handleBackFromPollPage}
                onMeetingCreated={(meeting) => {
                  setLastCreatedMeeting(meeting);
                  onNavigateToHash?.(`#/organization/${localOrganization.id}/meetings/${meeting.id}`);
                }}
              />
            </div>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  const activeOrgTab: OrgTab = isOrgTab(activeTab) ? activeTab : 'dashboard';
  const activeGroup = getPrimaryGroup(activeOrgTab);
  const groupChildren = getGroupChildren(activeGroup, permissions.isRepresentative);
  const showSecondaryTabs = groupChildren.length > 1;

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.layout.shrinkContent, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
      <ErrorBoundary>
        {/* Back button is handled by AppHeader - no need for duplicate here */}
        
        {/* Navigation Tabs (tab change updates URL for Back support) */}
        <Tabs
          value={activeTab}
          onValueChange={(tab) => {
            if (isOrgTab(tab)) {
              navigateToOrgTab(tab);
            }
          }}
        >
          <div className={NAVIGATION.folderTabs.shell} style={orgFolderTabStyle}>
            <OrgFolderPrimaryNav
              activeGroup={activeGroup}
              isRepresentative={permissions.isRepresentative}
              onNavigate={navigateToOrgTab}
            />
            <div className={NAVIGATION.folderTabs.shelf} aria-hidden />
            <OrgFolderPanel
              secondaryNav={
                showSecondaryTabs ? (
                  <OrgFolderSecondaryNav tabs={groupChildren} />
                ) : null
              }
            >

          {/* Tab Content */}

          <TabsContent value="dashboard" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <DashboardTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                elections={data.elections}
                documents={data.documents}
                documentsLoading={data.loading.documents}
                electionsLoading={data.loading.elections}
                ruleProposals={representativeData.ruleProposals}
                organizationVotes={representativeData.organizationVotes}
                structureProposals={representativeData.structureProposals}
                treeProposals={representativeData.treeProposals}
                deletionStatuses={representativeData.deletionStatuses}
                representativeLoading={representativeData.loading}
                onRefreshRuleProposals={representativeActions.refreshRuleProposals}
                onRefreshOrganizationVotes={representativeActions.refreshOrganizationVotes}
                onRefreshStructureProposals={representativeActions.refreshStructureProposals}
                onRefreshTreeProposals={representativeActions.refreshTreeProposals}
                onCompleteOrganizationVote={representativeActions.completeOrganizationVote}
                onCreateElection={(): void => {
                  // Navigate to governance tab where election creation is available
                  setActiveTab('governance');
                }}
                onNavigateToDocuments={() => setActiveTab('documents')}
                onNavigateToMembers={() => setActiveTab('members')}
                onNavigateToGovernance={() => {
                  setActiveTab('governance');
                  setAutoOpenGovernanceRules(true);
                }}
                onNavigateToActivity={onNavigateToActivity}
                onNavigateToActivityFeed={
                  onNavigateToHash
                    ? (orgId) => onNavigateToHash(buildHash({ view: 'activity', activityOrganizationId: orgId }))
                    : onNavigateToActivity
                }
                onNavigateToHash={onNavigateToHash}
                onNavigateToDocument={onNavigateToDocument}
                onAddComment={onAddComment}
                onRefreshDocuments={actions.refreshDocuments}
                onRefreshElections={actions.refreshElections}
                onRefreshGovernance={actions.refreshGovernance}
                isActive={debouncedTab === 'dashboard'}
                onNavigateToSchedule={() => navigateToOrgTab('schedule')}
                onNavigateToMeeting={handleNavigateToMeeting}
                onNavigateToPoll={handleNavigateToPoll}
                onNavigateToRepresentatives={() => navigateToOrgTab('representatives')}
                onPinOverviewEvent={permissions.isRepresentative ? handlePinOverviewEvent : undefined}
                onUnpinOverviewEvent={permissions.isRepresentative ? handleUnpinOverviewEvent : undefined}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="governance" className="mt-0 flex-none outline-none">
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
                autoOpenGovernanceRules={autoOpenGovernanceRules}
                onNavigateToMemberProfile={onNavigateToMemberProfile}
                onGovernanceRulesOpened={() => setAutoOpenGovernanceRules(false)}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="documents" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <DocumentsTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                documents={data.documents}
                isLoading={data.loading.documents}
                error={data.errors.documents}
                viewMode="governance"
                onCreateDocument={actions.createDocument}
                onSelectDocument={onSelectDocument}
                onRefreshDocuments={actions.refreshDocuments}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="minutes" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <DocumentsTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                governanceRules={data.governanceRules}
                documents={data.documents}
                isLoading={data.loading.documents}
                error={data.errors.documents}
                viewMode="minutes"
                onCreateDocument={actions.createDocument}
                onSelectDocument={onSelectDocument}
                onRefreshDocuments={actions.refreshDocuments}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="members" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <MembersTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                onUpdate={handleUpdate}
                onLeaveSuccess={onBack}
                onNavigateToMemberProfile={onNavigateToMemberProfile}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="transparency" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <TransparencyTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                analytics={data.analytics}
                elections={data.elections}
                isLoading={data.loading.analytics}
                organizationVotes={representativeData.organizationVotes}
                organizationVotesLoading={representativeData.loading.organizationVotes}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0 flex-none outline-none">
            <ErrorBoundary>
              <ScheduleTab
                organization={localOrganization}
                currentUser={currentUser}
                permissions={permissions}
                isActive={activeTab === 'schedule'}
                onNavigateToDocument={onNavigateToDocument}
                onNavigateToRepresentatives={permissions.isRepresentative && onNavigateToHash ? () => onNavigateToHash(buildHash({ view: 'organization', organizationId: localOrganization.id, orgTab: 'representatives' })) : undefined}
                onNavigateToHash={onNavigateToHash}
                pinnedEventId={localOrganization.overviewPinnedEventId}
                onPinEvent={permissions.isRepresentative ? handlePinOverviewEvent : undefined}
                onUnpinEvent={permissions.isRepresentative ? handleUnpinOverviewEvent : undefined}
              />
            </ErrorBoundary>
          </TabsContent>

          {permissions.isRepresentative && (
            <TabsContent value="representatives" className="mt-0 flex-none outline-none">
              <ErrorBoundary>
                <RepresentativesTab
                  organization={localOrganization}
                  currentUser={currentUser}
                  permissions={permissions}
                  governanceRules={data.governanceRules}
                  elections={data.elections}
                  documents={data.documents}
                  ruleProposals={representativeData.ruleProposals}
                  organizationVotes={representativeData.organizationVotes}
                  structureProposals={representativeData.structureProposals}
                  treeProposals={representativeData.treeProposals}
                  deletionStatuses={representativeData.deletionStatuses}
                  representativeLoading={representativeData.loading}
                  onRefreshRepresentativeActions={representativeActions.refreshAll}
                  onRefreshRuleProposals={representativeActions.refreshRuleProposals}
                  onRefreshOrganizationVotes={representativeActions.refreshOrganizationVotes}
                  onRefreshStructureProposals={representativeActions.refreshStructureProposals}
                  onRefreshTreeProposals={representativeActions.refreshTreeProposals}
                  onCompleteOrganizationVote={representativeActions.completeOrganizationVote}
                  onRefreshGovernance={actions.refreshGovernance}
                  onRefreshElections={actions.refreshElections}
                  onRefreshDocuments={actions.refreshDocuments}
                  onCreateElection={actions.createElection}
                  onNavigateToMemberProfile={onNavigateToMemberProfile}
                  onNavigateToDocument={onNavigateToDocument}
                  onNavigateToGovernance={() => {
                    setActiveTab('governance');
                    setAutoOpenGovernanceRules(true);
                  }}
                  governanceRefreshTrigger={governanceRefreshTrigger}
                />
              </ErrorBoundary>
            </TabsContent>
          )}
            </OrgFolderPanel>
          </div>
        </Tabs>
      </ErrorBoundary>
      </div>
    </div>
  );
}
