/**
 * Returns design system labels (vote, card actions) translated via i18n.
 * Use in components that need VOTE.labels or CARD_ACTIONS strings.
 */
import { useTranslation } from 'react-i18next';
import { VOTE_LABEL_KEYS, CARD_ACTION_KEYS } from '../lib/designSystem';

export function useDesignSystemLabels() {
  const { t } = useTranslation();

  return {
    voteLabels: {
      pro: t(VOTE_LABEL_KEYS.pro),
      neutral: t(VOTE_LABEL_KEYS.neutral),
      contra: t(VOTE_LABEL_KEYS.contra),
      notVoted: t(VOTE_LABEL_KEYS.notVoted),
    },
    cardActions: {
      viewDetails: t(CARD_ACTION_KEYS.viewDetails),
      open: t(CARD_ACTION_KEYS.open),
      view: t(CARD_ACTION_KEYS.view),
      vote: t(CARD_ACTION_KEYS.vote),
      voteNow: t(CARD_ACTION_KEYS.voteNow),
    },
  };
}
