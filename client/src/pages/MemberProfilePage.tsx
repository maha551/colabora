import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MemberProfileResponse } from '../types';
import { MemberProfileView } from '../components/MemberProfileView';
import { authApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Icon } from '../components/ui/Icon';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { toast } from 'sonner';
import { SPACING } from '../lib/designSystem';
import { cn } from '../components/ui/utils';
import { buildHash } from '../lib/hashRoutes';

interface MemberProfilePageProps {
  userId: string;
  organizationId?: string | null;
  onBack: () => void;
  onNavigateToHash?: (hash: string) => void;
}

export function MemberProfilePage({ userId, organizationId, onBack, onNavigateToHash }: MemberProfilePageProps) {
  const { t } = useTranslation('common');
  const [profile, setProfile] = useState<MemberProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await authApi.getUserProfile(userId, organizationId || undefined);
        setProfile(response);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('profile.failedToLoadMember');
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadUserProfile();
    }
  }, [userId, organizationId, t]);

  const handleBack = () => {
    if (organizationId && onNavigateToHash) {
      onNavigateToHash(buildHash({ view: 'organization', organizationId, orgTab: 'members' }));
      return;
    }
    onBack();
  };

  const handleNavigateToOrganization = (orgId: string) => {
    if (onNavigateToHash) {
      onNavigateToHash(buildHash({ view: 'organization', organizationId: orgId, orgTab: 'members' }));
    }
  };

  if (loading) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage, 'flex items-center justify-center')}>
        <div className="text-center min-w-0">
          <LoadingState isLoading={true} mode="spinner" spinnerSize="lg" className={SPACING.section.margin}>
            <span />
          </LoadingState>
          <p className="text-muted-foreground">{t('profile.loadingProfile')}</p>
        </div>
      </div>
    );
  }

  if (error || !profile?.user) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage)}>
        <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
          <Button variant="ghost" onClick={handleBack} className={SPACING.section.margin}>
            <Icon name="ArrowLeft" className="h-4 w-4 mr-2" />
            Back
          </Button>
          <ErrorState message={error || t('profile.userNotFound')} onBack={handleBack} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <Button variant="ghost" onClick={handleBack} className={SPACING.section.margin}>
          <Icon name="ArrowLeft" className="h-4 w-4 mr-2" />
          Back
        </Button>
        <MemberProfileView
          user={profile.user}
          memberships={profile.memberships}
          contextOrganization={profile.contextOrganization}
          onNavigateToOrganization={onNavigateToHash ? handleNavigateToOrganization : undefined}
        />
      </div>
    </div>
  );
}
