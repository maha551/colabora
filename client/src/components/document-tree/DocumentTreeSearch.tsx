import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { DocumentTreeSearchProps } from './types';
import { cn } from '../ui/utils';

export function DocumentTreeSearch({
  value,
  onChange,
  placeholder = 'Search documents...',
  className,
  onKeyDown,
}: DocumentTreeSearchProps) {
  const { t } = useTranslation('common');
  const [localValue, setLocalValue] = useState(value);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce search
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      onChange(localValue);
    }, 300);

    setDebounceTimer(timer);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [localValue, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Cmd/Ctrl+K to focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.currentTarget.focus();
    }
    
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Icon name="Search" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="pl-8 pr-8 h-8 text-sm"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 hover:bg-transparent"
          onClick={handleClear}
          aria-label={t('aria.clearSearch')}
          type="button"
        >
          <Icon name="X" className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

