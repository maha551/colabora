/**
 * Unified Loading State Component
 * Provides consistent loading patterns across the application
 * 
 * Usage Guidelines:
 * - Use skeleton mode for: Content that will be replaced (lists, cards, text blocks)
 * - Use spinner mode for: Actions in progress, button states, inline loading
 * - Standard prop name: `isLoading` (not `loading`, `isPending`, `isFetching`)
 */

import { LoadingSpinner } from './LoadingSpinner';
import { Skeleton } from './skeleton';
import { cn } from './utils';
import { RADIUS } from '../../lib/designSystem';

interface LoadingStateProps {
  /** Loading state - use `isLoading` as standard prop name */
  isLoading: boolean;
  /** Loading mode: 'skeleton' for content placeholders, 'spinner' for actions, 'inline' for inline content */
  mode?: 'skeleton' | 'spinner' | 'inline';
  /** Spinner size - only applies when mode is 'spinner' */
  spinnerSize?: 'sm' | 'md' | 'lg';
  /** Skeleton variant - only applies when mode is 'skeleton' */
  skeletonVariant?: 'text' | 'card' | 'list' | 'custom';
  /** Custom skeleton count - for list variants */
  skeletonCount?: number;
  /** Children to show when not loading */
  children: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Custom skeleton className */
  skeletonClassName?: string;
}

/**
 * Unified Loading State Component
 * 
 * Standardizes loading patterns across the application
 * 
 * @example
 * // Skeleton mode (for content)
 * <LoadingState isLoading={loading} mode="skeleton" skeletonVariant="list" skeletonCount={3}>
 *   <DocumentList documents={documents} />
 * </LoadingState>
 * 
 * @example
 * // Spinner mode (for actions)
 * <LoadingState isLoading={saving} mode="spinner" spinnerSize="sm">
 *   <Button>Save</Button>
 * </LoadingState>
 */
export function LoadingState({
  isLoading,
  mode = 'skeleton',
  spinnerSize = 'md',
  skeletonVariant = 'text',
  skeletonCount = 3,
  children,
  className,
  skeletonClassName,
}: LoadingStateProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  if (mode === 'spinner') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <LoadingSpinner size={spinnerSize} />
      </div>
    );
  }

  if (mode === 'inline') {
    return (
      <div className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}>
        <LoadingSpinner size="sm" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  // Skeleton mode
  switch (skeletonVariant) {
    case 'card':
      return (
        <div className={cn('space-y-4', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className={cn("border p-6 space-y-4", RADIUS.panel)}>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      );

    case 'list':
      return (
        <div className={cn('space-y-3', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className={cn("h-12 w-12", RADIUS.pill)} />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'custom':
      return (
        <div className={cn(skeletonClassName)}>
          {children}
        </div>
      );

    case 'text':
    default:
      return (
        <div className={cn('space-y-2', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn(
                i === skeletonCount - 1 ? 'w-3/4' : 'w-full',
                skeletonClassName
              )}
            />
          ))}
        </div>
      );
  }
}

/**
 * Loading State Hook Pattern
 * 
 * Standard prop naming convention:
 * - Use `isLoading` for loading states
 * - Avoid: `loading`, `isPending`, `isFetching`
 * 
 * @example
 * const { data, isLoading } = useQuery(...);
 * 
 * @example
 * const [isLoading, setIsLoading] = useState(false);
 */

