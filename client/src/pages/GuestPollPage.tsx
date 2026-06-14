import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SchedulingPollGrid } from '../components/OrganizationManagement/tabs/SchedulingPollGrid';
import { GuestMinutesSection } from '../components/GuestMinutesSection';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Icon } from '../components/ui/Icon';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/shared/ErrorState';
import { TimezoneBanner } from '../components/shared/TimezoneBanner';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { cn } from '../components/ui/utils';
import {
  guestSchedulingApi,
  GuestSchedulingError,
  type GuestPollView,
} from '../lib/api/guestScheduling';
import { loadGuestSession, saveGuestSession } from '../lib/guestSession';
import { useTimezone } from '../hooks/useTimezone';
import type { ResponseCount } from '../lib/api/types/scheduling';
type ResponseChoice = 'yes' | 'no' | 'maybe';

export interface GuestPollPageProps {
  token: string;
}

export function GuestPollPage({ token }: GuestPollPageProps) {
  const { t } = useTranslation('guest');
  const { formatDateTime, formatTime } = useTimezone();
  const [view, setView] = useState<GuestPollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [myResponses, setMyResponses] = useState<Record<string, ResponseChoice>>({});
  const [sessionToken, setSessionToken] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const loadView = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = loadGuestSession(token);
      const data = await guestSchedulingApi.getPollView(token, stored?.sessionToken);
      setView(data);
      if (stored?.displayName) {
        setDisplayName(stored.displayName);
      } else if (data.guestSession?.displayName) {
        setDisplayName(data.guestSession.displayName);
      }
      if (stored?.sessionToken) {
        setSessionToken(stored.sessionToken);
      }
      if (data.guestSession?.responses?.length) {
        const next: Record<string, ResponseChoice> = {};
        for (const r of data.guestSession.responses) {
          next[r.slotId] = r.response;
        }
        setMyResponses(next);
      }
    } catch (e) {
      const msg =
        e instanceof GuestSchedulingError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('loadError');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void loadView();
  }, [loadView]);

  const countsBySlot = useMemo(() => {
    const map = new Map<string, ResponseCount>();
    for (const rc of view?.responseCounts ?? []) {
      map.set(rc.slotId, rc);
    }
    return map;
  }, [view?.responseCounts]);

  const handleResponseChange = (slotId: string, response: ResponseChoice | '') => {
    setMyResponses((prev) => {
      const next = { ...prev };
      if (response === '') {
        delete next[slotId];
      } else {
        next[slotId] = response;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!view || view.poll.status !== 'open') return;
    setSaving(true);
    try {
      const responses = Object.entries(myResponses).map(([slotId, response]) => ({
        slotId,
        response,
      }));
      const result = await guestSchedulingApi.saveResponses(token, {
        displayName: displayName.trim() || undefined,
        sessionToken,
        responses,
      });
      setSessionToken(result.sessionToken);
      saveGuestSession(token, {
        sessionToken: result.sessionToken,
        displayName: result.displayName,
      });
      setDisplayName(result.displayName);
      toast.success(t('savedBookmark'));
      const refreshed = await guestSchedulingApi.getPollView(token, result.sessionToken);
      setView(refreshed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const isOpen = view?.poll.status === 'open';

  return (
    <div className={cn('min-h-screen bg-background', SPACING.page.all)}>
        <div className={cn('mx-auto max-w-4xl', SPACING.content.gap, 'flex flex-col')}>
          {loading && <LoadingState message={t('loading')} />}

          {!loading && error && (
            <ErrorState title={t('invalidLink')} message={error} onRetry={() => void loadView()} />
          )}

          {!loading && !error && view && (
            <>
              <header className={SPACING.content.gap}>
                <p className={cn('text-sm', COLORS.text.muted)}>{t('subtitle')}</p>
                <h1 className={cn('text-2xl font-semibold', COLORS.text.primary)}>
                  {view.poll.title || t('defaultPollTitle')}
                </h1>
                {view.poll.description && (
                  <p className={cn('text-sm', COLORS.text.secondary)}>{view.poll.description}</p>
                )}
              </header>

              <TimezoneBanner />

              {view.chosenSlot && (
                <div
                  className={cn(
                    'border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20',
                    RADIUS.panel,
                    SPACING.card.padding
                  )}
                  role="status"
                >
                  <p className={cn('text-sm font-medium', COLORS.text.primary)}>
                    {t('meetingScheduled')}:{' '}
                    {formatDateTime(view.chosenSlot.startAt)}
                    {view.chosenSlot.endAt ? ` – ${formatTime(view.chosenSlot.endAt)}` : ''}
                  </p>
                </div>
              )}

              {view.meeting && (
                <section
                  className={cn(
                    'border border-border/60 bg-card',
                    RADIUS.panel,
                    SPACING.card.padding,
                    SPACING.content.gap,
                    'flex flex-col'
                  )}
                >
                  <h2 className={cn('text-lg font-semibold', COLORS.text.primary)}>
                    {view.meeting.title}
                  </h2>
                  <p className={cn('text-sm', COLORS.text.secondary)}>
                    {formatDateTime(view.meeting.scheduledAt)}
                    {view.meeting.endAt ? ` – ${formatTime(view.meeting.endAt)}` : ''}
                  </p>
                  {view.meeting.location && (
                    <p className={cn('text-sm', COLORS.text.secondary)}>{view.meeting.location}</p>
                  )}
                  {view.meeting.meetingLink && (
                    <Button
                      type="button"
                      onClick={() => window.open(view.meeting!.meetingLink!, '_blank', 'noopener,noreferrer')}
                    >
                      <Icon name="Video" className="mr-2 h-4 w-4" aria-hidden />
                      {t('joinVideo')}
                    </Button>
                  )}
                  {!view.meeting.minutesFinalizedAt && !view.minutesBlocks?.length && (
                    <p className={cn('text-sm', COLORS.text.muted)}>{t('minutesPending')}</p>
                  )}
                </section>
              )}

              {isOpen && (
                <section
                  className={cn(
                    'border border-border/60 bg-card',
                    RADIUS.panel,
                    SPACING.card.padding,
                    SPACING.content.gap,
                    'flex flex-col'
                  )}
                >
                  <div className="max-w-xs">
                    <Label htmlFor="guest-display-name">{t('yourName')}</Label>
                    <Input
                      id="guest-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('yourNamePlaceholder')}
                      maxLength={80}
                      className="mt-1"
                    />
                  </div>

                  <SchedulingPollGrid
                    slots={view.slots.map((s) => ({
                      id: s.id,
                      startAt: s.startAt,
                      endAt: s.endAt,
                      sortOrder: 0,
                    }))}
                    countsBySlot={countsBySlot}
                    myResponses={myResponses}
                    onResponseChange={handleResponseChange}
                    isOpen={true}
                  />

                  <div>
                    <Button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || Object.keys(myResponses).length === 0}
                    >
                      {saving ? t('saving') : t('saveAvailability')}
                    </Button>
                  </div>
                </section>
              )}

              {!isOpen && view.poll.status !== 'open' && !view.chosenSlot && (
                <p className={cn('text-sm', COLORS.text.muted)}>{t('pollClosed')}</p>
              )}

              {view.minutesBlocks && view.minutesBlocks.length > 0 && (
                <GuestMinutesSection blocks={view.minutesBlocks} />
              )}
            </>
          )}
        </div>
      </div>
  );
}
