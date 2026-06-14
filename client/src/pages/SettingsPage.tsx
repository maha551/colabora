import { User } from '../types';
import { AccountSettingsForm } from '../components/profile/AccountSettingsForm';
import { LoadingState } from '../components/ui/LoadingState';
import { SPACING } from '../lib/designSystem';
import { cn } from '../components/ui/utils';

interface SettingsPageProps {
  user: User;
  onProfileUpdate: (updatedUser: User) => void;
  hasOrganizations?: boolean;
  isLoading?: boolean;
}

export function SettingsPage({ user, onProfileUpdate, hasOrganizations = false, isLoading = false }: SettingsPageProps) {
  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <LoadingState isLoading={isLoading} mode="skeleton" skeletonVariant="text" skeletonCount={5}>
          <AccountSettingsForm
            user={user}
            onProfileUpdate={onProfileUpdate}
            hasOrganizations={hasOrganizations}
          />
        </LoadingState>
      </div>
    </div>
  );
}
