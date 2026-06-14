import { useState, KeyboardEvent } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { RADIUS } from '../../lib/designSystem';

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
}

export function TagInput({
  label,
  tags,
  onChange,
  placeholder,
  disabled = false,
  maxTags = 10,
}: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value || tags.includes(value) || tags.length >= maxTags) return;
    onChange([...tags, value]);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn('inline-flex items-center gap-1 px-2 py-1 text-sm bg-muted border border-border', RADIUS.control)}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              disabled={disabled}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${tag}`}
            >
              <Icon name="X" className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || tags.length >= maxTags}
      />
    </div>
  );
}

interface SuggestedTagsProps {
  suggestions: string[];
  existing: string[];
  onAdd: (tag: string) => void;
  disabled?: boolean;
}

export function SuggestedTags({ suggestions, existing, onAdd, disabled }: SuggestedTagsProps) {
  const available = suggestions.filter((s) => !existing.includes(s));
  if (available.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((tag) => (
        <Button
          key={tag}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onAdd(tag)}
        >
          + {tag}
        </Button>
      ))}
    </div>
  );
}
