import { useState, useCallback, useRef, useEffect } from 'react';
import { activityApi } from '../lib/api';
import { logger } from '../lib/logger';
import type { DecisionEntry, PendingDecisionEntry } from '../types/decisions';
import { useActivityFeedOrganizationUpdates } from './useActivityFeedOrganizationUpdates';
import { useAuth } from './useAuth';

interface PaginationState {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const DEFAULT_PAGINATION: PaginationState = {
  total: 0,
  limit: 10,
  offset: 0,
  hasMore: false,
};

interface UseOrganizationDecisionsOptions {
  organizationId: string;
  userId?: string | null;
  enabled?: boolean;
  resolvedLimit?: number;
  pendingLimit?: number;
}

export function useOrganizationDecisions({
  organizationId,
  userId = null,
  enabled = true,
  resolvedLimit = 10,
  pendingLimit = 20,
}: UseOrganizationDecisionsOptions) {
  const { authToken } = useAuth();

  const [resolvedEntries, setResolvedEntries] = useState<DecisionEntry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingDecisionEntry[]>([]);
  const [resolvedPagination, setResolvedPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [pendingPagination, setPendingPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [loadingResolved, setLoadingResolved] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingMoreResolved, setLoadingMoreResolved] = useState(false);

  const fetchingResolvedRef = useRef(false);
  const fetchingPendingRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResolved = useCallback(
    async (offset = 0, replace = true) => {
      if (!enabled || !organizationId || fetchingResolvedRef.current) return;
      fetchingResolvedRef.current = true;
      if (replace) setLoadingResolved(true);
      else setLoadingMoreResolved(true);

      try {
        const data = await activityApi.getDecisions({
          organizationId,
          limit: resolvedLimit,
          offset,
        });
        const entries = data.entries || [];
        setResolvedEntries((prev) => (replace ? entries : [...prev, ...entries]));
        setResolvedPagination({
          total: data.pagination.total,
          limit: data.pagination.limit,
          offset: data.pagination.offset,
          hasMore: data.pagination.hasMore,
        });
      } catch (error) {
        logger.error('Failed to fetch org resolved decisions:', error);
        if (replace) setResolvedEntries([]);
      } finally {
        setLoadingResolved(false);
        setLoadingMoreResolved(false);
        fetchingResolvedRef.current = false;
      }
    },
    [enabled, organizationId, resolvedLimit]
  );

  const fetchPending = useCallback(
    async (offset = 0, replace = true) => {
      if (!enabled || !organizationId || fetchingPendingRef.current) return;
      fetchingPendingRef.current = true;
      if (replace) setLoadingPending(true);

      try {
        const data = await activityApi.getPendingDecisions({
          organizationId,
          limit: pendingLimit,
          offset,
        });
        const entries = data.entries || [];
        setPendingEntries((prev) => (replace ? entries : [...prev, ...entries]));
        setPendingPagination({
          total: data.pagination.total,
          limit: data.pagination.limit,
          offset: data.pagination.offset,
          hasMore: data.pagination.hasMore,
        });
      } catch (error) {
        logger.error('Failed to fetch org pending decisions:', error);
        if (replace) setPendingEntries([]);
      } finally {
        setLoadingPending(false);
        fetchingPendingRef.current = false;
      }
    },
    [enabled, organizationId, pendingLimit]
  );

  const refresh = useCallback(async () => {
    await Promise.all([fetchResolved(0, true), fetchPending(0, true)]);
  }, [fetchResolved, fetchPending]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      void refresh();
      refreshTimeoutRef.current = null;
    }, 500);
  }, [refresh]);

  const loadMoreResolved = useCallback(() => {
    if (!resolvedPagination.hasMore || loadingMoreResolved) return;
    fetchResolved(resolvedPagination.offset + resolvedPagination.limit, false);
  }, [resolvedPagination, loadingMoreResolved, fetchResolved]);

  useEffect(() => {
    if (enabled && organizationId) {
      void fetchResolved(0, true);
      void fetchPending(0, true);
    }
  }, [enabled, organizationId, fetchResolved, fetchPending]);

  useActivityFeedOrganizationUpdates({
    organizationIds: enabled && organizationId ? [organizationId] : [],
    userId,
    authToken: authToken ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null),
    onPendingRefresh: debouncedRefresh,
  });

  /** Paragraph proposals and amendments not covered by OrganizationDecisionsPanel */
  const awaitingVoteEntries = pendingEntries.filter(
    (e) => e.kind === 'paragraph_proposal' || e.kind === 'document_amendments_open'
  );

  return {
    resolvedEntries,
    pendingEntries,
    awaitingVoteEntries,
    resolvedPagination,
    pendingPagination,
    loadingResolved,
    loadingPending,
    loadingMoreResolved,
    refresh,
    loadMoreResolved,
  };
}
