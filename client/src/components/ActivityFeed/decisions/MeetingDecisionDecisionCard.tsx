import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
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
  MeetingVoteArchiveBar,
  type MeetingVoteOptionResult,
} from './shared';

interface MeetingDecisionDecisionCardProps {
  entry: DecisionEntry;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  organizationBorderColor?: string | null;
  organizationAvatarData?: OrganizationAvatarData;
  hideContextLinks?: boolean;
  suppressContextDup?: boolean;
}

export function MeetingDecisionDecisionCard({
  entry,
  onNavigateToDocument,
  onNavigateToOrganization,
  onNavigateToHash,
  organizationBorderColor,
  organizationAvatarData,
  hideContextLinks = false,
  suppressContextDup = false,
}: MeetingDecisionDecisionCardProps) {
  const { t } = useTranslation('activity');
  const { formatDate, formatTime } = useTimezone();
  const p = entry.payload as Record<string, unknown>;
  const title = String(p.title ?? p.voteTitle ?? t('item.meetingDecision'));
  const text = p.text ? String(p.text) : '';
  const meetingTitle = p.meetingTitle ? String(p.meetingTitle) : entry.documentTitle;
  const agendaItemTitle = p.agendaItemTitle ? String(p.agendaItemTitle) : undefined;
  const createdByName = p.createdByName != null ? String(p.createdByName) : undefined;
  const meetingId = p.meetingId ? String(p.meetingId) : undefined;
  const minutesDocumentId = p.minutesDocumentId ? String(p.minutesDocumentId) : entry.documentId;
  const voteTitle = p.voteTitle ? String(p.voteTitle) : undefined;
  const voteOptions = Array.isArray(p.voteOptions)
    ? (p.voteOptions as MeetingVoteOptionResult[])
    : [];
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  const formattedDate = `${formatDate(timestamp)} ${formatTime(timestamp, { hour: '2-digit', minute: '2-digit' })}`;

  const meetingHash =
    entry.organizationId && meetingId
      ? `#/organization/${entry.organizationId}/meetings/${meetingId}`
      : null;

  const showMeetingChip = meetingTitle && !suppressContextDup;

  const meta = (
    <DecisionCardMeta>
      {createdByName && <DecisionCardMeta.Actor name={createdByName} />}
      <DecisionCardMeta.Date formatted={formattedDate} />
      {agendaItemTitle && (
        <DecisionCardMeta.Chip icon={<Icon name="ListOrdered" className="h-3 w-3" />}>
          {agendaItemTitle}
        </DecisionCardMeta.Chip>
      )}
      {showMeetingChip && (
        <DecisionCardMeta.Chip icon={<Icon name="Video" className="h-3 w-3" />}>
          {meetingTitle}
        </DecisionCardMeta.Chip>
      )}
      <DecisionCardMeta.Status status="recorded" label={t('outcome.recorded')} />
    </DecisionCardMeta>
  );

  const voteBar =
    voteOptions.length > 0 ? (
      <MeetingVoteArchiveBar voteTitle={voteTitle} options={voteOptions} />
    ) : undefined;

  return (
    <DecisionCardShell
      icon="CheckCircle2"
      title={title}
      meta={meta}
      voteBar={voteBar}
      organizationBorderColor={organizationBorderColor}
      footer={
        <DecisionCardActions>
          {meetingHash && onNavigateToHash && !hideContextLinks && (
            <DecisionCardLink onClick={() => onNavigateToHash(meetingHash)}>
              <Icon name="Video" className="h-3 w-3 mr-1" />
              {t('item.openMeeting')}
            </DecisionCardLink>
          )}
          {minutesDocumentId && onNavigateToDocument && (
            <DecisionCardLink onClick={() => onNavigateToDocument(minutesDocumentId)}>
              <Icon name="FileText" className="h-3 w-3 mr-1" />
              {t('item.viewMinutes')}
            </DecisionCardLink>
          )}
          {entry.organizationId && onNavigateToOrganization && !hideContextLinks && (
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
      }
    >
      {text && (
        <DecisionCardInset>
          <blockquote className="border-l-2 border-primary/30 pl-2 text-sm text-foreground whitespace-pre-wrap">
            {text}
          </blockquote>
        </DecisionCardInset>
      )}
    </DecisionCardShell>
  );
}
