/**
 * VoteRadioGroup Component
 * 
 * Reusable radio group for voting interfaces supporting both:
 * - Yes/No/Abstain format (for organization votes, rule proposals)
 * - PRO/NEUTRAL/CONTRA format (for document proposals)
 * 
 * Uses design system constants for consistent spacing and accessibility.
 */

import { useTranslation } from 'react-i18next';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { SPACING, TOUCH_TARGETS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export type VoteValueYesNo = 'yes' | 'no' | 'abstain';
export type VoteValueProContra = 'PRO' | 'NEUTRAL' | 'CONTRA';
export type VoteValue = VoteValueYesNo | VoteValueProContra;

export type VoteType = 'yes-no-abstain' | 'pro-neutral-contra';

interface VoteRadioGroupProps {
  /** Current selected vote value */
  value: string;
  /** Callback when vote selection changes */
  onValueChange: (value: VoteValue) => void;
  /** Vote type determines the value format */
  voteType?: VoteType;
  /** Disabled state */
  disabled?: boolean;
  /** Custom ID prefix for accessibility (default: 'vote') */
  idPrefix?: string;
  /** Custom className */
  className?: string;
}

/**
 * VoteRadioGroup Component
 * 
 * Provides a standardized voting interface with proper accessibility
 * and design system integration.
 * 
 * @example
 * // Yes/No/Abstain format
 * <VoteRadioGroup
 *   value={voteChoice}
 *   onValueChange={setVoteChoice}
 *   voteType="yes-no-abstain"
 * />
 * 
 * @example
 * // PRO/NEUTRAL/CONTRA format
 * <VoteRadioGroup
 *   value={vote}
 *   onValueChange={setVote}
 *   voteType="pro-neutral-contra"
 * />
 */
export function VoteRadioGroup({
  value,
  onValueChange,
  voteType = 'yes-no-abstain',
  disabled = false,
  idPrefix = 'vote',
  className,
}: VoteRadioGroupProps) {
  const { t } = useTranslation('common');
  const handleValueChange = (newValue: string) => {
    onValueChange(newValue as VoteValue);
  };

  if (voteType === 'pro-neutral-contra') {
    return (
      <RadioGroup
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
        className={cn(SPACING.content.gap, className)}
      >
        <div className={cn('flex items-center', SPACING.content.inline)}>
          <RadioGroupItem
            value="PRO"
            id={`${idPrefix}-pro`}
            className={TOUCH_TARGETS.minHeight}
          />
          <Label htmlFor={`${idPrefix}-pro`} className="cursor-pointer">
            {t('voteRadio.proApprove')}
          </Label>
        </div>
        <div className={cn('flex items-center', SPACING.content.inline)}>
          <RadioGroupItem
            value="NEUTRAL"
            id={`${idPrefix}-neutral`}
            className={TOUCH_TARGETS.minHeight}
          />
          <Label htmlFor={`${idPrefix}-neutral`} className="cursor-pointer">
            {t('voteRadio.neutralNoOpinion')}
          </Label>
        </div>
        <div className={cn('flex items-center', SPACING.content.inline)}>
          <RadioGroupItem
            value="CONTRA"
            id={`${idPrefix}-contra`}
            className={TOUCH_TARGETS.minHeight}
          />
          <Label htmlFor={`${idPrefix}-contra`} className="cursor-pointer">
            {t('voteRadio.contraDisapprove')}
          </Label>
        </div>
      </RadioGroup>
    );
  }

  // Default: yes-no-abstain format
  return (
    <RadioGroup
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      className={cn(SPACING.content.gap, className)}
    >
      <div className={cn('flex items-center', SPACING.content.inline)}>
        <RadioGroupItem
          value="yes"
          id={`${idPrefix}-yes`}
          className={TOUCH_TARGETS.minHeight}
        />
        <Label htmlFor={`${idPrefix}-yes`} className="cursor-pointer">
          {t('voteRadio.yesApprove')}
        </Label>
      </div>
      <div className={cn('flex items-center', SPACING.content.inline)}>
        <RadioGroupItem
          value="no"
          id={`${idPrefix}-no`}
          className={TOUCH_TARGETS.minHeight}
        />
        <Label htmlFor={`${idPrefix}-no`} className="cursor-pointer">
          {t('voteRadio.noDisapprove')}
        </Label>
      </div>
      <div className={cn('flex items-center', SPACING.content.inline)}>
        <RadioGroupItem
          value="abstain"
          id={`${idPrefix}-abstain`}
          className={TOUCH_TARGETS.minHeight}
        />
        <Label htmlFor={`${idPrefix}-abstain`} className="cursor-pointer">
          {t('voteRadio.abstain')}
        </Label>
      </div>
    </RadioGroup>
  );
}

