import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleDisplayInfo } from '../lib/ruleLabels';
import { RULE_FIELD_KEYS } from '../lib/ruleLabels';

export function useRuleLabels() {
  const { t } = useTranslation('governance');

  const getRuleLabel = useCallback(
    (field: string) => t(`ruleLabels.${field}.label`, { defaultValue: field }),
    [t]
  );

  const getRuleDisplayInfo = useCallback(
    (field: string): RuleDisplayInfo => ({
      label: t(`ruleLabels.${field}.label`, { defaultValue: field }),
      description: t(`ruleLabels.${field}.description`, { defaultValue: '' }),
    }),
    [t]
  );

  return { getRuleLabel, getRuleDisplayInfo, ruleFieldKeys: RULE_FIELD_KEYS };
}
