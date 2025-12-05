import { useState, useEffect, useCallback } from 'react';
import { User, Organization } from '../types';
import { organizationsApi } from '../lib/api';

export interface UseUserOrganizationsResult {
  organizations: Organization[];
  loading: boolean;
  isSingleOrg: boolean;
  primaryOrganization: Organization | null;
  refreshOrganizations: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage user's organizations
 * Provides early detection of single-organization users for smart navigation
 */
export function useUserOrganizations(currentUser: User | null): UseUserOrganizationsResult {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrganizations = useCallback(async () => {
    if (!currentUser) {
      setOrganizations([]);
      setLoading(false);
      return;
    }

    try {
      const response = await organizationsApi.getOrganizations();
      const orgs = response.organizations || [];
      console.log('useUserOrganizations: Loaded organizations', {
        count: orgs.length,
        organizations: orgs.map(o => ({ id: o.id, name: o.name })),
        userId: currentUser.id
      });
      setOrganizations(orgs);
    } catch (error) {
      console.error('Failed to load organizations:', error);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const isSingleOrg = organizations.length === 1;
  const primaryOrganization = isSingleOrg ? organizations[0] : null;

  return { organizations, loading, isSingleOrg, primaryOrganization, refreshOrganizations: fetchOrganizations };
}
