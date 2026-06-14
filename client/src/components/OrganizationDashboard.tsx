import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Organization, User } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Icon } from "./ui/Icon";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";
import { OrganizationCard } from "./OrganizationManagement/shared/OrganizationCard";
import { UnifiedProposalList } from "./shared/UnifiedProposalList";
import { ErrorState } from "./shared/ErrorState";
import { useProposals } from "../hooks/useProposals";
import { useProposalNotifications } from "../hooks/useProposalNotifications";
import { SPACING } from '../lib/designSystem';
import { cn } from './ui/utils';

interface OrganizationDashboardProps {
  currentUser: User;
  onSelectOrganization: (organization: Organization) => void;
  /** Organizations passed from parent - single source of truth */
  organizations?: Organization[];
  /** Loading state from parent */
  isLoading?: boolean;
  /** Callback to refresh organizations after creation */
  onOrganizationCreated?: () => Promise<void>;
  /** Navigate to admin dashboard to create organizations */
  onShowAdmin?: () => void;
}

export function OrganizationDashboard({ 
  currentUser, 
  onSelectOrganization,
  organizations: propOrganizations,
  isLoading: propLoading,
  onShowAdmin,
}: OrganizationDashboardProps) {
  const { t } = useTranslation('organization');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [showProposals, setShowProposals] = useState(false);

  // Use organizations from props (single source of truth from App.tsx)
  const organizations = propOrganizations || [];
  const isLoading = propLoading ?? false;

  // Fetch proposals for selected organization
  const proposalsData = useProposals({
    organizationId: selectedOrganizationId || undefined,
    currentUserId: currentUser.id,
    autoRefresh: false,
  });

  // Track dashboard view time for notifications
  const notifications = useProposalNotifications(currentUser.id);
  
  // Memoize the callback to prevent infinite loops
  const markDashboardAsViewed = useCallback((orgId: string) => {
    notifications.markDashboardAsViewed(orgId);
  }, [notifications.markDashboardAsViewed]);
  
  // Track previous selectedOrganizationId to prevent unnecessary calls
  const prevSelectedOrgIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only call markDashboardAsViewed when selectedOrganizationId changes and is not null
    if (selectedOrganizationId && selectedOrganizationId !== prevSelectedOrgIdRef.current) {
      markDashboardAsViewed(selectedOrganizationId);
      prevSelectedOrgIdRef.current = selectedOrganizationId;
    }
  }, [selectedOrganizationId, markDashboardAsViewed]);

  // NOTE: Auto-navigation for single-org users is handled in App.tsx
  // This component should NOT auto-navigate to prevent race conditions

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
        <LoadingState isLoading={true} mode="spinner" spinnerSize="lg" className="mb-4">
          <span />
        </LoadingState>
        <p className="text-muted-foreground text-sm">{t('loadingOrganizations')}</p>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{organizations.length === 1 ? organizations[0].name : t('organizationsHeading')}</h1>
          <p className="text-muted-foreground">{t('organizationsSubtitle')}</p>
        </div>
        {currentUser.role === 'admin' && onShowAdmin && (
          <Button className="gap-2" onClick={onShowAdmin}>
            <Icon name="Plus" className="h-4 w-4" forceDefault />
            {t('createOrganization')}
          </Button>
        )}
      </div>

      {/* Organization selector only when user belongs to multiple orgs */}
      {organizations.length > 1 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Label>View Proposals for:</Label>
                <Select
                  value={selectedOrganizationId || '__none__'}
                  onValueChange={(value) => {
                    const id = value === '__none__' ? null : value;
                    setSelectedOrganizationId(id);
                    setShowProposals(!!id);
                  }}
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('none')}</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedOrganizationId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProposals(!showProposals)}
                >
                  {showProposals ? 'Hide' : 'Show'} Proposals
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposals Section */}
      {showProposals && selectedOrganizationId && (
        <div className="mb-6">
          {proposalsData.error && !proposalsData.loading ? (
            <ErrorState
              variant="inline"
              message={proposalsData.error}
              onRetry={proposalsData.refresh}
            />
          ) : (
            <UnifiedProposalList
              proposals={proposalsData.proposals}
              currentUserId={currentUser.id}
              onVote={proposalsData.vote}
              onRefresh={proposalsData.refresh}
              organizationId={selectedOrganizationId}
              isLoading={proposalsData.loading}
              fetchFullProposalData={proposalsData.fetchFullProposalData}
              fullProposalData={proposalsData.fullProposalData}
            />
          )}
        </div>
      )}

      {!isLoading && organizations.length === 0 ? (
        <EmptyState
          icon={<Icon name="Users" className="h-16 w-16" forceDefault />}
          title={t('noOrganizationsYet')}
          description={t('noOrganizationsDescription')}
          action={<Button variant="outline">{t('learnMore')}</Button>}
        />
      ) : !isLoading ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <OrganizationCard
              key={org.id}
              organization={org}
              currentUser={currentUser}
              onSelectOrganization={onSelectOrganization}
              mode="grid"
            />
          ))}
        </div>
      ) : null}
      </div>
    </div>
  );
}
