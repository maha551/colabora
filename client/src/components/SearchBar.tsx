import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Icon } from './ui/Icon';
import { searchApi } from '../lib/api';
import type { SearchSuggestion } from '../types';
import { cn } from './ui/utils';
import { logger } from '../lib/logger';
import { SPACING, COLORS } from '../lib/designSystem';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

function suggestionIcon(entityType: SearchSuggestion['entityType']) {
  if (entityType === 'meeting') return 'Calendar';
  if (entityType === 'paragraph') return 'FileText';
  return 'FolderOpen';
}

export function SearchBar({ onSearch, placeholder, className }: SearchBarProps) {
  const { t } = useTranslation('documents');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedPlaceholder = placeholder ?? t('search.placeholder');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length >= 2) {
      setIsLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await searchApi.getSuggestions(query);
          setSuggestions(response.suggestions);
          setShowSuggestions(true);
        } catch (error) {
          logger.error('Failed to get suggestions', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    onSearch(suggestion.text);
    setShowSuggestions(false);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Icon name="Search" className={cn('absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4', COLORS.text.secondary)} />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder={resolvedPlaceholder}
            className="w-full pl-10 pr-10"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
              onClick={handleClear}
            >
              <Icon name="X" className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div className={cn('absolute z-50 w-full mt-1 shadow-lg max-h-60 overflow-auto rounded-md border', COLORS.bg.surface, COLORS.border.standard)}>
          {isLoading ? (
            <div className={cn('p-3 text-sm', COLORS.text.secondary)}>{t('search.loadingSuggestions')}</div>
          ) : (
            suggestions.map((suggestion, i) => (
              <button
                key={`${suggestion.entityType}-${suggestion.entityId}-${i}`}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className={cn('w-full text-left p-3 transition-colors cursor-pointer', 'hover:bg-muted')}
              >
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <Icon name={suggestionIcon(suggestion.entityType)} className={cn('h-4 w-4', COLORS.text.secondary)} />
                  <span className="text-sm">{suggestion.text}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
