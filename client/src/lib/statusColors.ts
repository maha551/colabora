/**
 * Centralized status color system for consistent UI across the application.
 * Used for voting status badges, activity feeds, and proposal indicators.
 * 
 * All colors use CSS variables defined in globals.css for proper theme support.
 */

// Status color definitions using CSS variables for theme-aware colors
export const STATUS_COLORS = {
  draft: {
    badge: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border-[var(--status-draft-border)]',
    solid: 'bg-[var(--status-draft-solid)]',
    border: 'border-[var(--status-draft-border)]',
  },
  pending: {
    badge: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border-[var(--status-pending-border)]',
    solid: 'bg-[var(--status-pending-solid)]',
    border: 'border-[var(--status-pending-border)]',
  },
  proposed: {
    badge: 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)] border-[var(--status-proposed-border)]',
    solid: 'bg-[var(--status-proposed-solid)]',
    border: 'border-[var(--status-proposed-border)]',
  },
  active: {
    badge: 'bg-[var(--status-active-bg)] text-[var(--status-active-text)] border-[var(--status-active-border)]',
    solid: 'bg-[var(--status-active-solid)]',
    border: 'border-[var(--status-active-border)]',
  },
  approved: {
    badge: 'bg-[var(--status-approved-bg)] text-[var(--status-approved-text)] border-[var(--status-approved-border)]',
    solid: 'bg-[var(--status-approved-solid)]',
    border: 'border-[var(--status-approved-border)]',
  },
  passed: {
    badge: 'bg-[var(--status-passed-bg)] text-[var(--status-passed-text)] border-[var(--status-passed-border)]',
    solid: 'bg-[var(--status-passed-solid)]',
    border: 'border-[var(--status-passed-border)]',
  },
  rejected: {
    badge: 'bg-[var(--status-rejected-bg)] text-[var(--status-rejected-text)] border-[var(--status-rejected-border)]',
    solid: 'bg-[var(--status-rejected-solid)]',
    border: 'border-[var(--status-rejected-border)]',
  },
  failed: {
    badge: 'bg-[var(--status-failed-bg)] text-[var(--status-failed-text)] border-[var(--status-failed-border)]',
    solid: 'bg-[var(--status-failed-solid)]',
    border: 'border-[var(--status-failed-border)]',
  },
  expired: {
    badge: 'bg-[var(--status-expired-bg)] text-[var(--status-expired-text)] border-[var(--status-expired-border)]',
    solid: 'bg-[var(--status-expired-solid)]',
    border: 'border-[var(--status-expired-border)]',
  },
  completed: {
    badge: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
    solid: 'bg-[var(--status-completed-solid)]',
    border: 'border-[var(--status-completed-border)]',
  },
  cancelled: {
    badge: 'bg-[var(--status-expired-bg)] text-[var(--status-expired-text)] border-[var(--status-expired-border)]',
    solid: 'bg-[var(--status-expired-solid)]',
    border: 'border-[var(--status-expired-border)]',
  },
  recorded: {
    badge: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
    solid: 'bg-[var(--status-completed-solid)]',
    border: 'border-[var(--status-completed-border)]',
  },
  implemented: {
    badge: 'bg-[var(--status-implemented-bg)] text-[var(--status-implemented-text)] border-[var(--status-implemented-border)]',
    solid: 'bg-[var(--status-implemented-solid)]',
    border: 'border-[var(--status-implemented-border)]',
  },
  applied: {
    badge: 'bg-[var(--status-applied-bg)] text-[var(--status-applied-text)] border-[var(--status-applied-border)]',
    solid: 'bg-[var(--status-applied-solid)]',
    border: 'border-[var(--status-applied-border)]',
  },
  /** Alias for election announced/nomination phase */
  announced: {
    badge: 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)] border-[var(--status-proposed-border)]',
    solid: 'bg-[var(--status-proposed-solid)]',
    border: 'border-[var(--status-proposed-border)]',
  },
  /** Alias for voting in progress */
  voting: {
    badge: 'bg-[var(--status-active-bg)] text-[var(--status-active-text)] border-[var(--status-active-border)]',
    solid: 'bg-[var(--status-active-solid)]',
    border: 'border-[var(--status-active-border)]',
  },
  nomination: {
    badge: 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)] border-[var(--status-proposed-border)]',
    solid: 'bg-[var(--status-proposed-solid)]',
    border: 'border-[var(--status-proposed-border)]',
  },
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

// Activity type colors using CSS variables
export const ACTIVITY_COLORS = {
  proposal_created: STATUS_COLORS.active,
  proposal_accepted: STATUS_COLORS.approved,
  vote_cast: {
    badge: 'bg-[var(--activity-vote-cast-bg)] text-[var(--activity-vote-cast-text)] border-[var(--activity-vote-cast-border)]',
    solid: 'bg-[var(--activity-vote-cast-solid)]',
    border: 'border-[var(--activity-vote-cast-border)]',
  },
  comment_added: {
    badge: 'bg-[var(--activity-comment-added-bg)] text-[var(--activity-comment-added-text)] border-[var(--activity-comment-added-border)]',
    solid: 'bg-[var(--activity-comment-added-solid)]',
    border: 'border-[var(--activity-comment-added-border)]',
  },
  structure_proposal_created: {
    badge: 'bg-[var(--activity-structure-proposal-created-bg)] text-[var(--activity-structure-proposal-created-text)] border-[var(--activity-structure-proposal-created-border)]',
    solid: 'bg-[var(--activity-structure-proposal-created-solid)]',
    border: 'border-[var(--activity-structure-proposal-created-border)]',
  },
  structure_proposal_vote: {
    badge: 'bg-[var(--activity-structure-proposal-vote-bg)] text-[var(--activity-structure-proposal-vote-text)] border-[var(--activity-structure-proposal-vote-border)]',
    solid: 'bg-[var(--activity-structure-proposal-vote-solid)]',
    border: 'border-[var(--activity-structure-proposal-vote-border)]',
  },
  structure_proposal_approved: STATUS_COLORS.approved,
  structure_proposal_applied: STATUS_COLORS.applied,
} as const;

export type ActivityColorKey = keyof typeof ACTIVITY_COLORS;

// Helper function to get status color with fallback
export function getStatusColor(status: string) {
  return STATUS_COLORS[status as StatusColorKey] ?? STATUS_COLORS.draft;
}

// Helper function to get activity color with fallback
export function getActivityColor(type: string) {
  return ACTIVITY_COLORS[type as ActivityColorKey] ?? STATUS_COLORS.draft;
}

