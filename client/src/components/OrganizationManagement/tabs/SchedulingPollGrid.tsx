import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { SPACING, COLORS, TOUCH_TARGETS, RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { useTimezone } from '../../../hooks/useTimezone';
import type { SchedulingPollSlot } from '../../../lib/api/types/scheduling';
import type { ResponseCount } from '../../../lib/api/types/scheduling';

export type ResponseChoice = 'yes' | 'no' | 'maybe';

const RESPONSE_CYCLE: (ResponseChoice | '')[] = ['', 'yes', 'no', 'maybe'];

interface SchedulingPollGridProps {
  slots: SchedulingPollSlot[];
  countsBySlot: Map<string, ResponseCount>;
  myResponses: Record<string, ResponseChoice>;
  onResponseChange: (slotId: string, response: ResponseChoice | '') => void;
  isOpen: boolean;
}

/** Build time×date grid from slots: rows = times, cols = dates. */
function buildTimeDateGrid(
  slots: SchedulingPollSlot[],
  getDateKey: (date: string) => string,
  formatTimeKey: (date: string) => string
) {
  const dateKeys = [...new Set(slots.map((s) => getDateKey(s.startAt)))].sort();
  const timeKeys = [...new Set(slots.map((s) => formatTimeKey(s.startAt)))].sort();
  const slotByKey = new Map<string, SchedulingPollSlot>();
  for (const s of slots) {
    const d = getDateKey(s.startAt);
    const t = formatTimeKey(s.startAt);
    slotByKey.set(`${d}_${t}`, s);
  }
  return { dateKeys, timeKeys, slotByKey };
}

export function SchedulingPollGrid({
  slots,
  countsBySlot,
  myResponses,
  onResponseChange,
  isOpen,
}: SchedulingPollGridProps) {
  const { t } = useTranslation('organization');
  const { formatDate, formatTime, formatDateTime, getDateKey } = useTimezone();

  const formatTimeKey = useCallback(
    (iso: string) => formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false }),
    [formatTime]
  );

  const slotLabel = useCallback(
    (startAt: string, endAt: string) =>
      `${formatDateTime(startAt, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} – ${formatTime(endAt, { hour: '2-digit', minute: '2-digit', hour12: false })}`,
    [formatDateTime, formatTime]
  );

  const { dateKeys, timeKeys, slotByKey } = useMemo(
    () => buildTimeDateGrid(slots, getDateKey, formatTimeKey),
    [slots, getDateKey, formatTimeKey]
  );

  const maxEffectiveYes = useMemo(() => {
    let max = 0;
    for (const slot of slotByKey.values()) {
      const rc = countsBySlot.get(slot.id);
      const serverYes = rc?.yes ?? 0;
      const serverTotal = (rc?.yes ?? 0) + (rc?.no ?? 0) + (rc?.maybe ?? 0);
      const myResp = myResponses[slot.id];
      const effectiveYes = myResp === 'yes' && serverTotal === 0 ? 1 : serverYes;
      if (effectiveYes > max) max = effectiveYes;
    }
    return max;
  }, [slotByKey, countsBySlot, myResponses]);

  const dragPaintRef = useRef<ResponseChoice | '' | null>(null);
  const mouseDownSlotIdRef = useRef<string | null>(null);
  const didDragRef = useRef(false);

  const handleCellMouseDown = useCallback(
    (slotId: string) => {
      if (!isOpen) return;
      didDragRef.current = false;
      mouseDownSlotIdRef.current = slotId;
      const current = myResponses[slotId] ?? '';
      const idx = RESPONSE_CYCLE.indexOf(current);
      const next = RESPONSE_CYCLE[(idx + 1) % RESPONSE_CYCLE.length];
      const value = next === '' ? '' : (next as ResponseChoice);
      dragPaintRef.current = value;
      onResponseChange(slotId, value);
    },
    [isOpen, myResponses, onResponseChange]
  );

  const handleCellClick = useCallback(
    (slotId: string) => {
      if (!isOpen) return;
      if (mouseDownSlotIdRef.current === slotId) {
        mouseDownSlotIdRef.current = null;
        return;
      }
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      const current = myResponses[slotId] ?? '';
      const idx = RESPONSE_CYCLE.indexOf(current);
      const next = RESPONSE_CYCLE[(idx + 1) % RESPONSE_CYCLE.length];
      onResponseChange(slotId, next === '' ? '' : (next as ResponseChoice));
    },
    [isOpen, myResponses, onResponseChange]
  );

  const handleCellMouseEnter = useCallback(
    (slotId: string) => {
      if (!isOpen || dragPaintRef.current === null) return;
      didDragRef.current = true;
      onResponseChange(slotId, dragPaintRef.current);
    },
    [isOpen, onResponseChange]
  );

  useEffect(() => {
    const onMouseUp = () => {
      dragPaintRef.current = null;
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  const stickyFirst = 'sticky left-0 z-10 bg-card border-r border-border';

  const bestSlotIds = useMemo(() => {
    if (slots.length === 0) return new Set<string>();
    let maxYes = 0;
    for (const slot of slots) {
      const rc = countsBySlot.get(slot.id);
      if (rc && rc.yes > maxYes) maxYes = rc.yes;
    }
    if (maxYes === 0) return new Set<string>();
    const best = new Set<string>();
    for (const slot of slots) {
      const rc = countsBySlot.get(slot.id);
      if (rc && rc.yes === maxYes) best.add(slot.id);
    }
    return best;
  }, [slots, countsBySlot]);

  // When2Meet-style: two panels (Your availability | Group availability), time on Y, date on X
  if (dateKeys.length > 0 && timeKeys.length > 0) {
    return (
      <div className={cn(SPACING.content.gap, 'grid grid-cols-1 lg:grid-cols-2')}>
        {/* Your availability */}
        <div className={cn("border overflow-hidden", RADIUS.control)}>
          <div className={cn('px-3 py-2 border-b bg-muted/50')}>
            <h4 className="font-medium text-sm">{t('schedulingYourAvailability')}</h4>
            <p className={cn(COLORS.text.secondary, 'text-xs mt-0.5')}>{t('schedulingClickDragToggle')}</p>
            <div className="flex gap-3 mt-1.5 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-green-500/80" aria-hidden />
                {t('schedulingAvailable')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-red-400/60" aria-hidden />
                {t('schedulingUnavailable')}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn('w-20 min-w-[5rem]', stickyFirst)} />
                  {dateKeys.map((d) => (
                    <TableHead key={d} className="min-w-[4rem] px-1 py-1.5 text-center text-xs font-medium">
                      {formatDate(`${d}T12:00:00.000Z`, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeKeys.map((timeKey) => (
                  <TableRow key={timeKey}>
                    <TableHead scope="row" className={cn(stickyFirst, 'text-xs font-medium')}>
                      {timeKey}
                    </TableHead>
                    {dateKeys.map((dateKey) => {
                      const slot = slotByKey.get(`${dateKey}_${timeKey}`);
                      if (!slot) return <TableCell key={dateKey} className="p-0.5 bg-muted/30" />;
                      const response = myResponses[slot.id] ?? '';
                      const isAvailable = response === 'yes';
                      const isUnavailable = response === 'no';
                      return (
                        <TableCell key={slot.id} className="p-0.5">
                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => handleCellClick(slot.id)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleCellMouseDown(slot.id);
                              }}
                              onMouseEnter={() => handleCellMouseEnter(slot.id)}
                              className={cn(
                                'w-full min-h-[1.75rem] rounded border transition-colors select-none',
                                isAvailable && 'bg-green-500/80 hover:bg-green-500',
                                isUnavailable && 'bg-red-400/60 hover:bg-red-400/80',
                                (response === 'maybe' || !response) && 'bg-muted/50 hover:bg-muted'
                              )}
                              aria-label={slotLabel(slot.startAt, slot.endAt) + (response ? `: ${response}` : '')}
                            />
                          ) : (
                            <span
                              className={cn(
                                'block w-full min-h-[1.75rem] rounded border',
                                isAvailable && 'bg-green-500/80',
                                isUnavailable && 'bg-red-400/60',
                                (response === 'maybe' || !response) && 'bg-muted/50'
                              )}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Group availability */}
        <div className={cn("border overflow-hidden", RADIUS.control)}>
          <div className={cn('px-3 py-2 border-b bg-muted/50')}>
            <h4 className="font-medium text-sm">{t('schedulingGroupAvailability')}</h4>
            <p className={cn(COLORS.text.secondary, 'text-xs mt-0.5')}>{t('schedulingMouseoverSeeWho')}</p>
            <div className="flex gap-3 mt-1.5 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-muted" aria-hidden />
                {t('schedulingGroupLegendNone')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-green-500/70 dark:bg-green-600/70" aria-hidden />
                {t('schedulingGroupLegendSome')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-green-600 dark:bg-green-700" aria-hidden />
                {t('schedulingGroupLegendMostPicked')}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn('w-20 min-w-[5rem]', stickyFirst)} />
                  {dateKeys.map((d) => (
                    <TableHead key={d} className="min-w-[4rem] px-1 py-1.5 text-center text-xs font-medium">
                      {formatDate(`${d}T12:00:00.000Z`, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeKeys.map((timeKey) => (
                  <TableRow key={timeKey}>
                    <TableHead scope="row" className={cn(stickyFirst, 'text-xs font-medium')}>
                      {timeKey}
                    </TableHead>
                    {dateKeys.map((dateKey) => {
                      const slot = slotByKey.get(`${dateKey}_${timeKey}`);
                      if (!slot) return <TableCell key={dateKey} className="p-0.5 bg-muted/30" />;
                      const rc = countsBySlot.get(slot.id);
                      const serverYes = rc?.yes ?? 0;
                      const serverTotal = (rc?.yes ?? 0) + (rc?.no ?? 0) + (rc?.maybe ?? 0);
                      const myResp = myResponses[slot.id];
                      const effectiveYes = myResp === 'yes' && serverTotal === 0 ? 1 : serverYes;
                      const effectiveTotal = serverTotal > 0 ? serverTotal : (myResp ? 1 : 0);
                      const hasAvailable = effectiveYes > 0;
                      const isMostPicked = hasAvailable && maxEffectiveYes > 0 && effectiveYes === maxEffectiveYes;
                      const greenIntensity = isMostPicked
                        ? 'bg-green-600 dark:bg-green-700'
                        : hasAvailable
                          ? 'bg-green-500/70 dark:bg-green-600/70'
                          : '';
                      return (
                        <TableCell
                          key={slot.id}
                          className={cn(
                            'p-0.5 text-center',
                            hasAvailable && greenIntensity,
                            !hasAvailable && effectiveTotal === 0 && 'bg-muted/50',
                            !hasAvailable && effectiveTotal > 0 && 'bg-red-100 dark:bg-red-950/40'
                          )}
                          title={effectiveTotal > 0 ? t('schedulingGroupTooltip', { yes: effectiveYes, total: effectiveTotal }) : undefined}
                        >
                          {effectiveTotal > 0 ? (
                            <span className="text-xs font-medium">{effectiveYes}/{effectiveTotal}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: single table (one column per slot) when slots don't form a clear time×date grid
  return (
    <Table className={cn(SPACING.card.base)} aria-label={t('schedulingSlots')}>
      <TableHeader>
        <TableRow>
          <TableHead className={cn('w-32 min-w-[8rem]', stickyFirst)} />
          {slots.map((slot) => (
            <TableHead
              key={slot.id}
              className={cn('min-w-[7rem] whitespace-nowrap px-2 py-2 text-center font-medium')}
            >
              {slotLabel(slot.startAt, slot.endAt)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead scope="row" className={cn(stickyFirst, 'text-left font-medium')}>
            {t('schedulingAvailability')}
          </TableHead>
          {slots.map((slot) => {
            const rc = countsBySlot.get(slot.id);
            const isBest = bestSlotIds.has(slot.id);
            return (
              <TableCell
                key={slot.id}
                className={cn(
                  'px-2 py-2 text-center text-sm',
                  isBest && cn(COLORS.statusBg.success, 'opacity-80')
                )}
                title={isBest ? t('schedulingBestTime') : undefined}
              >
                {rc ? (
                  <span className={cn(COLORS.text.secondary)}>
                    {rc.yes}✓ {rc.no}✗ {rc.maybe}?
                  </span>
                ) : (
                  '–'
                )}
              </TableCell>
            );
          })}
        </TableRow>
        <TableRow>
          <TableHead scope="row" className={cn(stickyFirst, 'text-left font-medium')}>
            {t('schedulingYourResponse')}
          </TableHead>
          {slots.map((slot) => {
            const response = myResponses[slot.id] ?? '';
            const slotDateLabel = slotLabel(slot.startAt, slot.endAt);
            const responseLabel = response ? t(`scheduling${response.charAt(0).toUpperCase()}${response.slice(1)}`) : '';
            const ariaLabel = response
              ? t('schedulingSlotAria', { date: slotDateLabel, response: responseLabel })
              : t('schedulingSlotAriaNone', { date: slotDateLabel });
            return (
              <TableCell key={slot.id} className="p-1 text-center align-middle">
                {isOpen ? (
                  <button
                    type="button"
                    onClick={() => handleCellClick(slot.id)}
                    className={cn(
                      'w-full min-w-[2.75rem] rounded border transition-colors',
                      TOUCH_TARGETS.minHeight,
                      response === 'yes' && COLORS.statusBg.success,
                      response === 'no' && COLORS.statusBg.error,
                      response === 'maybe' && COLORS.statusBg.warning,
                      !response && 'bg-muted/50 hover:bg-muted'
                    )}
                    aria-label={ariaLabel}
                  >
                    <span className="text-sm font-medium">
                      {response === 'yes' && '✓'}
                      {response === 'no' && '✗'}
                      {response === 'maybe' && '?'}
                      {!response && '–'}
                    </span>
                  </button>
                ) : (
                  <span className={cn(COLORS.text.secondary, 'text-sm')}>
                    {response === 'yes' && '✓'}
                    {response === 'no' && '✗'}
                    {response === 'maybe' && '?'}
                    {!response && '–'}
                  </span>
                )}
              </TableCell>
            );
          })}
        </TableRow>
      </TableBody>
    </Table>
  );
}
