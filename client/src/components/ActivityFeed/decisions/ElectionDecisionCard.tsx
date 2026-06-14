import React from 'react';
import { useTranslation } from 'react-i18next';
import { OrganizationAvatar } from '../../shared/OrganizationAvatar';
import type { OrganizationAvatarData } from '../../../utils/organizationUtils';
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

interface ElectionDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToOrganization?: (organizationId: string) => void;
  organizationBorderColor?: string | null;
  organizationAvatarData?: OrganizationAvatarData;
  hideContextLinks?: boolean;
}

export function ElectionDecisionCard({
  entry,
  onNavigateToOrganization,
  organizationBorderColor,
  organizationAvatarData,
  hideContextLinks = false,
}: ElectionDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const title = String(p.electionTitle ?? t('item.election'));
  const description = p.electionDescription ? String(p.electionDescription) : undefined;
  const votesCast = Number(p.votesCast ?? 0);
  const totalVoters = p.totalVoters != null ? Number(p.totalVoters) : 0;
  const quorumMet = p.quorumMet != null ? Boolean(p.quorumMet) : undefined;
  const createdByName = p.createdByName ? String(p.createdByName) : undefined;
  const electedCandidates = Array.isArray(p.electedCandidates)
    ? (p.electedCandidates as Array<{ name?: string; votesReceived?: number; position?: number }>)
    : [];
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const isCompleted = entry.outcome === 'completed';

  const meta = (
    <DecisionCardMeta>
      {createdByName && <DecisionCardMeta.Actor name={createdByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      {quorumMet != null && (
        <DecisionCardMeta.Status
          status={quorumMet ? 'passed' : 'failed'}
          label={quorumMet ? t('item.quorumMetShort') : t('item.quorumNotMetShort')}
        />
      )}
      <DecisionCardMeta.Status
        status={isCompleted ? 'completed' : 'cancelled'}
        label={isCompleted ? t('outcome.completed') : t('outcome.cancelled')}
      />
    </DecisionCardMeta>
  );

  const voteBar = (
    <DecisionArchiveVoteBar
      variant="election"
      votesCast={votesCast}
      totalVoters={totalVoters}
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
      {isCompleted && electedCandidates.length > 0 && (
        <DecisionCardInset>
          <p className="text-xs font-medium text-muted-foreground mb-1">{t('item.electedRepresentatives')}</p>
          <ul className="text-sm space-y-0.5">
            {electedCandidates.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                {c.name}
                {c.votesReceived != null && c.votesReceived > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({t('item.votesCount', { count: c.votesReceived })})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </DecisionCardInset>
      )}
    </DecisionCardShell>
  );
}
