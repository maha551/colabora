/**
 * Shared Activity Item Renderer
 * 
 * Provides reusable activity item rendering for both:
 * - ActivityFeed.tsx (document sidebar)
 * - ActivityFeedView.tsx (main activity page)
 * 
 * Eliminates code duplication for activity rendering logic.
 */

import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../ui/utils";
import { getUserColor } from "../../lib/userColors";
import { SPACING, COLORS, RADIUS } from "../../lib/designSystem";
import { Icon } from "../ui/Icon";

// Shared activity item type
export interface ActivityItem {
  id: string;
  type: 'proposal_created' | 'proposal_accepted' | 'vote_cast' | 'comment_added' | 
        'structure_proposal_created' | 'structure_proposal_vote' | 
        'structure_proposal_approved' | 'structure_proposal_applied';
  userId: string;
  userName: string;
  userAvatar?: string;
  paragraphTitle?: string;
  proposalText?: string;
  voteType?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  commentText?: string;
  timestamp: string;
}

interface ActivityItemRendererProps {
  activity: ActivityItem;
  currentUserId: string;
  formatRelativeTime: (timestamp: string) => string;
  className?: string;
}

/**
 * Get the appropriate icon for an activity type
 */
export function getActivityIcon(type: ActivityItem['type'], voteType?: string): ReactNode {
  switch (type) {
    case 'proposal_created':
      return <Icon name="FileEdit" className="h-4 w-4 text-[var(--color-blue-600)]" />;
    case 'proposal_accepted':
      return <Icon name="CheckCircle2" className="h-4 w-4 text-[var(--vote-pro)]" />;
    case 'vote_cast':
      if (voteType === 'PRO') return <Icon name="ThumbsUp" className="h-4 w-4 text-[var(--vote-pro)]" />;
      if (voteType === 'CONTRA') return <Icon name="ThumbsDown" className="h-4 w-4 text-[var(--vote-contra)]" />;
      return <Icon name="Minus" className={`h-4 w-4 ${COLORS.text.secondary}`} />;
    case 'comment_added':
      return <Icon name="MessageSquare" className="h-4 w-4 text-[var(--badge-purple-text)]" />;
    case 'structure_proposal_created':
      return <Icon name="Network" className="h-4 w-4 text-[var(--badge-purple-text)]" />;
    case 'structure_proposal_vote':
      if (voteType === 'PRO') return <Icon name="ThumbsUp" className="h-4 w-4 text-[var(--badge-purple-text)]" />;
      if (voteType === 'CONTRA') return <Icon name="ThumbsDown" className="h-4 w-4 text-[var(--vote-contra)]" />;
      return <Icon name="Minus" className={`h-4 w-4 ${COLORS.text.secondary}`} />;
    case 'structure_proposal_approved':
      return <Icon name="CheckCircle2" className="h-4 w-4 text-[var(--vote-pro)]" />;
    case 'structure_proposal_applied':
      return <div className={cn('h-4 w-4 bg-[var(--vote-pro)] text-white text-xs flex items-center justify-center', RADIUS.inline)}>✓</div>;
    default:
      return <Icon name="Clock" className={`h-4 w-4 ${COLORS.text.secondary}`} />;
  }
}

/**
 * Get the description for an activity type
 */
export function getActivityDescription(
  activity: ActivityItem,
  t: TFunction<'activity'>
): { title: string; detail: string } {
  switch (activity.type) {
    case 'proposal_created':
      return {
        title: t('item.suggestedChange'),
        detail: activity.paragraphTitle
          ? t('item.toTitle', { title: activity.paragraphTitle })
          : t('item.toParagraph'),
      };
    case 'proposal_accepted':
      return {
        title: t('item.proposalAccepted'),
        detail: activity.paragraphTitle
          ? t('item.inTitle', { title: activity.paragraphTitle })
          : t('item.forParagraph'),
      };
    case 'vote_cast': {
      const voteTitle =
        activity.voteType === 'PRO'
          ? t('item.approvedProposal')
          : activity.voteType === 'CONTRA'
            ? t('item.rejectedProposal')
            : t('item.votedNeutralProposal');
      return {
        title: voteTitle,
        detail: activity.paragraphTitle
          ? t('item.inTitle', { title: activity.paragraphTitle })
          : '',
      };
    }
    case 'comment_added':
      return {
        title: t('item.commented'),
        detail: activity.commentText?.substring(0, 50) + (activity.commentText && activity.commentText.length > 50 ? '...' : ''),
      };
    case 'structure_proposal_created':
      return {
        title: t('item.proposedRestructure'),
        detail: activity.paragraphTitle || t('item.majorDocumentChanges'),
      };
    case 'structure_proposal_vote': {
      const structVoteTitle =
        activity.voteType === 'PRO'
          ? t('item.supportedRestructure')
          : activity.voteType === 'CONTRA'
            ? t('item.opposedRestructure')
            : t('item.neutralRestructure');
      return {
        title: structVoteTitle,
        detail: activity.paragraphTitle || t('item.documentRestructuring'),
      };
    }
    case 'structure_proposal_approved':
      return {
        title: t('item.restructureApproved'),
        detail: activity.paragraphTitle || t('item.readyForApplication'),
      };
    case 'structure_proposal_applied':
      return {
        title: t('item.appliedRestructure'),
        detail: activity.paragraphTitle || t('item.documentStructureUpdated'),
      };
    default:
      return { title: t('item.activity'), detail: '' };
  }
}

/**
 * Shared activity item renderer component
 * Used by both ActivityFeed and ActivityFeedView
 */
export function ActivityItemRenderer({ 
  activity, 
  currentUserId, 
  formatRelativeTime,
  className 
}: ActivityItemRendererProps) {
  const { t } = useTranslation('activity');
  const { title, detail } = getActivityDescription(activity, t);
  const isCurrentUser = activity.userId === currentUserId;
  
  return (
    <div
      className={cn(
        `flex ${SPACING.content.inline} p-2 ${RADIUS.panel} hover:bg-muted transition-colors`,
        isCurrentUser && "bg-blue-50/50 dark:bg-blue-950/30",
        className
      )}
    >
      <div className="flex-shrink-0">
        <Avatar className="h-8 w-8 border-2" style={{ borderColor: getUserColor(activity.userId) }}>
          <AvatarImage src={activity.userAvatar} />
          <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            {activity.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className={`flex items-start ${SPACING.tight.inline}`}>
          <div className="flex-1">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {isCurrentUser ? t('item.you') : activity.userName}
              </span>
              {' '}
              <span className={COLORS.text.secondary}>{title}</span>
            </p>
            {detail && (
              <p className={`text-xs ${COLORS.text.secondary} mt-0.5 truncate`}>
                {detail}
              </p>
            )}
            <div className={`flex items-center ${SPACING.tight.inline} mt-1`}>
              <span className={`text-xs ${COLORS.text.secondary}`}>
                {formatRelativeTime(activity.timestamp)}
              </span>
            </div>
          </div>
          
          <div className="flex-shrink-0">
            {getActivityIcon(activity.type, activity.voteType)}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for activity items
 */
export function ActivityItemSkeleton() {
  return (
    <div className={`animate-pulse flex ${SPACING.content.inline} p-2`}>
      <div className={`h-8 w-8 ${COLORS.bg.muted} ${RADIUS.pill}`} />
      <div className={`flex-1 ${SPACING.tight.gap}`}>
        <div className={cn('h-4 w-3/4', COLORS.bg.muted, RADIUS.inline)} />
        <div className={cn('h-3 w-1/2', COLORS.bg.muted, RADIUS.inline)} />
      </div>
    </div>
  );
}

/**
 * Empty state for activity feed
 */
export function ActivityEmptyState({ message, subMessage }: { 
  message?: string; 
  subMessage?: string; 
}) {
  const { t } = useTranslation('activity');
  return (
    <div className={`text-center ${SPACING.section.top} ${COLORS.text.secondary}`}>
      <Icon name="Clock" className={`h-8 w-8 mx-auto mb-2 ${COLORS.text.secondary}`} />
      <p className="text-sm">{message ?? t('noRecentActivity')}</p>
      <p className={`text-xs mt-1`}>{subMessage ?? t('noRecentActivityDescription')}</p>
    </div>
  );
}
