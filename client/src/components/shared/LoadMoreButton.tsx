import { Button } from "../ui/button";
import { cn } from "../ui/utils";

interface LoadMoreButtonProps {
  remainingCount: number;
  onLoadMore: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable Load More button component for activity feed tabs
 * Consolidates the repeated Load More button pattern
 */
export function LoadMoreButton({
  remainingCount,
  onLoadMore,
  className,
  disabled = false,
}: LoadMoreButtonProps) {
  return (
    <div className="flex justify-center pt-4">
      <Button
        variant="outline"
        onClick={onLoadMore}
        disabled={disabled}
        className={cn("w-full sm:w-auto", className)}
      >
        Load More ({remainingCount} more)
      </Button>
    </div>
  );
}

