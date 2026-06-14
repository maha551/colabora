import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimezone } from '../hooks/useTimezone';
import type { Document } from '../types';
import { Button } from './ui/button';
import { Icon } from './ui/Icon';
import { LoadingState } from './ui/LoadingState';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { useMinutesDocumentTimeline } from '../hooks/useMinutesDocumentTimeline';
import {
  ProtocolTimelineCanvas,
  createReadOnlyBlockRenderers,
} from './OrganizationManagement/blocks';
import { getHeadingClass, documentSpacing, contrastColors } from '../lib/documentStyles';

export interface MinutesDocumentViewProps {
  document: Document;
  organizationId: string;
  onNavigateToMeeting?: (hash: string) => void;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  /** When true, show document title in page chrome style (AgreedDocument layout). */
  showDocumentChrome?: boolean;
}

export function MinutesDocumentView({
  document,
  organizationId,
  onNavigateToMeeting,
  onNavigateToDocument,
  onNavigateToHash,
  showDocumentChrome = true,
}: MinutesDocumentViewProps) {
  const { t } = useTranslation('documents');
  const { formatDateTime } = useTimezone();
  const meetingId = document.meetingId;

  const { timelineItems, agendaItems, meetingDetail, loading, error } = useMinutesDocumentTimeline({
    organizationId,
    meetingId,
  });

  const blockRenderers = useMemo(
    () =>
      createReadOnlyBlockRenderers({
        organizationId,
        meetingId,
        onNavigateToDocument,
        onNavigateToHash,
      }),
    [organizationId, meetingId, onNavigateToDocument, onNavigateToHash],
  );

  const meetingHash =
    organizationId && meetingId
      ? `#/organization/${organizationId}/meetings/${meetingId}`
      : null;

  const handleOpenMeeting = () => {
    if (meetingHash && onNavigateToMeeting) {
      onNavigateToMeeting(meetingHash);
    }
  };

  const finalizedAt = document.minutesFinalizedAt ?? meetingDetail?.minutesFinalizedAt ?? null;
  const scheduledAt = document.meetingScheduledAt;

  if (!meetingId) {
    return (
      <div
        className={cn(
          'border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm',
          RADIUS.panel,
        )}
        role="status"
      >
        <p className="text-amber-900 dark:text-amber-200">
          {t('minutesDocument.noMeetingLinked', {
            defaultValue: 'This minutes document is not linked to a meeting. Protocol entries cannot be loaded.',
          })}
        </p>
      </div>
    );
  }

  const header = (
    <div className={cn(SPACING.section.margin, 'space-y-3')}>
      {showDocumentChrome && (
        <div className={cn(SPACING.section.margin, 'border-b-2 border-border pb-6')}>
          <h1
            className={cn(getHeadingClass('h1', true), 'text-3xl sm:text-4xl md:text-5xl', contrastColors.text.high)}
          >
            {document.title}
          </h1>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {finalizedAt ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-medium',
                RADIUS.control,
                COLORS.statusBg.success,
                COLORS.status.success,
              )}
            >
              <Icon name="CheckCircle2" className="h-3.5 w-3.5" />
              {t('minutesDocument.finalized', { defaultValue: 'Finalized' })}
              <span className="font-normal opacity-80">
                ({formatDateTime(finalizedAt)})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t('minutesDocument.draft', { defaultValue: 'Draft minutes' })}
            </span>
          )}
          {scheduledAt && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Icon name="Calendar" className="h-3.5 w-3.5" />
              {formatDateTime(scheduledAt)}
            </span>
          )}
        </div>
        {meetingHash && onNavigateToMeeting && (
          <Button type="button" variant="default" size="sm" onClick={handleOpenMeeting}>
            <Icon name="Video" className="mr-2 h-4 w-4" />
            {t('minutesDocument.openInMeeting', { defaultValue: 'Open in meeting' })}
          </Button>
        )}
      </div>
      <p className={cn('text-sm', COLORS.text.secondary)}>
        {t('minutesDocument.readOnlyHint', {
          defaultValue: 'This is a read-only view of the meeting protocol. Edit entries in the meeting page.',
        })}
      </p>
    </div>
  );

  const body = (
    <LoadingState isLoading={loading} mode="skeleton" skeletonVariant="card" skeletonCount={4}>
      {error ? (
        <p className={cn('text-sm py-4', COLORS.text.hint)} role="alert">
          {t('minutesDocument.loadError', {
            defaultValue: 'Could not load meeting protocol.',
          })}{' '}
          {error}
        </p>
      ) : meetingDetail ? (
        <ProtocolTimelineCanvas
          timelineItems={timelineItems}
          agendaItems={agendaItems}
          meetingDetail={meetingDetail}
          layout="standalone"
          readOnly
          showAgendaNav
          blockRenderers={blockRenderers}
          ariaLabel={t('minutesDocument.protocolLabel', { defaultValue: 'Meeting protocol' })}
        />
      ) : null}
    </LoadingState>
  );

  if (!showDocumentChrome) {
    return (
      <div className="space-y-4">
        {header}
        {body}
      </div>
    );
  }

  return (
    <div className={cn('relative', documentSpacing.section, contrastColors.text.high)}>
      {header}
      {body}
    </div>
  );
}
