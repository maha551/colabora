import React from 'react';
import { useTranslation } from 'react-i18next';
import { ParagraphChangeCard } from '../../shared/ParagraphChangeCard';
import type { DecisionEntry } from '../../../types/decisions';
import type { VersionHistory } from '../../../types';

interface ParagraphChangeDecisionCardProps {
  entry: DecisionEntry;
  organizationBorderColor?: string | null;
  suppressContextDup?: boolean;
}

/** Adapts DecisionEntry payload to VersionHistory for ParagraphChangeCard */
export function ParagraphChangeDecisionCard({
  entry,
  organizationBorderColor,
  suppressContextDup = false,
}: ParagraphChangeDecisionCardProps) {
  const { t } = useTranslation('activity');
  const p = entry.payload as Record<string, unknown>;
  const history: VersionHistory = {
    id: String(p.id),
    paragraphId: String(p.paragraphId),
    userId: String(p.userId),
    text: String(p.text ?? ''),
    oldText: p.oldText != null ? String(p.oldText) : undefined,
    proposalId: p.proposalId != null ? String(p.proposalId) : undefined,
    acceptedAt: p.acceptedAt ? new Date(String(p.acceptedAt)) : new Date(),
    approvalPercentage: Number(p.approvalPercentage ?? 0),
    type: (p.type as string) || 'BODY',
    headingLevel: p.headingLevel as VersionHistory['headingLevel'],
    user: (p.user as VersionHistory['user']) || { id: '', name: t('item.unknown') },
  };
  return (
    <ParagraphChangeCard
      history={history}
      organizationBorderColor={organizationBorderColor}
      proVotes={Number(p.proVotes ?? 0)}
      contraVotes={Number(p.contraVotes ?? 0)}
      neutralVotes={Number(p.neutralVotes ?? 0)}
      totalEligibleVoters={Number(p.totalEligibleVoters ?? 0)}
      paragraphTitle={p.paragraphTitle != null ? String(p.paragraphTitle) : undefined}
      documentTitle={entry.documentTitle}
      suppressContextDup={suppressContextDup}
    />
  );
}
