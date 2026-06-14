import { cn } from "./utils";
import { RADIUS } from '../../lib/designSystem';

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse", RADIUS.control, className)}
      {...props}
    />
  );
}

export { Skeleton };




