import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Organization } from '../types';
import { organizationsApi } from '../lib/api';
import { logger } from '../lib/logger';

export interface UseUserOrganizationsResult {
  organizations: Organization[];
  loading: boolean;
  error: string | null;
  isSingleOrg: boolean;
  primaryOrganization: Organization | null;
  refreshOrganizations: () => Promise<Organization[]>;
}

const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

/**
 * Custom hook to fetch and manage user's organizations
 * Provides early detection of single-organization users for smart navigation
 * Includes error handling, timeout, retry logic, and performance monitoring
 */
export function useUserOrganizations(currentUser: User | null): UseUserOrganizationsResult {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Request deduplication: track in-flight requests
  const inFlightRequestRef = useRef<Promise<void> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchOrganizations = useCallback(async (retryCount = 0): Promise<Organization[]> => {
    if (!currentUser) {
      setOrganizations([]);
      setLoading(false);
      setError(null);
      return [];
    }

    // Request deduplication: if a request is already in flight, return it
    if (inFlightRequestRef.current) {
      return inFlightRequestRef.current as Promise<Organization[]>;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const fetchPromise = (async (): Promise<Organization[]> => {
      const fetchStart = performance.now();
      setLoading(true);
      setError(null);

      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            abortController.abort();
            reject(new Error('Request timeout: Organizations loading took too long'));
          }, REQUEST_TIMEOUT);
        });

        // Race between fetch and timeout
        const response = await Promise.race([
          organizationsApi.getOrganizations(),
          timeoutPromise
        ]);

        // Check if request was aborted
        if (abortController.signal.aborted) {
          return [];
        }

        const orgs = response.organizations || [];
        const fetchDuration = performance.now() - fetchStart;

        // Enhanced logging with full organization details
        const orgDetails = orgs.map(o => ({
          id: o.id,
          name: o.name,
          membershipStatus: o.membershipStatus,
          isActive: o.isActive,
          accessType: o.membershipStatus ? 'member' : (o.representatives?.includes(currentUser.id) ? 'representative' : 'unknown')
        }));

        // Debug logging removed - use logger if needed
        // logger.log('useUserOrganizations: Loaded organizations', {
        //   count: orgs.length,
        //   duration: `${fetchDuration.toFixed(2)}ms`,
        //   organizations: orgDetails,
        //   userId: currentUser.id,
        //   retryCount,
        //   hasFiltering: false // Track if any filtering occurred
        // });

        // Log warning if no organizations found but user exists
        if (orgs.length === 0 && currentUser) {
          logger.warn('useUserOrganizations: No organizations found for user', {
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: currentUser.name
          });
        }

        setOrganizations(orgs);
        setError(null);
        return orgs;
      } catch (err: unknown) {
        // Don't set error if request was aborted (component unmounted)
        if (abortController.signal.aborted) {
          return [];
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to load organizations';
        logger.error('Failed to load organizations:', err);

        // Retry logic with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const retryDelay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
          // Debug logging removed
          // logger.log(`Retrying organizations fetch (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${retryDelay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Recursively retry
          return fetchOrganizations(retryCount + 1);
        }

        // Max retries reached, set error
        setError(errorMessage);
        setOrganizations([]);
        return [];
      } finally {
        // Only set loading to false if this is still the current request
        if (abortControllerRef.current === abortController) {
          setLoading(false);
          inFlightRequestRef.current = null;
          abortControllerRef.current = null;
        }
      }
    })();

    inFlightRequestRef.current = fetchPromise;
    return fetchPromise;
  }, [currentUser?.id]);

  useEffect(() => {
    fetchOrganizations();

    // Cleanup: abort request on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      inFlightRequestRef.current = null;
      abortControllerRef.current = null;
    };
  }, [fetchOrganizations]);

  const isSingleOrg = organizations.length === 1;
  const primaryOrganization = isSingleOrg ? organizations[0] : null;

  const refreshOrganizations = useCallback(async (): Promise<Organization[]> => {
    return fetchOrganizations(0);
  }, [fetchOrganizations]);

  return { 
    organizations, 
    loading, 
    error,
    isSingleOrg, 
    primaryOrganization, 
    refreshOrganizations
  };
}
