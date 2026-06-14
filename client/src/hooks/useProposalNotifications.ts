import { useCallback } from 'react';
import { BaseProposal } from '../components/shared/proposalTypes';

interface ProposalNotificationState {
  lastViewed: number;
  lastVoteCount: number;
}

const STORAGE_PREFIX = 'proposal_notifications';
const DASHBOARD_VIEW_PREFIX = 'dashboard_viewed';

/**
 * Hook for tracking proposal notifications and unread status
 */
export function useProposalNotifications(userId?: string) {
  const getStorageKey = useCallback((suffix: string) => {
    return userId ? `${STORAGE_PREFIX}_${suffix}_${userId}` : null;
  }, [userId]);

  const getDashboardKey = useCallback((contextId: string) => {
    return userId ? `${DASHBOARD_VIEW_PREFIX}_${contextId}_${userId}` : null;
  }, [userId]);

  /**
   * Mark a proposal as viewed
   */
  const markAsViewed = useCallback((proposalId: string) => {
    if (!userId) return;
    const key = getStorageKey(`viewed_${proposalId}`);
    if (key) {
      localStorage.setItem(key, Date.now().toString());
    }
  }, [userId, getStorageKey]);

  /**
   * Check if proposal has new votes since last view
   */
  const hasNewVotes = useCallback((proposalId: string, currentVoteCount: number): boolean => {
    if (!userId) return false;
    const key = getStorageKey(`votes_${proposalId}`);
    if (!key) return false;
    
    const lastCountStr = localStorage.getItem(key);
    if (!lastCountStr) {
      // First time seeing this proposal, store current count
      localStorage.setItem(key, currentVoteCount.toString());
      return false;
    }

    const lastCount = parseInt(lastCountStr, 10);
    if (isNaN(lastCount)) return false;

    // Update stored count
    localStorage.setItem(key, currentVoteCount.toString());

    return currentVoteCount > lastCount;
  }, [userId, getStorageKey]);

  /**
   * Check if proposal is new (created after last dashboard view)
   */
  const isNewProposal = useCallback((
    proposalId: string,
    createdAt: string,
    contextId: string = 'all'
  ): boolean => {
    if (!userId) return false;
    const dashboardKey = getDashboardKey(contextId);
    if (!dashboardKey) return false;

    const lastViewStr = localStorage.getItem(dashboardKey);
    if (!lastViewStr) {
      // First time viewing dashboard, mark current time
      localStorage.setItem(dashboardKey, Date.now().toString());
      return false;
    }

    const lastViewTime = parseInt(lastViewStr, 10);
    if (isNaN(lastViewTime)) return false;

    try {
      const createdTime = new Date(createdAt).getTime();
      return createdTime > lastViewTime;
    } catch {
      return false;
    }
  }, [userId, getDashboardKey]);

  /**
   * Get unread count for proposals
   */
  const getUnreadCount = useCallback((
    proposals: BaseProposal[],
    contextId: string = 'all'
  ): { newProposals: number; newVotes: number; total: number } => {
    if (!userId) return { newProposals: 0, newVotes: 0, total: 0 };

    let newProposals = 0;
    let newVotes = 0;

    proposals.forEach(proposal => {
      if (isNewProposal(proposal.id, proposal.createdAt, contextId)) {
        newProposals++;
      }
      if (proposal.votes && hasNewVotes(proposal.id, proposal.votes.total)) {
        newVotes++;
      }
    });

    return {
      newProposals,
      newVotes,
      total: newProposals + newVotes,
    };
  }, [userId, isNewProposal, hasNewVotes]);

  /**
   * Mark all proposals as viewed
   */
  const markAllAsViewed = useCallback((proposalIds: string[]) => {
    if (!userId) return;
    const now = Date.now().toString();
    proposalIds.forEach(proposalId => {
      const key = getStorageKey(`viewed_${proposalId}`);
      if (key) {
        localStorage.setItem(key, now);
      }
    });
  }, [userId, getStorageKey]);

  /**
   * Mark dashboard as viewed (for determining "new" proposals)
   */
  const markDashboardAsViewed = useCallback((contextId: string = 'all') => {
    if (!userId) return;
    const key = getDashboardKey(contextId);
    if (key) {
      localStorage.setItem(key, Date.now().toString());
    }
  }, [userId, getDashboardKey]);

  /**
   * Get notification state for a specific proposal
   */
  const getProposalNotificationState = useCallback((
    proposal: BaseProposal,
    contextId: string = 'all'
  ): { isNew: boolean; hasNewVotes: boolean } => {
    const isNew = isNewProposal(proposal.id, proposal.createdAt, contextId);
    const hasNewVotes = proposal.votes 
      ? hasNewVotes(proposal.id, proposal.votes.total)
      : false;

    return { isNew, hasNewVotes };
  }, [isNewProposal, hasNewVotes]);

  /**
   * Clear all notifications for a user (cleanup)
   */
  const clearAllNotifications = useCallback(() => {
    if (!userId) return;
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(`${STORAGE_PREFIX}_`) && key.endsWith(`_${userId}`)) {
        localStorage.removeItem(key);
      }
      if (key.startsWith(`${DASHBOARD_VIEW_PREFIX}_`) && key.endsWith(`_${userId}`)) {
        localStorage.removeItem(key);
      }
    });
  }, [userId]);

  return {
    markAsViewed,
    hasNewVotes,
    isNewProposal,
    getUnreadCount,
    markAllAsViewed,
    markDashboardAsViewed,
    getProposalNotificationState,
    clearAllNotifications,
  };
}

