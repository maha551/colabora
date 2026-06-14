import { Button } from './button';
import { Icon } from './Icon';
import { SPACING, COLORS } from '../../lib/designSystem';
import { cn } from './utils';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
  className?: string;
}

/**
 * Inline error state for "data load failed" (section or page).
 * Use with toasts for transient errors; use this when main content failed to load.
 */
export function ErrorState({ message, onRetry, onBack, className }: ErrorStateProps) {
  return (
    <div className={cn('text-center', SPACING.page.y, SPACING.content.gap, className)}>
      <div className="flex justify-center">
        <Icon name="AlertTriangle" className="h-12 w-12 text-muted-foreground" />
      </div>
      <p className={cn(COLORS.status.error, 'font-medium')}>{message}</p>
      <div className={cn('flex flex-wrap items-center justify-center gap-3', SPACING.section.top)}>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="gap-2">
            <Icon name="ArrowLeft" className="h-4 w-4" />
            Back
          </Button>
        )}
        {onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <Icon name="RefreshCw" className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}
