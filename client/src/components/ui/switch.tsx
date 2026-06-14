"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "./utils";
import { RADIUS } from '../../lib/designSystem';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-switch-background focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center border border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50", RADIUS.pill,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-card dark:data-[state=unchecked]:bg-card-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0", RADIUS.pill,
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };




