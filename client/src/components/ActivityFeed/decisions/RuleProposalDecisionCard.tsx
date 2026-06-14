import React from 'react';
import { useTranslation } from 'react-i18next';
import { OrganizationAvatar } from '../../shared/OrganizationAvatar';
import type { OrganizationAvatarData } from '../../../utils/organizationUtils';
import { useTimezone } from '../../../hooks/useTimezone';
import type { DecisionEntry } from '../../../types/decisions';
import { useRuleLabels } from '../../../hooks/useRuleLabels';
import {
  DecisionCardShell,
  DecisionCardMeta,
  DecisionCardInset,
  DecisionCardActions,
  DecisionCardLink,
  DecisionArchiveVoteBar,
} from './shared';

interface RuleProposalDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToOrganization?: (organizationId: string) => void;
  organizationBorderColor?: string | null;
  organizationAvatarData?: OrganizationAvatarData;
  hideContextLinks?: boolean;
}

export function RuleProposalDecisionCard({
  entry,
  onNavigateToOrganization,
  organizationBorderColor,
  organizationAvatarData,
  hideContextLinks = false,
}: RuleProposalDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { getRuleLabel } = useRuleLabels();
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const title = String(p.title ?? t('item.ruleProposal'));
  const description = p.description ? String(p.description) : undefined;
  const ruleField = p.ruleField ? String(p.ruleField) : undefined;
  const votesYes = Number(p.votesYes ?? 0);
  const votesNo = Number(p.votesNo ?? 0);
  const votesAbstain = Number(p.votesAbstain ?? 0);
  const totalEligibleVoters = Number(p.totalEligibleVoters ?? 0);
  const createdByName = p.createdByName ? String(p.createdByName) : undefined;
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const isAccepted = entry.outcome === 'accepted';

  const meta = (
    <DecisionCardMeta>
      {createdByName && <DecisionCardMeta.Actor name={createdByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      {ruleField && (
        <DecisionCardMeta.Chip>{getRuleLabel(ruleField)}</DecisionCardMeta.Chip>
      )}
      <DecisionCardMeta.Status
        status={isAccepted ? 'approved' : 'rejected'}
        label={isAccepted ? t('outcome.approved') : t('outcome.rejected')}
      />
    </DecisionCardMeta>
  );

  const voteBar = (
    <DecisionArchiveVoteBar
      pro={votesYes}
      contra={votesNo}
      neutral={votesAbstain}
      totalEligibleVoters={totalEligibleVoters}
    />
  );

  return (
    <DecisionCardShell
      icon="Shield"
      title={title}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
      footer={
        entry.organizationId && onNavigateToOrganization && !hideContextLinks ? (
          <DecisionCardActions>
            <DecisionCardLink onClick={() => onNavigateToOrganization(entry.organizationId!)}>
              <OrganizationAvatar
                organization={organizationAvatarData ?? { name: entry.organizationName || t('item.organization') }}
                size="xs"
                className="mr-1"
              />
              {entry.organizationName || t('item.organization')}
            </DecisionCardLink>
          </DecisionCardActions>
        ) : undefined
      }
    >
      {description && (
        <DecisionCardInset>
          <p className="text-sm text-muted-foreground">{description}</p>
        </DecisionCardInset>
      )}
    </DecisionCardShell>
  );
}
