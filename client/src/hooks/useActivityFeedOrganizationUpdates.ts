import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '../lib/logger';
import type { OrganizationUpdate } from './useOrganizationWebSocket';
import { shouldRefreshPendingOnOrgUpdate } from '../lib/proposals/organizationPendingRefreshEvents';

interface UseActivityFeedOrganizationUpdatesOptions {
  organizationIds: string[];
  userId: string | null;
  authToken: string | null;
  onPendingRefresh: () => void;
  debounceMs?: number;
}

/**
 * Subscribe to organization updates for multiple orgs (activity feed pending tab).
 * Uses one socket and subscribe-organization per org id.
 */
export function useActivityFeedOrganizationUpdates({
  organizationIds,
  userId,
  authToken,
  onPendingRefresh,
  debounceMs = 500,
}: UseActivityFeedOrganizationUpdatesOptions) {
  const socketRef = useRef<Socket | null>(null);
  const subscribedOrgsRef = useRef<Set<string>>(new Set());
  const onRefreshRef = useRef(onPendingRefresh);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onRefreshRef.current = onPendingRefresh;

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onRefreshRef.current();
      debounceRef.current = null;
    }, debounceMs);
  }, [debounceMs]);

  const uniqueOrgIds = [...new Set(organizationIds.filter(Boolean))].sort().join(',');

  useEffect(() => {
    if (!userId || !authToken || uniqueOrgIds.length === 0) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        subscribedOrgsRef.current.clear();
      }
      return;
    }

    const orgIdList = uniqueOrgIds.split(',').filter(Boolean);
    const wsUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';

    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      auth: { token: authToken },
    });

    const subscribeAll = () => {
      for (const orgId of orgIdList) {
        if (!subscribedOrgsRef.current.has(orgId)) {
          socket.emit('subscribe-organization', orgId);
          subscribedOrgsRef.current.add(orgId);
        }
      }
      for (const prev of [...subscribedOrgsRef.current]) {
        if (!orgIdList.includes(prev)) {
          socket.emit('unsubscribe-organization', prev);
          subscribedOrgsRef.current.delete(prev);
        }
      }
    };

    socket.on('connect', () => {
      socket.emit('authenticate', { token: authToken, userId });
      subscribeAll();
    });

    socket.on('organization-update', (update: OrganizationUpdate) => {
      if (shouldRefreshPendingOnOrgUpdate(update.eventType)) {
        debouncedRefresh();
      }
    });

    socketRef.current = socket;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      socket.off('connect');
      socket.off('organization-update');
      for (const orgId of subscribedOrgsRef.current) {
        socket.emit('unsubscribe-organization', orgId);
      }
      subscribedOrgsRef.current.clear();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [uniqueOrgIds, userId, authToken, debouncedRefresh]);
}
