import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { useTimezone } from '../../../hooks/useTimezone';
import type { DecisionEntry } from '../../../types/decisions';
import { AgreedViewPreview } from '../AgreedViewPreview';
import {
  DecisionCardShell,
  DecisionCardMeta,
  DecisionCardActions,
  DecisionCardLink,
  DecisionArchiveVoteBar,
} from './shared';

interface DocumentStatusDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToDocument: (documentId: string) => void;
  organizationBorderColor?: string | null;
  /** Timeline already shows document name — avoid repeating title/badge */
  suppressContextDup?: boolean;
}

export function DocumentStatusDecisionCard({
  entry,
  onNavigateToDocument,
  organizationBorderColor,
  suppressContextDup = false,
}: DocumentStatusDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const documentTitle = p.documentTitle ? String(p.documentTitle) : t('item.document');
  const changedByName = p.changedByName ? String(p.changedByName) : undefined;
  const proVotes = Number(p.proVotes ?? 0);
  const contraVotes = Number(p.contraVotes ?? 0);
  const neutralVotes = Number(p.neutralVotes ?? 0);
  const totalEligibleVoters = Number(p.totalEligibleVoters ?? 0);
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const isAdopted = entry.outcome === 'accepted';
  const outcomeLabel = isAdopted ? t('item.documentAdopted') : t('item.documentRejected');

  const cardTitle = suppressContextDup ? outcomeLabel : documentTitle;

  const meta = (
    <DecisionCardMeta>
      {changedByName && <DecisionCardMeta.Actor name={changedByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      {!suppressContextDup && (
        <DecisionCardMeta.Status
          status={isAdopted ? 'approved' : 'rejected'}
          label={outcomeLabel}
        />
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
      icon="FileText"
      title={cardTitle}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
      footer={
        entry.documentId ? (
          <DecisionCardActions>
            <DecisionCardLink onClick={() => onNavigateToDocument(entry.documentId!)}>
              <Icon name="FileText" className="h-3 w-3 mr-1" />
              {t('item.viewDocument')}
            </DecisionCardLink>
          </DecisionCardActions>
        ) : undefined
      }
    >
      {isAdopted && entry.documentId && (
        <AgreedViewPreview
          documentId={entry.documentId}
          documentTitle={documentTitle}
          bodyOnly
        />
      )}
    </DecisionCardShell>
  );
}
