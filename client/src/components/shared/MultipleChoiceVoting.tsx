import React from 'react';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { RuleProposal } from '../../types';
import { SPACING, COLORS, TOUCH_TARGETS, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { formatVoteValue } from '../../lib/voting';

interface MultipleChoiceVotingProps {
  ruleProposal: RuleProposal;
  selectedOption: string | null;
  onOptionChange: (optionId: string) => void;
  disabled?: boolean;
  showVoteCounts?: boolean;
}

/**
 * Custom voting UI for rule proposals with multiple options
 * Integrates with SuggestionCard's voting system
 */
export function MultipleChoiceVoting({
  ruleProposal,
  selectedOption,
  onOptionChange,
  disabled = false,
  showVoteCounts = true,
}: MultipleChoiceVotingProps) {
  const getVoteCount = (optionId: string): number => {
    if (!showVoteCounts) return 0;
    
    const option = ruleProposal.options?.find(opt => opt.id === optionId);
    if (option?.votesReceived !== undefined) {
      return option.votesReceived;
    }
    
    // Calculate from votes array
    if (ruleProposal.votes) {
      return ruleProposal.votes.filter(v => v.selectedOptionId === optionId).length;
    }
    
    return 0;
  };

  if (!ruleProposal.options || ruleProposal.options.length === 0) {
    return null;
  }

  return (
    <div className={cn(SPACING.content.gap)}>
      <Label className={cn('text-base font-medium', COLORS.text.primary)}>
        Select your preferred option:
      </Label>
      <RadioGroup
        value={selectedOption || ''}
        onValueChange={onOptionChange}
        disabled={disabled}
        className={cn(SPACING.content.gap)}
      >
        {ruleProposal.options.map((option) => {
          const voteCount = getVoteCount(option.id);
          return (
            <Label
              key={option.id}
              htmlFor={option.id}
              className={cn(
                'flex items-start gap-2 p-3 border',
                RADIUS.panel,
                COLORS.border.standard,
                COLORS.bg.surface,
                TOUCH_TARGETS.button,
                !disabled && 'cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RadioGroupItem
                value={option.id}
                id={option.id}
                className="mt-1"
                disabled={disabled}
              />
              <div className="flex-1">
                <span
                  className={cn(
                    'font-medium block',
                    COLORS.text.primary,
                    disabled && 'cursor-not-allowed'
                  )}
                >
                  {option.optionTitle}
                </span>
                {option.optionDescription && (
                  <p className={cn('text-sm mt-1', COLORS.text.secondary)}>
                    {option.optionDescription}
                  </p>
                )}
                <p className={cn('text-sm mt-1', COLORS.text.secondary)}>
                  Value: {formatVoteValue(ruleProposal.ruleField, option.proposedValue)}
                </p>
                {showVoteCounts && voteCount > 0 && (
                  <p className={cn('text-sm mt-1 font-medium', COLORS.text.secondary)}>
                    {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                  </p>
                )}
              </div>
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

