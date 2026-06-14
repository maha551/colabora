import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { OrganizationAvatar } from '../../shared/OrganizationAvatar';
import type { OrganizationAvatarData } from '../../../utils/organizationUtils';
import { useDesignSystemLabels } from '../../../hooks/useDesignSystemLabels';
import { useTimezone } from '../../../hooks/useTimezone';
import type { DecisionEntry } from '../../../types/decisions';
import {
  DecisionCardShell,
  DecisionCardMeta,
  DecisionCardInset,
  DecisionCardActions,
  DecisionCardLink,
  DecisionArchiveVoteBar,
} from './shared';

interface OrganizationVoteDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  organizationBorderColor?: string | null;
  organizationAvatarData?: OrganizationAvatarData;
  hideContextLinks?: boolean;
}

export function OrganizationVoteDecisionCard({
  entry,
  onNavigateToDocument,
  onNavigateToOrganization,
  organizationBorderColor,
  organizationAvatarData,
  hideContextLinks = false,
}: OrganizationVoteDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { t: tOrg } = useTranslation('organization');
  const { cardActions } = useDesignSystemLabels();
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const title = String(p.title ?? t('item.organizationVote'));
  const description = p.description ? String(p.description) : undefined;
  const voteType = p.voteType ? String(p.voteType) : undefined;
  const voteTypeLabel = voteType
    ? tOrg(`transparencySection.voteType_${voteType}`, { defaultValue: voteType.replace(/_/g, ' ') })
    : undefined;
  const proposedByName = p.proposedByName != null ? String(p.proposedByName) : undefined;
  const resultYes = Number(p.resultYes ?? 0);
  const resultNo = Number(p.resultNo ?? 0);
  const resultAbstain = Number(p.resultAbstain ?? 0);
  const totalEligibleVoters = Number(p.totalEligibleVoters ?? 0);
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const statusLabel =
    entry.outcome === 'passed'
      ? t('outcome.passed')
      : entry.outcome === 'failed'
        ? t('outcome.failed')
        : t('outcome.cancelled');
  const statusKey =
    entry.outcome === 'passed' ? 'passed' : entry.outcome === 'cancelled' ? 'cancelled' : 'failed';

  const meta = (
    <DecisionCardMeta>
      {proposedByName && <DecisionCardMeta.Actor name={proposedByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      {voteTypeLabel && <DecisionCardMeta.Chip>{voteTypeLabel}</DecisionCardMeta.Chip>}
      <DecisionCardMeta.Status status={statusKey} label={statusLabel} />
    </DecisionCardMeta>
  );

  const showDocLink = entry.documentId && onNavigateToDocument;
  const showOrgLink = entry.organizationId && onNavigateToOrganization && !hideContextLinks;

  const voteBar = (
    <DecisionArchiveVoteBar
      pro={resultYes}
      contra={resultNo}
      neutral={resultAbstain}
      totalEligibleVoters={totalEligibleVoters}
    />
  );

  return (
    <DecisionCardShell
      icon="Vote"
      title={title}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
      footer={
        (showDocLink || showOrgLink) ? (
          <DecisionCardActions>
            {showDocLink && (
              <DecisionCardLink onClick={() => onNavigateToDocument(entry.documentId!)}>
                <Icon name="FileText" className="h-3 w-3 mr-1" />
                {cardActions.view}
              </DecisionCardLink>
            )}
            {showOrgLink && (
              <DecisionCardLink onClick={() => onNavigateToOrganization(entry.organizationId!)}>
                <OrganizationAvatar
                  organization={organizationAvatarData ?? { name: entry.organizationName || t('item.organization') }}
                  size="xs"
                  className="mr-1"
                />
                {entry.organizationName || t('item.organization')}
              </DecisionCardLink>
            )}
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
