import { LoadingSpinner } from './LoadingSpinner';
import { LoadingSkeleton } from './LoadingSkeleton';

interface LazyLoadFallbackProps {
  message?: string;
  variant?: 'spinner' | 'skeleton';
}

export function LazyLoadFallback({ 
  message = 'Loading...',
  variant = 'spinner' 
}: LazyLoadFallbackProps) {
  if (variant === 'skeleton') {
    return <LoadingSkeleton />;
  }
  
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}
