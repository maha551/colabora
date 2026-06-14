import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { useTimezone } from '../../../hooks/useTimezone';
import { Icon } from '../../ui/Icon';
import { Z_INDEX } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';
import { BlockCanvas } from './BlockCanvas';
import type { BlockTypeRendererMap } from './BlockRenderer';
import { protocolUi } from './protocolUi';
import { DecisionSequenceStack } from './DecisionSequenceStack';
import {
  isDecisionArcStackGroup,
  sortDecisionArcLayers,
} from './decisionSequenceKeys';
import { buildProtocolBlocks } from './protocolBlocks';
import type { ProtocolBlock } from './protocolBlocks.types';
import type { Meeting } from '../../../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../../lib/api/types/meetingAgenda';
import type { MeetingVote, TimelineItem } from '../../../lib/api/types/meetingMinutes';
import {
  dedupeCanvasTimelineBlocks,
  groupBlocksByAgendaId,
  groupBlocksBySequence,
  mergeArcGroups,
  needsDateSeparator,
} from './protocolCanvasLayout';

function DateSeparator({ date, compact }: { date: string; compact?: boolean }) {
  const { formatDate } = useTimezone();
  const formattedDate = formatDate(date);
  if (compact) {
    return (
      <div className="py-1.5 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {formattedDate}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/40" />
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {formattedDate}
      </span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function TimelineRail({
  children,
  compact = false,
  isEmbed = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  isEmbed?: boolean;
}) {
  return (
    <div
      className={cn(
        protocolUi.timelineRail,
        'pl-10',
        compact ? 'space-y-2' : 'space-y-2.5',
        isEmbed && 'max-sm:pl-0 max-sm:before:hidden',
      )}
    >
      {children}
    </div>
  );
}

function TimelineDot({ isEmbed = false }: { isEmbed?: boolean }) {
  return (
    <div
      className={cn(
        protocolUi.timelineDot,
        'bg-muted-foreground/50',
        isEmbed && 'max-sm:hidden',
      )}
    />
  );
}

function useAgendaChipsVisibility(enabled: boolean) {
  const agendaChipsRef = useRef<HTMLDivElement | null>(null);
  const [chipsHidden, setChipsHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = agendaChipsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setChipsHidden(!entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return { agendaChipsRef, chipsHidden };
}

export interface ProtocolTimelineCanvasProps {
  timelineItems: TimelineItem[];
  agendaItems: MeetingAgendaItem[];
  meetingDetail: Pick<Meeting, 'id' | 'currentAgendaItemId' | 'minutesFinalizedAt'>;
  activeVote?: MeetingVote | null;
  layout?: 'embed' | 'standalone';
  isEmbed?: boolean;
  readOnly?: boolean;
  blockRenderers?: BlockTypeRendererMap;
  onNavigateToBlock?: (targetBlockId: string) => void;
  onActNextAction?: (block: ProtocolBlock) => void;
  onSetCurrentTopic?: (agendaItemId: string) => void;
  canSetCurrentTopic?: boolean;
  /** Show agenda jump chips (interactive meeting view). */
  showAgendaNav?: boolean;
  ariaLabel?: string;
  emptyStateLabel?: string;
}

function renderBlockGroup(
  group: ProtocolBlock[],
  groupKey: string,
  options: {
    layout: 'embed' | 'standalone';
    isEmbed: boolean;
    readOnly: boolean;
    blockRenderers?: BlockTypeRendererMap;
    onNavigateToBlock?: (targetBlockId: string) => void;
    onActNextAction?: (block: ProtocolBlock) => void;
    hasMultipleDays: boolean;
    dateSeparatorBlockIds: Set<string>;
    renderDateSep: (isoDate: string, compact?: boolean) => React.ReactNode;
    minutesLabel: string;
    emptyLabel: string;
  },
): React.ReactNode {
  const {
    layout,
    isEmbed,
    readOnly,
    blockRenderers,
    onNavigateToBlock,
    onActNextAction,
    hasMultipleDays,
    dateSeparatorBlockIds,
    renderDateSep,
    minutesLabel,
    emptyLabel,
  } = options;

  const actHandler = readOnly ? undefined : onActNextAction;

  if (!readOnly && isDecisionArcStackGroup(group)) {
    return (
      <DecisionSequenceStack
        key={groupKey}
        layers={sortDecisionArcLayers(group)}
        layout={layout}
        ariaLabel={minutesLabel}
        blockRenderers={blockRenderers}
        onNavigateToBlock={onNavigateToBlock}
        onActNextAction={actHandler}
        readOnly={readOnly}
      />
    );
  }

  return (
    <BlockCanvas
      key={groupKey}
      blocks={group}
      layout={layout}
      compact={isEmbed}
      ariaLabel={minutesLabel}
      emptyStateLabel={emptyLabel}
      blockRenderers={blockRenderers}
      onNavigateToBlock={onNavigateToBlock}
      onActNextAction={actHandler}
      readOnly={readOnly}
      dateSeparatorBlockIds={hasMultipleDays ? dateSeparatorBlockIds : undefined}
      renderDateSeparator={hasMultipleDays ? renderDateSep : undefined}
    />
  );
}

export function ProtocolTimelineCanvas({
  timelineItems,
  agendaItems,
  meetingDetail,
  activeVote = null,
  layout = 'standalone',
  isEmbed = false,
  readOnly = false,
  blockRenderers,
  onNavigateToBlock,
  onActNextAction,
  onSetCurrentTopic,
  canSetCurrentTopic = false,
  showAgendaNav = true,
  ariaLabel,
  emptyStateLabel,
}: ProtocolTimelineCanvasProps) {
  const { t } = useTranslation('organization');
  const { getDateKey } = useTimezone();

  const protocolBlocks = useMemo(
    () =>
      buildProtocolBlocks({
        detail: meetingDetail as Meeting,
        timelineItems,
        agendaItems,
        activeVote,
      }),
    [meetingDetail, timelineItems, agendaItems, activeVote],
  );

  const canvasTimelineBlocks = useMemo(() => {
    const timelineOnly = protocolBlocks.blocks.filter(
      (block): block is ProtocolBlock => block.type !== 'agenda_item',
    );
    return dedupeCanvasTimelineBlocks(timelineOnly);
  }, [protocolBlocks.blocks]);

  const canvasBlocksByAgendaId = useMemo(
    () => groupBlocksByAgendaId(canvasTimelineBlocks),
    [canvasTimelineBlocks],
  );

  const dateSeparatorBlockIds = useMemo(
    () => needsDateSeparator(canvasTimelineBlocks, getDateKey),
    [canvasTimelineBlocks, getDateKey],
  );
  const hasMultipleDays = dateSeparatorBlockIds.size > 0;

  const sortedAgenda = useMemo(
    () => [...agendaItems].sort((a, b) => a.orderIndex - b.orderIndex),
    [agendaItems],
  );

  const { agendaChipsRef, chipsHidden } = useAgendaChipsVisibility(
    showAgendaNav && !readOnly && sortedAgenda.length > 0,
  );

  const currentAgendaTitle = useMemo(() => {
    if (!meetingDetail.currentAgendaItemId) return null;
    return sortedAgenda.find((a) => a.id === meetingDetail.currentAgendaItemId)?.title ?? null;
  }, [meetingDetail.currentAgendaItemId, sortedAgenda]);

  const minutesLabel = ariaLabel ?? t('minutes', { defaultValue: 'Minutes' });
  const emptyLabel =
    emptyStateLabel ?? t('timelineEmptyDescription', { defaultValue: 'No entries yet.' });

  const renderDateSep = useCallback(
    (isoDate: string, compact?: boolean) => (
      <DateSeparator date={isoDate} compact={compact} />
    ),
    [],
  );

  const groupOptions = {
    layout,
    isEmbed,
    readOnly,
    blockRenderers,
    onNavigateToBlock,
    onActNextAction,
    hasMultipleDays,
    dateSeparatorBlockIds,
    renderDateSep,
    minutesLabel,
    emptyLabel,
  };

  const scrollToAgendaSection = (agendaItemId: string) => {
    requestAnimationFrame(() => {
      document.getElementById(`canvas-agenda-${agendaItemId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  };

  return (
    <div className="flex flex-col gap-2.5 pb-2">
      {showAgendaNav && sortedAgenda.length > 0 && (
        <div ref={agendaChipsRef} className={cn(protocolUi.surfaceMuted, 'p-3')}>
          <p className={cn('mb-2', protocolUi.eyebrow)}>
            {t('agenda', { defaultValue: 'Agenda' })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedAgenda.map((agendaItem) => {
              const isActive = meetingDetail.currentAgendaItemId === agendaItem.id;
              if (readOnly) {
                return (
                  <Button
                    key={`canvas-agenda-nav-${agendaItem.id}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 min-w-0 max-w-full shrink"
                    onClick={() => scrollToAgendaSection(agendaItem.id)}
                  >
                    {agendaItem.title}
                  </Button>
                );
              }
              return (
                <Button
                  key={`canvas-agenda-nav-${agendaItem.id}`}
                  type="button"
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  disabled={!canSetCurrentTopic}
                  className={cn(
                    'h-7 min-w-0 max-w-full shrink focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'ring-2 ring-primary/35',
                  )}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    onSetCurrentTopic?.(agendaItem.id);
                    scrollToAgendaSection(agendaItem.id);
                  }}
                >
                  {agendaItem.title}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {!readOnly && chipsHidden && currentAgendaTitle && (
        <div
          className={cn(
            `sticky top-0 ${Z_INDEX.sticky} flex items-center gap-2 bg-background/95 backdrop-blur-sm`,
            'border-b border-border/40 px-3 py-1.5 text-xs font-medium text-muted-foreground',
          )}
        >
          <Icon name="BookOpen" className="h-3 w-3 shrink-0" />
          <span className="truncate">{currentAgendaTitle}</span>
        </div>
      )}

      {canvasTimelineBlocks.length === 0 && sortedAgenda.length === 0 && (
        <BlockCanvas
          blocks={[]}
          layout={layout}
          ariaLabel={minutesLabel}
          emptyStateLabel={emptyLabel}
          onActNextAction={readOnly ? undefined : onActNextAction}
        />
      )}

      {(canvasBlocksByAgendaId.get(null) ?? []).length > 0 && (
        <section className="space-y-2.5">
          <h4 className={protocolUi.eyebrow}>
            {t('beforeFirstTopic', { defaultValue: 'Before first topic' })}
          </h4>
          <TimelineRail compact={isEmbed} isEmbed={isEmbed}>
            {mergeArcGroups(groupBlocksBySequence(canvasBlocksByAgendaId.get(null) ?? [])).map(
              (group, groupIndex) => (
                <div key={`before-first-group-${groupIndex}`} className="relative">
                  <TimelineDot isEmbed={isEmbed} />
                  {renderBlockGroup(group, `before-first-${groupIndex}`, groupOptions)}
                </div>
              ),
            )}
          </TimelineRail>
        </section>
      )}

      {sortedAgenda.map((agendaItem) => {
        const agendaBlocks = canvasBlocksByAgendaId.get(agendaItem.id) ?? [];
        const isActive = meetingDetail.currentAgendaItemId === agendaItem.id;
        return (
          <section
            key={`agenda-section-${agendaItem.id}`}
            id={`canvas-agenda-${agendaItem.id}`}
            className="space-y-2.5 scroll-mt-3"
          >
            {readOnly ? (
              <div className={cn('px-3 py-2.5', protocolUi.surface)}>
                <h4 className={protocolUi.bodyTitle}>{agendaItem.title}</h4>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSetCurrentTopic?.(agendaItem.id)}
                disabled={!canSetCurrentTopic}
                className={cn(
                  'w-full px-3 py-2.5 text-left transition-colors',
                  protocolUi.surface,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'border-primary/50 bg-primary/10 shadow-md'
                    : 'hover:bg-muted/40',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className={cn(protocolUi.bodyTitle, 'pr-2')}>{agendaItem.title}</h4>
                  <span
                    className={cn(
                      protocolUi.meta,
                      'shrink-0 pt-0.5',
                      isActive ? 'text-primary font-medium' : '',
                    )}
                  >
                    {isActive
                      ? t('currentTopicBadge', { defaultValue: 'Current topic' })
                      : t('protocolCanvas.activateTopic', { defaultValue: 'Activate topic' })}
                  </span>
                </div>
              </button>
            )}
            {agendaBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">
                {t('protocolCanvas.topicNoEntriesYet', { defaultValue: 'No entries for this topic yet.' })}
              </p>
            ) : (
              <TimelineRail compact={isEmbed} isEmbed={isEmbed}>
                {mergeArcGroups(groupBlocksBySequence(agendaBlocks)).map((group, groupIndex) => (
                  <div key={`agenda-group-${agendaItem.id}-${groupIndex}`} className="relative">
                    <TimelineDot isEmbed={isEmbed} />
                    {renderBlockGroup(group, `agenda-${agendaItem.id}-${groupIndex}`, groupOptions)}
                  </div>
                ))}
              </TimelineRail>
            )}
          </section>
        );
      })}
    </div>
  );
}
