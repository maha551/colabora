import { useTranslation } from 'react-i18next';
import { RuleProposal, GovernanceRuleValue } from '../../types';
import { SPACING, COLORS, RADIUS } from '../../lib/designSystem';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { cn } from '../ui/utils';

interface RuleMetadataDisplayProps {
  ruleProposal: RuleProposal;
}

/**
 * Displays rule proposal metadata (field, current value, proposed value)
 * Used in both RuleProposalCardWrapper and full voting interface
 */
export function RuleMetadataDisplay({ ruleProposal }: RuleMetadataDisplayProps) {
  const { t } = useTranslation('governance');
  const { getRuleDisplayInfo } = useRuleLabels();

  const getValueDisplay = (field: string, value: GovernanceRuleValue | undefined) => {
    if (value === null || value === undefined) return t('values.notSet');

    const numberFields = ['representativeTermMonths', 'representativeTermLimits', 'electionNoticeDays', 'defaultVotingDeadlineHours', 'documentProposalPeriodDays', 'paragraphProposalCutoffDays', 'minimumVotingPeriodHours'];
    const percentageFields = ['electionQuorumPercentage', 'defaultQuorumPercentage', 'minimumQuorumPercentage', 'minimumApprovalThreshold', 'mistrustVoteQuorumPercentage', 'membersCanProposeRulesThreshold', 'membersCanCreateDocumentsThreshold', 'membersCanInitializeElectionsThreshold', 'membersCanInviteMembersThreshold', 'membersCanManageRuleProposalsThreshold'];
    const percentage100Fields = ['defaultAcceptanceThreshold', 'mistrustVoteThreshold'];
    const booleanFields = ['anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes', 'representativeCanInviteMembers', 'representativeCanManageDocuments', 'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled', 'defaultStructureProposalsEnabled', 'defaultVotingAnonymityLocked', 'membersCanProposeRules', 'membersCanCreateDocuments', 'membersCanInitializeElections', 'membersCanInviteMembers', 'membersCanManageRuleProposals', 'membersCanInitiateMistrustVote'];

    if (numberFields.includes(field)) {
      const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
      if (field.includes('Hours')) return t('tab.hoursUnit', { count: numValue });
      if (field.includes('Days')) return `${numValue}`;
      return t('tab.monthsUnit', { count: numValue });
    }
    if (percentageFields.includes(field)) {
      const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
      return `${Math.round(numValue * 100)}%`;
    }
    if (percentage100Fields.includes(field)) {
      const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
      return `${Math.round(numValue)}%`;
    }
    if (booleanFields.includes(field)) {
      const boolValue = typeof value === 'boolean' ? value : value === 'true' || value === 1;
      return boolValue ? t('values.enabled') : t('values.disabled');
    }
    if (field === 'electionVotingMethod') {
      const strValue = String(value);
      return t(`votingMethods.${strValue}`, { defaultValue: strValue.replace('_', ' ') });
    }
    if (field === 'thresholdCalculationMethod') {
      return value === 'all_votes' ? t('values.allVotes') : t('values.allMembers');
    }

    return String(value);
  };

  const ruleInfo = getRuleDisplayInfo(ruleProposal.ruleField ?? '');
  const currentValueDisplay = getValueDisplay(ruleProposal.ruleField, ruleProposal.currentValue);
  const proposedValueDisplay = getValueDisplay(ruleProposal.ruleField, ruleProposal.proposedValue);

  return (
    <div className={cn(SPACING.content.gap)}>
      <div>
        <h4 className={cn('font-medium', COLORS.text.primary, 'mb-1')}>
          {ruleInfo.label}
        </h4>
        {ruleInfo.description && (
          <p className={cn('text-sm', COLORS.text.secondary)}>
            {ruleInfo.description}
          </p>
        )}
      </div>

      <div className={cn('grid grid-cols-2 gap-4', SPACING.tight.gap)}>
        <div className={cn(RADIUS.control, 'p-3 bg-muted/50')}>
          <div className={cn('text-xs font-medium', COLORS.text.secondary, 'mb-1')}>
            {t('ruleMetadata.currentValue')}
          </div>
          <div className={cn('text-sm font-semibold', COLORS.text.primary)}>
            {currentValueDisplay}
          </div>
        </div>
        <div className={cn(RADIUS.control, 'p-3 bg-muted/50')}>
          <div className={cn('text-xs font-medium', COLORS.text.secondary, 'mb-1')}>
            {t('ruleMetadata.proposedValue')}
          </div>
          <div className={cn('text-sm font-semibold', COLORS.text.primary)}>
            {proposedValueDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
