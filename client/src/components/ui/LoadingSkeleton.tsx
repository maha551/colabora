import { useTranslation } from 'react-i18next';
import { cn } from './utils';
import { RADIUS } from '../../lib/designSystem';

interface LoadingSkeletonProps {
  variant?: 'document-card' | 'list-item' | 'paragraph' | 'text' | 'avatar' | 'badge';
  className?: string;
  count?: number;
}

export function LoadingSkeleton({ 
  variant = 'text', 
  className,
  count = 1 
}: LoadingSkeletonProps) {
  const { t } = useTranslation('common');
  const baseClasses = cn('animate-pulse bg-muted', RADIUS.inline);
  
  const variantClasses = {
    'document-card': 'h-32 w-full mb-4',
    'list-item': 'h-16 w-full mb-2',
    'paragraph': 'h-4 w-full mb-2',
    'text': 'h-4 w-full',
    'avatar': cn('h-10 w-10', RADIUS.pill),
    'badge': cn('h-6 w-16', RADIUS.pill),
  };

  if (count > 1) {
    return (
      <div 
        className={cn('space-y-2', className)}
        aria-label={t('aria.loading')}
        role="status"
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(baseClasses, variantClasses[variant])}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      aria-label={t('aria.loading')}
      role="status"
    />
  );
}

// Pre-configured skeleton components for common use cases
export function DocumentCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn("bg-card border border-border p-6 shadow-sm", RADIUS.panel)}
        >
          <div className="space-y-3">
            {/* Title */}
            <LoadingSkeleton variant="text" className="h-6 w-3/4" />
            {/* Description */}
            <LoadingSkeleton variant="paragraph" className="h-4 w-full" />
            <LoadingSkeleton variant="paragraph" className="h-4 w-5/6" />
            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <LoadingSkeleton variant="avatar" />
                <LoadingSkeleton variant="text" className="h-4 w-24" />
              </div>
              <LoadingSkeleton variant="badge" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-card rounded border border-border"
        >
          <LoadingSkeleton variant="avatar" />
          <div className="flex-1 space-y-2">
            <LoadingSkeleton variant="text" className="h-4 w-1/3" />
            <LoadingSkeleton variant="text" className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ParagraphSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeleton
          key={i}
          variant="paragraph"
          className={i === count - 1 ? 'w-5/6' : 'w-full'}
        />
      ))}
    </div>
  );
}
