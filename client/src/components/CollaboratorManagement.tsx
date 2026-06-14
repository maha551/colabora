import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Document, User, DocumentCollaborator, Organization } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Switch } from "./ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Icon } from "./ui/Icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { toast } from "sonner";
import { documentsApi, organizationsApi, ApiError } from "../lib/api";
import { DocumentUpdate } from "../hooks/useWebSocket";
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from "./ui/utils";
import { useOrganizationWebSocket, OrganizationUpdate } from "../hooks/useOrganizationWebSocket";
import { logger } from '../lib/logger';
import { useDocumentStore } from '../stores/useDocumentStore';
import { getUserColor } from '../lib/userColors';

interface CollaboratorManagementProps {
  document: Document;
  currentUser: User;
  onCollaboratorAdded?: (user: User) => void;
  onCollaboratorRemoved?: (userId: string) => void;
  children: React.ReactNode; // The trigger button
  realTimeUpdatesEnabled?: boolean;
  queuedUpdatesCount?: number;
  queuedUpdates?: DocumentUpdate[];
  onToggleRealTimeUpdates?: (enabled: boolean) => void;
  onApplyQueuedUpdates?: () => void;
  organization?: Organization | null; // Organization data for organizational documents
}

export function CollaboratorManagement({
  document,
  currentUser,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  children,
  realTimeUpdatesEnabled = true,
  queuedUpdatesCount = 0,
  queuedUpdates = [],
  onToggleRealTimeUpdates,
  onApplyQueuedUpdates,
  organization: organizationProp,
}: CollaboratorManagementProps) {
  const { t } = useTranslation('common');
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [updatesBreakdownOpen, setUpdatesBreakdownOpen] = useState(false);
  const [collaboratorToRemove, setCollaboratorToRemove] = useState<DocumentCollaborator | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(organizationProp || null);
  const [loadingOrganization, setLoadingOrganization] = useState(false);

  const isOrganizationalDocument = document.ownershipType === 'organizational' && document.organizationId;

  // Fetch organization data if not provided and document is organizational
  useEffect(() => {
    const fetchOrganization = async () => {
      if (isOrganizationalDocument && !organization && !loadingOrganization) {
        setLoadingOrganization(true);
        try {
          const response = await organizationsApi.getOrganization(document.organizationId!);
          setOrganization(response.organization);
        } catch (error) {
          logger.error('Failed to fetch organization for collaborator management:', error);
        } finally {
          setLoadingOrganization(false);
        }
      }
    };

    fetchOrganization();
  }, [isOrganizationalDocument, document.organizationId, organization, loadingOrganization]);

  // Update organization when prop changes
  useEffect(() => {
    if (organizationProp) {
      setOrganization(organizationProp);
    }
  }, [organizationProp]);

  // Subscribe to organization WebSocket updates for member changes and adoption votes
  const handleOrganizationUpdate = (update: OrganizationUpdate) => {
    if (update.organizationId !== document.organizationId) return;

    if (update.eventType === 'organization-vote-completed') {
      const data = update.data as { voteId?: string; targetDocumentId?: string };
      const affectsCurrentDocument =
        data.targetDocumentId === document.id ||
        (document.amendmentAdoptionVoteId && data.voteId === document.amendmentAdoptionVoteId);
      if (affectsCurrentDocument && document.id) {
        documentsApi
          .getDocument(document.id)
          .then((res) => {
            if (res.document) {
              useDocumentStore.getState().setDocument(res.document);
            }
            useDocumentStore.getState().incrementAgreedViewRefreshKey();
          })
          .catch((error) => {
            logger.error('Failed to refresh document after org vote completed:', error);
          });
      }
    }

    if (update.eventType === 'member-added' || update.eventType === 'member-removed') {
      // Refresh organization data to get updated members list
      if (document.organizationId) {
        organizationsApi.getOrganization(document.organizationId)
          .then(response => {
            setOrganization(response.organization);
          })
          .catch(error => {
            logger.error('Failed to refresh organization after member change:', error);
          });
      }
    }
  };

  // Get auth token from localStorage for WebSocket
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

  // Subscribe to organization WebSocket updates
  useOrganizationWebSocket({
    organizationId: isOrganizationalDocument ? document.organizationId! : null,
    userId: currentUser?.id || null,
    authToken,
    onOrganizationUpdate: handleOrganizationUpdate,
  });

  // Get available users based on document type
  const availableUsers = useMemo(() => {
    if (isOrganizationalDocument && organization) {
      // For organizational documents, use organization members
      const existingUserIds = [
        ...document.collaborators.filter(c => c.user).map(c => c.user.id)
      ];

      // Get active organization members who are not already collaborators
      const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
      return activeMembers
        .filter(member => !existingUserIds.includes(member.userId))
        .map(member => ({
          id: member.userId,
          name: member.user?.name || member.userId,
          email: member.user?.email || '',
        }));
    } else {
      // For personal/shared documents, use email invitations (no demo users)
      return [];
    }
  }, [isOrganizationalDocument, organization, document.collaborators, document.owner.id]);
  // For organizational documents, owner is the organization, not a user
  // For personal/shared documents, check if user is owner
  const isOwner = document.ownershipType !== 'organizational' && document.owner.id === currentUser.id;
  const isOrganizationOwner = document.ownershipType === 'organizational' && document.owner.type === 'organization';

  // Group queued updates by type
  const groupedUpdates = queuedUpdates.reduce((acc, update) => {
    const type = update.eventType;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Helper to get icon name and label for update type
  const getUpdateTypeInfo = (eventType: string) => {
    switch (eventType) {
      case 'comment':
        return { iconName: 'MessageSquare', label: 'Comments', color: COLORS.status.info };
      case 'proposal':
        return { iconName: 'FileText', label: 'Proposals', color: 'text-[var(--badge-purple-text)]' };
      case 'vote':
      case 'document-vote':
        return { iconName: 'ThumbsUp', label: 'Votes', color: COLORS.status.success };
      case 'paragraph':
      case 'paragraph-created':
      case 'paragraph-updated':
        return { iconName: 'FileEdit', label: 'Paragraph changes', color: COLORS.status.active };
      default:
        return { iconName: 'Clock', label: eventType, color: 'text-muted-foreground' };
    }
  };

  const handleInviteCollaborator = async () => {
    if (!inviteEmail.trim()) {
      toast.error(t('collaborator.pleaseEnterEmail'));
      return;
    }

    const emailToInvite = inviteEmail.trim();
    
    setIsInviting(true);
    try {
      const response = await documentsApi.inviteCollaborators(document.id, [emailToInvite.trim()]);
      if (response.failed && response.failed > 0) {
        const errorMsg = response.failedEmails?.[0]?.error || 'Failed to send invitation';
        toast.error(errorMsg);
      } else {
        toast.success(t('collaborator.invitationSentTo', { email: emailToInvite.trim() }));
        setInviteEmail('');
        if (onCollaboratorAdded) {
          onCollaboratorAdded({} as User);
        }
      }
    } catch (error: unknown) {
      logger.error('Failed to invite collaborator:', error);
      
      // Extract better error message from ApiError
      let errorMessage = "Failed to invite collaborator";
      if (error instanceof ApiError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = (collaborator: DocumentCollaborator) => {
    setCollaboratorToRemove(collaborator);
  };

  const confirmRemoveCollaborator = async () => {
    if (!collaboratorToRemove) return;
    const userName = collaboratorToRemove.user.name || collaboratorToRemove.user.email || 'this user';
    setIsRemoving(true);
    try {
      await documentsApi.removeCollaborator(document.id, collaboratorToRemove.user.id);
      toast.success(t('collaborator.removedFromDocument', { name: userName }));

      if (onCollaboratorRemoved) {
        onCollaboratorRemoved(collaboratorToRemove.user.id);
      }
      setCollaboratorToRemove(null);
    } catch (error: unknown) {
      logger.error('Failed to remove collaborator:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to remove collaborator";
      toast.error(errorMessage);
    } finally {
      setIsRemoving(false);
    }
  };

  const CollaboratorItem = ({ collaborator, isOwner: collabIsOwner, canRemove }: {
    collaborator: DocumentCollaborator;
    isOwner: boolean;
    canRemove: boolean;
  }) => (
    <div className={cn("flex items-center justify-between p-2 border border-border", RADIUS.control)}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Avatar className="h-6 w-6 flex-shrink-0 border-2" style={{ borderColor: getUserColor(collaborator.user.id) }}>
          <AvatarImage src={collaborator.user.avatar} />
          <AvatarFallback className="text-xs">
            {collaborator.user.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate">{collaborator.user.name}</span>
            {isOwner && (
              <Badge variant="default" className={`${COLORS.statusBg.warning} ${COLORS.status.warning} text-xs px-1 py-0 h-4`}>
                <Icon name="Crown" className="h-2 w-2 mr-1" />
                Owner
              </Badge>
            )}
            {collabIsOwner && (
              <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                <Icon name="Users" className="h-2 w-2 mr-1" />
                Collab
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{collaborator.user.email}</p>
        </div>
      </div>

      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation(); // Prevent dropdown from closing
            // Debug logging removed
            handleRemoveCollaborator(collaborator);
          }}
          className={`${COLORS.status.error} hover:opacity-90 ${COLORS.statusBg.error} h-6 w-6 p-0 flex-shrink-0`}
        >
          <Icon name="Trash2" className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Icon name="Users" className="h-4 w-4" />
              <span className="font-medium text-sm">Manage Collaborators</span>
            </div>

            {/* Current Collaborators */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-foreground">
                Current Collaborators ({document.collaborators.length + (document.owner.type !== 'organization' ? 1 : 0)})
              </h4>

              {/* Owner - Only show if owner is a user, not an organization */}
              {document.owner.type !== 'organization' && (
                <CollaboratorItem
                  collaborator={{
                    user: document.owner,
                    createdAt: document.createdAt
                  }}
                  isOwner={true}
                  canRemove={false}
                />
              )}

              {/* Collaborators */}
              {document.collaborators.map((collaborator) => (
                <CollaboratorItem
                  key={collaborator.id}
                  collaborator={collaborator}
                  isOwner={false}
                  canRemove={isOwner} // Only owner can remove collaborators
                />
              ))}
            </div>

            {/* Invite New Collaborator */}
            {isOwner && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <Icon name="UserPlus" className="h-4 w-4" />
                  {isOrganizationalDocument ? 'Add Collaborator' : 'Invite Collaborator'}
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <div className="flex gap-2">
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder={t('collaborator.placeholderEmail')}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleInviteCollaborator()}
                      className="h-8"
                    />
                    <Button
                      onClick={handleInviteCollaborator}
                      disabled={isInviting || !inviteEmail.trim()}
                      size="sm"
                    >
                      {isInviting && <Icon name="Loader2" className="h-3 w-3 mr-1 animate-spin" />}
                      {isInviting ? (isOrganizationalDocument ? "Adding..." : "Sending...") : (isOrganizationalDocument ? "Add" : "Invite")}
                    </Button>
                  </div>
                  {!isOrganizationalDocument && (
                    <p className="text-xs text-muted-foreground">
                      An invitation email will be sent to this address.
                    </p>
                  )}
                </div>

                {/* Quick invite for organization members (organizational documents only) */}
                {isOrganizationalDocument && availableUsers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Quick Add (Organization Members)</Label>
                    <div className="grid grid-cols-1 gap-1">
                      {availableUsers.slice(0, 4).map((user) => (
                        <Button
                          key={user.id}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInviteEmail(user.email);
                            setTimeout(() => handleInviteCollaborator(), 100);
                          }}
                          disabled={isInviting}
                          className="justify-start text-xs h-7"
                        >
                          <Icon name="Mail" className="h-3 w-3 mr-2" />
                          {user.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isOwner && (
              <div className={cn(RADIUS.panel, "p-3 border", COLORS.statusBg.info, "border-[var(--status-active-border)]")}>
                <p className={`text-sm ${COLORS.status.info}`}>
                  Only the document owner can manage collaborators.
                </p>
              </div>
            )}

            {isOwner && isOrganizationalDocument && availableUsers.length === 0 && (
              <div className={cn("p-3 bg-muted border border-border", RADIUS.panel)}>
                <p className="text-sm text-muted-foreground">
                  All organization members are already collaborators on this document.
                </p>
              </div>
            )}

            {/* Real-time Updates Toggle Section */}
            {onToggleRealTimeUpdates && (
              <>
                <div className="border-t pt-4 mt-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {realTimeUpdatesEnabled ? (
                          <Icon name="Wifi" className={cn('h-4 w-4', COLORS.status.success)} />
                        ) : (
                          <Icon name="WifiOff" className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium text-foreground">Real-time updates</span>
                      </div>
                      <Switch
                        checked={realTimeUpdatesEnabled}
                        onCheckedChange={onToggleRealTimeUpdates}
                        className="h-4 w-7"
                        aria-label={t('collaborator.toggleRealtimeUpdates')}
                      />
                    </div>

                    {!realTimeUpdatesEnabled && queuedUpdatesCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onToggleRealTimeUpdates(true);
                          onApplyQueuedUpdates?.();
                        }}
                        className="w-full gap-2 text-xs"
                      >
                        <span>{queuedUpdatesCount}</span>
                        <span>updates available</span>
                      </Button>
                    )}

                    {/* Queued Updates Breakdown - Collapsible */}
                    {!realTimeUpdatesEnabled && queuedUpdates.length > 0 && (
                      <Collapsible open={updatesBreakdownOpen} onOpenChange={setUpdatesBreakdownOpen}>
                        <CollapsibleTrigger className={cn("w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted hover:bg-muted/80 border border-border transition-colors", RADIUS.panel)}>
                          <div className="flex items-center gap-2 text-sm text-foreground">
                            <span className="font-medium">{queuedUpdates.length} update{queuedUpdates.length !== 1 ? 's' : ''} queued</span>
                            <span className="text-xs text-muted-foreground">since focus mode enabled</span>
                          </div>
                          {updatesBreakdownOpen ? (
                            <Icon name="ChevronUp" className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Icon name="ChevronDown" className="h-4 w-4 text-muted-foreground" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className={cn("px-3 py-2 bg-card border border-border space-y-2", RADIUS.panel)}>
                            {Object.entries(groupedUpdates)
                              .sort(([, a], [, b]) => b - a)
                              .map(([eventType, count]) => {
                                const { iconName, label, color } = getUpdateTypeInfo(eventType);
                                return (
                                  <div key={eventType} className="flex items-center justify-between gap-3 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <Icon name={iconName} className={`h-4 w-4 ${color}`} />
                                      <span className="text-sm text-foreground">{label}</span>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">
                                      {count}
                                    </Badge>
                                  </div>
                                );
                              })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!collaboratorToRemove} onOpenChange={(open) => !open && setCollaboratorToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove collaborator?</AlertDialogTitle>
            <AlertDialogDescription>
              {collaboratorToRemove
                ? t('confirm.removeCollaborator', {
                    name: collaboratorToRemove.user.name || collaboratorToRemove.user.email || 'this user',
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveCollaborator}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
