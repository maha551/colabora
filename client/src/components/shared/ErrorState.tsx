import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export type ErrorStateVariant = 'full-page' | 'inline' | 'toast';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  variant: ErrorStateVariant;
  className?: string;
}

const defaultMessage = 'Something went wrong. Please try again.';

export function ErrorState({
  message = defaultMessage,
  onRetry,
  variant,
  className,
}: ErrorStateProps): React.ReactElement {
  if (variant === 'full-page') {
    return (
      <div
        className={cn(
          'flex min-h-[280px] flex-col items-center justify-center gap-4 border border-border bg-card p-8 text-center',
          RADIUS.panel,
          className
        )}
        role="alert"
      >
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        {onRetry && (
          <Button onClick={onRetry} variant="default">
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'toast') {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm',
          RADIUS.control,
          className
        )}
        role="alert"
      >
        <span className="text-destructive/90">{message}</span>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" size="sm">
            Retry
          </Button>
        )}
      </div>
    );
  }

  // inline
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm',
        RADIUS.control,
        className
      )}
      role="alert"
    >
      <span className="text-muted-foreground">{message}</span>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          Retry
        </Button>
      )}
    </div>
  );
}
