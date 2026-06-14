import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User } from "../types";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Icon } from "./ui/Icon";
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';
import { SPACING } from '../lib/designSystem';
import { 
  ActivityItem,
  ActivityItemRenderer, 
  ActivityItemSkeleton,
  ActivityEmptyState 
} from './shared/ActivityItemRenderer';

interface ActivityFeedProps {
  documentId: string;
  currentUser: User;
}

// Header component to eliminate duplication between loading and loaded states
const ActivityHeader = ({ activityCount }: { activityCount?: number }) => {
  const { t } = useTranslation('activity');
  return (
  <h3 className={`text-sm font-semibold ${SPACING.section.margin} flex items-center ${SPACING.tight.inline}`}>
    <Icon name="Clock" className="h-4 w-4" />
    {t('recentActivity')}
    {activityCount !== undefined && activityCount > 0 && (
      <Badge variant="secondary" className="ml-auto text-xs">
        {activityCount}
      </Badge>
    )}
  </h3>
  );
};

export function ActivityFeed({ documentId, currentUser }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatRelativeTime } = useTimezone();

  useEffect(() => {
    fetchActivities();
    // Rely on WebSocket updates instead of polling
    // No interval needed - updates come via WebSocket
  }, [documentId]);

  const fetchActivities = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/activity`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      logger.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={SPACING.card.padding}>
        <ActivityHeader />
        <div className={SPACING.tight.gap}>
          {[1, 2, 3].map((i) => (
            <ActivityItemSkeleton key={i} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className={SPACING.card.padding}>
      <ActivityHeader activityCount={activities.length} />
      
      <ScrollArea className="h-[400px] pr-4">
        {activities.length === 0 ? (
          <ActivityEmptyState />
        ) : (
          <div className={SPACING.content.gap}>
            {activities.map((activity) => (
              <ActivityItemRenderer
                key={activity.id}
                activity={activity}
                currentUserId={currentUser.id}
                formatRelativeTime={formatRelativeTime}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
