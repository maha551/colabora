import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { Button } from './ui/button';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover';
import { cn } from './ui/utils';
import { useOnboarding } from '../hooks/useOnboarding';
import { COLORS, RADIUS } from '../lib/designSystem';

export type HintVariant = 'info' | 'tip' | 'highlight';

export interface OnboardingHintProps {
  hintKey: string;
  message: string;
  variant?: HintVariant;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'inline';
  onDismiss?: () => void;
  showOnce?: boolean;
  delay?: number;
  className?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

const variantStyles = {
  info: {
    container: `${COLORS.statusBg.info} border border-[var(--status-active-border)] ${COLORS.status.info}`,
    icon: COLORS.status.info,
    iconName: 'Info' as const,
  },
  tip: {
    container: `${COLORS.statusBg.warning} border border-[var(--status-pending-border)] ${COLORS.status.warning}`,
    icon: COLORS.status.warning,
    iconName: 'Lightbulb' as const,
  },
  highlight: {
    container: 'bg-[var(--badge-purple-bg)] text-[var(--badge-purple-text)] border border-[var(--status-implemented-border)]',
    icon: 'text-[var(--badge-purple-text)]',
    iconName: 'Sparkles' as const,
  },
};

export function OnboardingHint({
  hintKey,
  message,
  variant = 'info',
  position = 'bottom',
  onDismiss,
  showOnce = true,
  delay = 0,
  className,
  actionLabel,
  onAction,
  children,
}: OnboardingHintProps) {
  const { hasSeenHint, showHint } = useOnboarding();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if hint should be shown
    if (showOnce && hasSeenHint(hintKey)) {
      return;
    }

    // Apply delay if specified
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [hintKey, showOnce, hasSeenHint, delay]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    
    if (showOnce) {
      showHint(hintKey);
    }
    
    onDismiss?.();
  };

  if (isDismissed || !isVisible) {
    return children || null;
  }

  const variantStyle = variantStyles[variant];

  // Inline variant - appears as a banner/card
  if (position === 'inline') {
    return (
      <div
        className={cn(
          'border p-4 flex items-start gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-300', RADIUS.panel,
          variantStyle.container,
          className
        )}
      >
        <Icon name={variantStyle.iconName} className={cn('h-5 w-5 flex-shrink-0 mt-0.5', variantStyle.icon)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{message}</p>
          {actionLabel && onAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAction}
              className="mt-2 h-7 text-xs"
            >
              {actionLabel}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-6 w-6 p-0 flex-shrink-0"
        >
          <Icon name="X" className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const hintContent = (
    <div className="flex items-start gap-2">
      <Icon name={variantStyle.iconName} className={cn('h-4 w-4 flex-shrink-0 mt-0.5', variantStyle.icon)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-relaxed">{message}</p>
        {actionLabel && onAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAction}
            className="mt-2 h-6 text-xs"
          >
            {actionLabel}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        className="h-5 w-5 p-0 flex-shrink-0"
        aria-label="Dismiss hint"
      >
        <Icon name="X" className="h-3 w-3" />
      </Button>
    </div>
  );

  // Popover variant - portaled with viewport collision detection
  return (
    <Popover open={isVisible}>
      <div className="inline-flex">
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      </div>
      <PopoverContent
        side={position}
        align={position === 'bottom' || position === 'top' ? 'end' : 'center'}
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={handleDismiss}
        className={cn(
          'z-50 w-64 max-w-[calc(100vw-2rem)] border p-3 shadow-lg animate-in fade-in-0 zoom-in-95',
          RADIUS.panel,
          variantStyle.container,
          className
        )}
      >
        {hintContent}
      </PopoverContent>
    </Popover>
  );
}
