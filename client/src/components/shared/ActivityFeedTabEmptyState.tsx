import { ReactNode } from "react";
import { Card } from "../ui/card";
import { SPACING, COLORS, RADIUS } from "../../lib/designSystem";
import { cn } from "../ui/utils";

interface ActivityFeedTabEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  tip?: {
    message: ReactNode;
    subMessage: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
  };
  showTip?: boolean;
}

/**
 * Reusable empty state component for activity feed tabs
 * Consolidates the three empty state patterns used in ActivityFeedView
 */
export function ActivityFeedTabEmptyState({
  icon,
  title,
  description,
  tip,
  showTip = false,
}: ActivityFeedTabEmptyStateProps) {
  return (
    <Card className={SPACING.card.padding}>
      <div className={cn('text-center', COLORS.text.secondary, SPACING.content.gap)}>
        <div>{icon}</div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm">{description}</p>
        {showTip && tip && (
          <div
            className={cn(SPACING.section.top, SPACING.card.padding, tip.bgColor, 'border', RADIUS.panel, tip.borderColor, SPACING.tight.gap)}
          >
            <p className={cn('text-sm', tip.textColor)}>
              {tip.message}
            </p>
            <p className={`text-xs ${tip.textColor}`}>
              {tip.subMessage}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

