import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VersionHistory, Paragraph } from '../../types';
import { Icon } from '../ui/Icon';
import { DiffViewer } from '../DiffViewer';
import { useTimezone } from '../../hooks/useTimezone';
import {
  DecisionCardShell,
  DecisionCardMeta,
  DecisionCardInset,
  DecisionArchiveVoteBar,
} from '../ActivityFeed/decisions/shared';

interface ParagraphChangeCardProps {
  history: VersionHistory;
  paragraph?: Paragraph;
  organizationBorderColor?: string | null;
  votingDeadline?: string | null;
  proVotes?: number;
  contraVotes?: number;
  neutralVotes?: number;
  totalEligibleVoters?: number;
  /** Paragraph/section label from API (preferred over paragraph prop for archive cards) */
  paragraphTitle?: string;
  /** Document title — used to avoid repeating it when timeline already shows it */
  documentTitle?: string;
  suppressContextDup?: boolean;
}

function ParagraphChangeCardComponent({
  history,
  paragraph,
  organizationBorderColor,
  votingDeadline,
  proVotes = 0,
  contraVotes = 0,
  neutralVotes = 0,
  totalEligibleVoters = 0,
  paragraphTitle: paragraphTitleProp,
  documentTitle,
  suppressContextDup = false,
}: ParagraphChangeCardProps) {
  const { t } = useTranslation('activity');
  const { formatDate, formatTime, formatRelativeTime } = useTimezone();

  const acceptedAt = history.acceptedAt instanceof Date
    ? history.acceptedAt
    : new Date(history.acceptedAt);
  const formattedDate = isNaN(acceptedAt.getTime())
    ? t('paragraphChange.unknownDate')
    : `${formatDate(acceptedAt)} ${formatTime(acceptedAt, { hour: '2-digit', minute: '2-digit' })}`;

  const isTitleChange = (history.type || '').toUpperCase() === 'TITLE';
  const headingLevelLabel = history.headingLevel ? history.headingLevel.toUpperCase() : undefined;

  const resolvedParagraphTitle =
    paragraphTitleProp?.trim() ||
    paragraph?.title ||
    paragraph?.text?.substring(0, 50) ||
    undefined;
  const isDocumentTitle = paragraph?.isDocumentTitle || false;

  const acceptedText = useMemo(
    () => (history.newText ?? history.new_text ?? history.text ?? '').trim(),
    [history.newText, history.new_text, history.text]
  );
  const previousText = useMemo(() => (history.oldText ?? '').trim(), [history.oldText]);
  const headingLevel = history.headingLevel ?? history.heading_level ?? undefined;

  const showParagraphContext =
    !!resolvedParagraphTitle &&
    !(
      suppressContextDup &&
      documentTitle &&
      resolvedParagraphTitle === documentTitle.trim()
    );

  const changeTypeLabel = isTitleChange
    ? (isDocumentTitle
        ? t('paragraphChange.titleChange')
        : headingLevelLabel
          ? t('paragraphChange.headingChangeWithLevel', { level: headingLevelLabel })
          : t('paragraphChange.headingChange'))
    : t('paragraphChange.bodyChange');

  const title = (
    <>
      {t('paragraphChange.title')}
      {showParagraphContext && (
        <span className="text-muted-foreground ml-2 text-sm font-normal">
          •{' '}
          {isDocumentTitle
            ? t('paragraphChange.documentTitle')
            : resolvedParagraphTitle!.length > 40
              ? `${resolvedParagraphTitle!.substring(0, 40)}...`
              : resolvedParagraphTitle}
        </span>
      )}
    </>
  );

  const meta = (
    <DecisionCardMeta>
      <DecisionCardMeta.Actor
        name={history.user?.name || t('paragraphChange.unknownCollaborator')}
        avatar={history.user?.avatar}
      />
      <DecisionCardMeta.Date formatted={formattedDate} />
      {votingDeadline && new Date(votingDeadline) > new Date() && (
        <DecisionCardMeta.Chip icon={<Icon name="Clock" className="h-3 w-3" />}>
          {t('paragraphChange.ends', { time: formatRelativeTime(votingDeadline) })}
        </DecisionCardMeta.Chip>
      )}
      <DecisionCardMeta.Chip>{changeTypeLabel}</DecisionCardMeta.Chip>
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
      icon="Edit3"
      title={title}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
    >
      {(acceptedText || previousText) && (
        <DecisionCardInset>
          <DiffViewer
            originalText={previousText}
            suggestion1Text={acceptedText || previousText}
            inline
            highlightColor="green"
            isHeading={isTitleChange}
            headingLevel={headingLevel}
            originalLabel={t('paragraphChange.previousVersion')}
          />
        </DecisionCardInset>
      )}
    </DecisionCardShell>
  );
}

export const ParagraphChangeCard = React.memo(ParagraphChangeCardComponent);
