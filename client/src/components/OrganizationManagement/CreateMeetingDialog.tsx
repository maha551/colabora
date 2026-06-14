import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SPACING, COLORS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { meetingsApi, schedulingApi } from '../../lib/api';
import type { Meeting } from '../../lib/api/types/meetings';
import type { SchedulingPoll } from '../../lib/api/types/scheduling';
import { toast } from 'sonner';
import { useVideoRoomCreationEnabled } from '../../hooks/useVideoRoomConfig';
import { useTimezone } from '../../hooks/useTimezone';
import { TimezoneBanner } from '../shared/TimezoneBanner';

export interface InitialFromPoll {
  pollId: string;
  defaultTitle: string;
  startAt: string;
  endAt: string;
}

export interface CreateMeetingFormProps {
  organizationId: string;
  /** Called after a meeting is created (direct create path). */
  onSuccess: (meeting: Meeting) => void;
  /** When true, show "Create via scheduling poll" option (Schedule tab, reps only). */
  showCreateViaPoll?: boolean;
  /** Called when user creates a new date poll instead of a meeting. */
  onPollCreated?: (poll: SchedulingPoll) => void;
  /** Called when user cancels (e.g. back button on full page). Omit in dialog to use onOpenChange. */
  onCancel?: () => void;
  /** If true, render as standalone form with heading (e.g. full page). If false, no extra heading. */
  showHeading?: boolean;
  /** Submit button label override. */
  submitLabel?: string;
  /** When set, form is in "create meeting from existing poll" mode: pre-fill title/date from poll, submit via createMeetingFromPoll. */
  initialFromPoll?: InitialFromPoll;
}

function resetForm(
  setTitle: (v: string) => void,
  setScheduled: (v: string) => void,
  setEnd: (v: string) => void,
  setLocation: (v: string) => void,
  setRoom: (v: boolean) => void,
  setLink: (v: string) => void,
  setViaPoll?: (v: boolean) => void
) {
  setTitle('');
  setScheduled('');
  setEnd('');
  setLocation('');
  setRoom(false);
  setLink('');
  setViaPoll?.(false);
}

export function CreateMeetingForm({
  organizationId,
  onSuccess,
  showCreateViaPoll = false,
  onPollCreated,
  onCancel,
  showHeading = false,
  submitLabel,
  initialFromPoll,
}: CreateMeetingFormProps) {
  const { t } = useTranslation('organization');
  const { toDateTimeLocalValue, fromDateTimeLocalValue } = useTimezone();
  const videoRoomCreationEnabled = useVideoRoomCreationEnabled();
  const [title, setTitle] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [createRoom, setCreateRoom] = useState(false);
  const [link, setLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [viaPoll, setViaPoll] = useState(false);

  useEffect(() => {
    if (initialFromPoll) {
      setTitle(initialFromPoll.defaultTitle);
      setScheduled(toDateTimeLocalValue(initialFromPoll.startAt));
      setEnd(toDateTimeLocalValue(initialFromPoll.endAt));
    }
  }, [initialFromPoll, toDateTimeLocalValue]);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();

    if (initialFromPoll) {
      setSubmitting(true);
      try {
        const created = await meetingsApi.createMeetingFromPoll(organizationId, initialFromPoll.pollId, {
          title: trimmedTitle || undefined,
          createRoom: createRoom && !link.trim(),
        });
        let meeting: Meeting = created;
        if (link.trim() || location.trim()) {
          meeting = await meetingsApi.updateMeeting(organizationId, created.id, {
            ...(link.trim() && { meeting_link: link.trim() }),
            ...(location.trim() && { location: location.trim() }),
          });
        }
        toast.success(t('meetingCreated'));
        onSuccess(meeting);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('meetingError'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!trimmedTitle) {
      toast.error(t('titleRequired'));
      return;
    }

    if (viaPoll && showCreateViaPoll && onPollCreated) {
      setSubmitting(true);
      try {
        const description = location.trim()
          ? `${t('meetingLocation')}: ${location.trim()}`
          : t('datePollForMeeting');
        const { poll } = await schedulingApi.createSchedulingPoll(organizationId, {
          title: trimmedTitle,
          description,
        });
        toast.success(t('datePollCreated'));
        onPollCreated(poll);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('schedulingError'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!scheduled.trim()) {
      toast.error(t('dateTimeRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const scheduledDate = fromDateTimeLocalValue(scheduled);
      const endDate = end.trim() ? fromDateTimeLocalValue(end) : null;
      if (!scheduledDate || (end.trim() && !endDate)) {
        toast.error(t('dateTimeRequired'));
        return;
      }
      const scheduled_at = scheduledDate.toISOString();
      const end_at = endDate?.toISOString() ?? null;
      const created = await meetingsApi.createMeeting(organizationId, {
        title: trimmedTitle,
        scheduled_at,
        end_at,
        location: location.trim() || null,
        createRoom: createRoom && !link.trim(),
      });
      let meeting: Meeting = created;
      if (link.trim()) {
        meeting = await meetingsApi.updateMeeting(organizationId, created.id, {
          meeting_link: link.trim(),
        });
      }
      toast.success(t('meetingCreated'));
      onSuccess(meeting);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('meetingError'));
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveSubmitLabel =
    submitLabel ?? (submitting ? t('saving') : initialFromPoll ? t('add') : viaPoll ? t('createDatePoll') : t('add'));

  return (
    <div className={cn(SPACING.content.gap, 'flex flex-col')}>
      <h2 className={cn('text-lg font-semibold', !showHeading && 'sr-only')}>
        {t('newMeeting')}
      </h2>
      <div className={cn(SPACING.content.gap)}>
        <div>
          <Label>{initialFromPoll ? t('meetingTitle') : `${t('meetingTitle')} *`}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('meetingTitle')}
          />
        </div>
        {showCreateViaPoll && !initialFromPoll && (
          <div className={cn(SPACING.tight.inline, 'flex items-center gap-2')}>
            <input
              type="checkbox"
              id="create-meeting-via-poll"
              checked={viaPoll}
              onChange={(e) => setViaPoll(e.target.checked)}
            />
            <Label htmlFor="create-meeting-via-poll" className="font-normal cursor-pointer">
              {t('meetingScheduleViaPoll')}
            </Label>
          </div>
        )}
        {showCreateViaPoll && viaPoll && !initialFromPoll && (
          <p className={cn(COLORS.text.secondary, 'text-sm')}>
            {t('meetingScheduleViaPollHint')}
          </p>
        )}
        {(initialFromPoll || !viaPoll) && <TimezoneBanner />}
        {initialFromPoll ? (
          <>
            <div>
              <Label>{t('meetingDate')} / {t('meetingTime')}</Label>
              <Input type="datetime-local" value={scheduled} disabled aria-readonly />
            </div>
            <div>
              <Label>{t('meetingEndTime')} (optional)</Label>
              <Input type="datetime-local" value={end} disabled aria-readonly />
            </div>
          </>
        ) : !viaPoll && (
          <>
            <div>
              <Label>{t('meetingDate')} / {t('meetingTime')} *</Label>
              <Input
                type="datetime-local"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </div>
            <div>
              <Label>{t('meetingEndTime')} (optional)</Label>
              <Input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <Label>{t('meetingLocation')}</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('meetingLocation')}
          />
        </div>
        {(!viaPoll || initialFromPoll) && (
          <>
            {videoRoomCreationEnabled && (
              <div className={cn(SPACING.tight.inline, 'flex items-center')}>
                <input
                  type="checkbox"
                  id="create-meeting-room"
                  checked={createRoom}
                  onChange={(e) => setCreateRoom(e.target.checked)}
                />
                <Label htmlFor="create-meeting-room">{t('createVideoRoom')}</Label>
              </div>
            )}
            <div>
              <Label>{t('pasteLink')} (optional)</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </>
        )}
      </div>
      <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', onCancel && 'mt-4')}>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={
            submitting ||
            (!initialFromPoll && !title.trim()) ||
            (!initialFromPoll && !viaPoll && !scheduled.trim())
          }
        >
          {effectiveSubmitLabel}
        </Button>
      </div>
    </div>
  );
}

export interface FromPollContext {
  pollId: string;
  chosenSlot: { startAt: string; endAt: string };
  defaultTitle: string;
}

/** Modal wrapper for create-meeting form. In-app "new meeting" uses full-page NewMeetingPage via hash #/organization/:id/meetings/new. */
export interface CreateMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Called after a meeting is created (direct create path). */
  onSuccess: (meeting: Meeting) => void;
  /** When true, show "Create via scheduling poll" option (Schedule tab, reps only). */
  showCreateViaPoll?: boolean;
  /** Called when user creates a new date poll instead of a meeting. */
  onPollCreated?: (poll: SchedulingPoll) => void;
  /** When set, form is in "create meeting from existing poll" mode with pre-filled slot. */
  fromPollContext?: FromPollContext | null;
}

export function CreateMeetingDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
  showCreateViaPoll = false,
  onPollCreated,
  fromPollContext,
}: CreateMeetingDialogProps) {
  const { t } = useTranslation('organization');

  const reset = useCallback(() => {
    // Form state resets when dialog closes via key - we rely on unmount or open state
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const initialFromPoll = fromPollContext
    ? {
        pollId: fromPollContext.pollId,
        defaultTitle: fromPollContext.defaultTitle,
        startAt: fromPollContext.chosenSlot.startAt,
        endAt: fromPollContext.chosenSlot.endAt,
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {fromPollContext ? t('createMeetingFromPollTitle') : t('newMeeting')}
          </DialogTitle>
        </DialogHeader>
        <CreateMeetingForm
          key={fromPollContext ? `from-poll-${fromPollContext.pollId}` : 'new-meeting'}
          organizationId={organizationId}
          onSuccess={(meeting) => {
            handleOpenChange(false);
            onSuccess(meeting);
          }}
          showCreateViaPoll={showCreateViaPoll}
          onPollCreated={
            onPollCreated
              ? (poll) => {
                  handleOpenChange(false);
                  onPollCreated(poll);
                }
              : undefined
          }
          onCancel={() => handleOpenChange(false)}
          showHeading={false}
          initialFromPoll={initialFromPoll}
        />
      </DialogContent>
    </Dialog>
  );
}
