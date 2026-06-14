import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';

interface HistoryViewToggleProps {
  viewMode: 'timeline' | 'grouped';
  onViewModeChange: (mode: 'timeline' | 'grouped') => void;
  className?: string;
}

export function HistoryViewToggle({ 
  viewMode, 
  onViewModeChange,
  className 
}: HistoryViewToggleProps) {
  const { t } = useTranslation('activity');

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant={viewMode === 'timeline' ? 'default' : 'outline'}
        size="sm"
        className="h-7 px-2 py-1 gap-1"
        onClick={() => onViewModeChange('timeline')}
        aria-label={t('viewTimelineAria')}
        aria-pressed={viewMode === 'timeline'}
      >
        <Icon name="Clock" className="h-3.5 w-3.5 mr-0.5" />
        {t('timeline')}
      </Button>
      <Button
        variant={viewMode === 'grouped' ? 'default' : 'outline'}
        size="sm"
        className="h-7 px-2 py-1 gap-1"
        onClick={() => onViewModeChange('grouped')}
        aria-label={t('viewGroupedAria')}
        aria-pressed={viewMode === 'grouped'}
      >
        <Icon name="Folder" className="h-3.5 w-3.5 mr-0.5" />
        {t('groupedByDocument')}
      </Button>
    </div>
  );
}
