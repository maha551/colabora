import React from 'react';
import { useTranslation } from 'react-i18next';
import { OrganizationAvatar } from '../../shared/OrganizationAvatar';
import type { OrganizationAvatarData } from '../../../utils/organizationUtils';
import { useTimezone } from '../../../hooks/useTimezone';
import type { DecisionEntry } from '../../../types/decisions';
import {
  DecisionCardShell,
  DecisionCardMeta,
  DecisionCardActions,
  DecisionCardLink,
  DecisionArchiveVoteBar,
} from './shared';

interface DocumentDeletionDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToOrganization?: (organizationId: string) => void;
  organizationBorderColor?: string | null;
  organizationAvatarData?: OrganizationAvatarData;
  hideContextLinks?: boolean;
}

export function DocumentDeletionDecisionCard({
  entry,
  onNavigateToOrganization,
  organizationBorderColor,
  organizationAvatarData,
  hideContextLinks = false,
}: DocumentDeletionDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const documentTitle = entry.documentTitle || String(p.documentTitle ?? t('item.document'));
  const changedByName = p.changedByName ? String(p.changedByName) : undefined;
  const proVotes = Number(p.proVotes ?? 0);
  const contraVotes = Number(p.contraVotes ?? 0);
  const neutralVotes = Number(p.neutralVotes ?? 0);
  const totalEligibleVoters = Number(p.totalEligibleVoters ?? 0);
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const isAccepted = entry.outcome === 'accepted';
  const outcomeLabel = isAccepted ? t('item.documentDeletionApproved') : t('item.documentDeletionRejected');
  const cardTitle = t('item.documentDeletionTitle', { title: documentTitle });

  const meta = (
    <DecisionCardMeta>
      {changedByName && <DecisionCardMeta.Actor name={changedByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      <DecisionCardMeta.Status
        status={isAccepted ? 'approved' : 'rejected'}
        label={outcomeLabel}
      />
      {isAccepted && !entry.documentId && (
        <DecisionCardMeta.Chip>{t('item.documentRemoved')}</DecisionCardMeta.Chip>
      )}
    </DecisionCardMeta>
  );

  const voteBar = (
    <DecisionArchiveVoteBar
      pro={proVotes}
      contra={contraVotes}
      neutral={neutralVotes}
      totalEligibleVoters={totalEligibleVoters}
    />
  );

  return (
    <DecisionCardShell
      icon="Trash2"
      title={cardTitle}
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
    />
  );
}
