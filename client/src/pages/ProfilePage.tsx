import { User, Organization } from '../types';
import type { PendingInvitationItem } from '../hooks/usePendingInvitations';
import { ProfileIdentityForm } from '../components/profile/ProfileIdentityForm';
import { PendingInvitationsSection } from '../components/profile/PendingInvitationsSection';
import { ProfileMembershipsSection } from '../components/profile/ProfileMembershipsSection';
import { LoadingState } from '../components/ui/LoadingState';
import { SPACING } from '../lib/designSystem';
import { cn } from '../components/ui/utils';

interface ProfilePageProps {
  user: User;
  onProfileUpdate: (updatedUser: User) => void;
  isLoading?: boolean;
  organizations?: Organization[];
  organizationsLoading?: boolean;
  onRefreshOrganizations?: () => void | Promise<void>;
  pendingInvitations?: PendingInvitationItem[];
  onAcceptInvitationById?: (invitationId: string) => void | Promise<void>;
  onDeclineInvitationById?: (invitationId: string) => void | Promise<void>;
  onRefreshPendingInvitations?: () => void | Promise<void>;
}

export function ProfilePage({
  user,
  onProfileUpdate,
  isLoading = false,
  organizations = [],
  organizationsLoading = false,
  onRefreshOrganizations,
  pendingInvitations = [],
  onAcceptInvitationById,
  onDeclineInvitationById,
  onRefreshPendingInvitations,
}: ProfilePageProps) {
  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <LoadingState isLoading={isLoading || organizationsLoading} mode="skeleton" skeletonVariant="text" skeletonCount={5}>
          <PendingInvitationsSection
            invitations={pendingInvitations}
            onAcceptInvitationById={onAcceptInvitationById}
            onDeclineInvitationById={onDeclineInvitationById}
            onRefreshPendingInvitations={onRefreshPendingInvitations}
          />
          <ProfileMembershipsSection
            userId={user.id}
            organizations={organizations}
            onOrganizationsChanged={onRefreshOrganizations}
          />
          <ProfileIdentityForm user={user} onProfileUpdate={onProfileUpdate} />
        </LoadingState>
      </div>
    </div>
  );
}
