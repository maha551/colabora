import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { COLORS } from '../../../lib/designSystem';
import { getEventTypeAccentClass, type EventTypeAccent } from './agendaSheetUtils';

const LEGEND_ITEMS: { accent: EventTypeAccent; icon: string; labelKey: string }[] = [
  { accent: 'meeting', icon: 'Video', labelKey: 'dashboardSheetTypeMeeting' },
  { accent: 'poll', icon: 'Clock', labelKey: 'dashboardSheetTypePoll' },
  { accent: 'document', icon: 'FileText', labelKey: 'dashboardSheetTypeDocument' },
  { accent: 'election', icon: 'UserCheck', labelKey: 'dashboardSheetTypeElection' },
];

export function AgendaEventTypeLegend() {
  const { t } = useTranslation('organization');

  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 mt-2', COLORS.text.secondary)}
      role="group"
      aria-label={t('dashboardSheetLegendAria')}
      data-testid="agenda-event-type-legend"
    >
      {LEGEND_ITEMS.map(({ accent, icon, labelKey }) => (
        <span key={accent} className="inline-flex items-center gap-1 text-xs">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', getEventTypeAccentClass(accent))}
            aria-hidden
          />
          <Icon name={icon} className="h-3 w-3 shrink-0" aria-hidden />
          <span>{t(labelKey)}</span>
        </span>
      ))}
    </div>
  );
}
