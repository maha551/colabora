import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import {
  calendarApi,
  type CalendarExportRange,
} from '../../lib/api/calendar';

export interface CalendarExportMenuProps {
  organizationId: string;
  month: Date;
}

export function CalendarExportMenu({ organizationId, month }: CalendarExportMenuProps) {
  const { t } = useTranslation('organization');

  const handleExport = (range: CalendarExportRange) => {
    const { from, to } = calendarApi.getCalendarExportRangeDates(range, month);
    const url = calendarApi.getCalendarIcalDownloadUrl(organizationId, from, to);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon name="Download" className="h-4 w-4 mr-2" />
          {t('calendarExportIcal')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('this_month')}>
          {t('calendarExportThisMonth')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('next_3_months')}>
          {t('calendarExportNext3Months')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('next_12_months')}>
          {t('calendarExportNext12Months')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
