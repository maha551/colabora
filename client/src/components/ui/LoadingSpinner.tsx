import { cn } from "./utils";
import { RADIUS } from '../../lib/designSystem';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin border-primary/30 border-t-primary', RADIUS.pill,
        sizeClasses[size],
        className
      )}
    />
  );
}

