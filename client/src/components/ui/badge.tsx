import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";
import { RADIUS } from '../../lib/designSystem';

const badgeVariants = cva(
  cn("inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden", RADIUS.control),
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Semantic status variants - using theme tokens
        info: "border-transparent",
        success: "border-transparent",
        warning: "border-transparent",
        purple: "border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Badge = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentProps<"span"> &
    VariantProps<typeof badgeVariants> & { asChild?: boolean }
>(({ className, variant, asChild = false, style, ...props }, ref) => {
  const Comp = asChild ? Slot : "span";

  // Apply semantic badge colors via inline styles
  const badgeStyle = React.useMemo(() => {
    if (variant === 'info') {
      return { backgroundColor: 'var(--badge-info-bg)', color: 'var(--badge-info-text)', ...style };
    }
    if (variant === 'success') {
      return { backgroundColor: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', ...style };
    }
    if (variant === 'warning') {
      return { backgroundColor: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', ...style };
    }
    if (variant === 'purple') {
      return { backgroundColor: 'var(--badge-purple-bg)', color: 'var(--badge-purple-text)', ...style };
    }
    return style;
  }, [variant, style]);

  return (
    <Comp
      ref={ref}
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      style={badgeStyle}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };




