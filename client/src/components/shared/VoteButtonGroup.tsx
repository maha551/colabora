/**
 * VoteButtonGroup Component
 *
 * Shared component for PRO/NEUTRAL/CONTRA voting across document and proposal interfaces.
 * Uses design tokens (--vote-pro, --vote-neutral, --vote-contra) for consistent styling.
 * Compact variant uses forceDefault on Icon so vote buttons always render immediately
 * from the Lucide registry — no async flicker even when an org uses Tabler/Heroicons.
 */

import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/button';
import { SPACING, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export type VoteValue = 'PRO' | 'NEUTRAL' | 'CONTRA';

interface VoteButtonGroupProps {
  /** Current selected vote value */
  value?: VoteValue | null;
  /** Callback when user votes */
  onVote: (vote: VoteValue) => void | Promise<void>;
  /** Disabled state (e.g. during submission) */
  disabled?: boolean;
  /** Whether vote is locked (user voted and change not allowed) */
  voteLocked?: boolean;
  /** Variant: compact (icon-only) or full (labeled buttons) */
  variant?: 'compact' | 'full';
  /** Custom class name */
  className?: string;
}

export function VoteButtonGroup({
  value,
  onVote,
  disabled = false,
  voteLocked = false,
  variant = 'full',
  className,
}: VoteButtonGroupProps) {
  const { t } = useTranslation('common');
  const isProSelected = value === 'PRO';
  const isNeutralSelected = value === 'NEUTRAL';
  const isContraSelected = value === 'CONTRA';

  const isProDisabled = disabled || voteLocked;
  const isNeutralDisabled = disabled || voteLocked;
  const isContraDisabled = disabled || voteLocked;

  const handlePro = () => onVote('PRO');
  const handleNeutral = () => onVote('NEUTRAL');
  const handleContra = () => onVote('CONTRA');

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-1', SPACING.content.inline, className)}>
        <Button
          size="icon"
          variant={isProSelected ? 'default' : 'outline'}
          onClick={handlePro}
          disabled={isProDisabled}
          className={cn(
            isProSelected && 'bg-[var(--vote-pro)] hover:bg-[var(--vote-pro)]/90 text-white'
          )}
          aria-label={t('vote.approve')}
        >
          <Icon name="ThumbsUp" size="sm" forceDefault aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant={isNeutralSelected ? 'secondary' : 'outline'}
          onClick={handleNeutral}
          disabled={isNeutralDisabled}
          className={cn(
            isNeutralSelected && 'bg-[var(--vote-neutral)] hover:bg-[var(--vote-neutral)]/90 text-white'
          )}
          aria-label={t('vote.neutral')}
        >
          <Icon name="Minus" size="sm" forceDefault aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant={isContraSelected ? 'destructive' : 'outline'}
          onClick={handleContra}
          disabled={isContraDisabled}
          className={cn(
            isContraSelected && 'bg-[var(--vote-contra)] hover:bg-[var(--vote-contra)]/90 text-white'
          )}
          aria-label={t('vote.reject')}
        >
          <Icon name="ThumbsDown" size="sm" forceDefault aria-hidden="true" />
        </Button>
      </div>
    );
  }

  // Full variant: labeled buttons
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)}>
      <button
        type="button"
        onClick={handlePro}
        disabled={isProDisabled}
        className={cn(
          `px-4 py-3 ${RADIUS.panel} font-medium transition-colors border-2 min-h-11`,
          isProSelected
            ? 'bg-[var(--vote-pro)] text-white border-[var(--vote-pro)]'
            : 'bg-card border-border text-foreground hover:border-[var(--vote-pro)]/60',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {t('vote.approve')}
      </button>
      <button
        type="button"
        onClick={handleNeutral}
        disabled={isNeutralDisabled}
        className={cn(
          `px-4 py-3 ${RADIUS.panel} font-medium transition-colors border-2 min-h-11`,
          isNeutralSelected
            ? 'bg-[var(--vote-neutral)] text-white border-[var(--vote-neutral)]'
            : 'bg-card border-border text-foreground hover:border-[var(--vote-neutral)]/60',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {t('vote.neutral')}
      </button>
      <button
        type="button"
        onClick={handleContra}
        disabled={isContraDisabled}
        className={cn(
          `px-4 py-3 ${RADIUS.panel} font-medium transition-colors border-2 min-h-11`,
          isContraSelected
            ? 'bg-[var(--vote-contra)] text-white border-[var(--vote-contra)]'
            : 'bg-card border-border text-foreground hover:border-[var(--vote-contra)]/60',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {t('vote.reject')}
      </button>
    </div>
  );
}
