import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
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

interface StructureProposalDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToDocument: (documentId: string) => void;
  organizationBorderColor?: string | null;
  hideContextLinks?: boolean;
}

export function StructureProposalDecisionCard({
  entry,
  onNavigateToDocument,
  organizationBorderColor,
  hideContextLinks = false,
}: StructureProposalDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { cardActions } = useDesignSystemLabels();
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const title = String(p.title ?? t('item.structureProposal'));
  const description = p.description ? String(p.description) : undefined;
  const createdByName = p.createdByName ? String(p.createdByName) : undefined;
  const proVotes = Number(p.proVotes ?? 0);
  const contraVotes = Number(p.contraVotes ?? 0);
  const neutralVotes = Number(p.neutralVotes ?? 0);
  const totalEligibleVoters = Number(p.totalEligibleVoters ?? 0);
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const isAccepted = entry.outcome === 'accepted';

  const meta = (
    <DecisionCardMeta>
      {createdByName && <DecisionCardMeta.Actor name={createdByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      <DecisionCardMeta.Status
        status={isAccepted ? 'approved' : 'rejected'}
        label={isAccepted ? t('outcome.approved') : t('outcome.rejected')}
      />
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
      icon="Network"
      title={title}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
      footer={
        entry.documentId ? (
          <DecisionCardActions>
            <DecisionCardLink onClick={() => onNavigateToDocument(entry.documentId!)}>
              <Icon name="FileText" className="h-3 w-3 mr-1" />
              {hideContextLinks ? cardActions.view : (entry.documentTitle || t('item.document'))}
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
