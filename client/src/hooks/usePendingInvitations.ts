// Hook to fetch and refresh pending organization invitations for the current user

import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';

export interface PendingInvitationItem {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  invitationType: 'member' | 'representative';
  inviterName: string;
  expiresAt: string;
  createdAt: string;
}

export function usePendingInvitations(isAuthenticated: boolean) {
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setPendingInvitations([]);
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.getPendingInvitations();
      setPendingInvitations(result.invitations ?? []);
    } catch {
      setPendingInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    } else {
      setPendingInvitations([]);
    }
  }, [isAuthenticated, refresh]);

  return { pendingInvitations, loading, refresh };
}
