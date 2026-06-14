import React from 'react';
import { useTranslation } from 'react-i18next';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import type { GuestMinutesBlock } from '../lib/api/guestScheduling';

interface GuestMinutesSectionProps {
  blocks: GuestMinutesBlock[];
}

export function GuestMinutesSection({ blocks }: GuestMinutesSectionProps) {
  const { t } = useTranslation('guest');

  const sorted = [...blocks].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return (
    <section className={cn(SPACING.section.margin, SPACING.content.gap, 'flex flex-col')}>
      <h2 className={cn('text-lg font-semibold', COLORS.text.primary)}>
        {t('minutesReadOnly')}
      </h2>
      <div className={cn('border border-border/60 bg-card', RADIUS.panel, SPACING.card.padding, SPACING.content.gap, 'flex flex-col')}>
        {sorted.map((block, index) => (
          <GuestMinutesBlockItem key={`${block.type}-${block.orderIndex ?? index}-${index}`} block={block} />
        ))}
      </div>
    </section>
  );
}

function GuestMinutesBlockItem({ block }: { block: GuestMinutesBlock }) {
  if (block.type === 'paragraph') {
    const isHeading = block.headingLevel != null && block.headingLevel !== '';
    if (isHeading && block.title) {
      return <h3 className={cn('font-semibold', COLORS.text.primary)}>{block.title}</h3>;
    }
    const text = block.text || block.title || '';
    if (!text.trim()) return null;
    return <p className={cn('text-sm whitespace-pre-wrap', COLORS.text.secondary)}>{text}</p>;
  }

  if (block.type === 'topic_heading' && block.title) {
    return <h3 className={cn('font-semibold mt-2', COLORS.text.primary)}>{block.title}</h3>;
  }

  if (block.type === 'vote') {
    return (
      <div className={cn('text-sm', COLORS.text.secondary)}>
        <p className="font-medium text-foreground">{block.title || 'Vote'}</p>
        {block.options?.map((opt) => {
          const count = block.responseCounts?.find((c) => c.optionId === opt.id)?.count ?? 0;
          return (
            <p key={opt.id} className="ml-2">
              {opt.label}: {count}
            </p>
          );
        })}
        {block.totalVotes != null && block.totalVotes > 0 && (
          <p className="text-xs text-muted-foreground mt-1">{block.totalVotes} total</p>
        )}
      </div>
    );
  }

  if (block.type === 'todos_summary' && block.todos?.length) {
    return (
      <ul className={cn('text-sm list-disc pl-5', COLORS.text.secondary)}>
        {block.todos.map((todo, i) => (
          <li key={i}>
            {todo.title}
            {todo.responsibleUserName ? ` (${todo.responsibleUserName})` : ''}
            {todo.dueDate ? ` — ${todo.dueDate}` : ''}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === 'todo' && block.title) {
    return (
      <p className={cn('text-sm', COLORS.text.secondary)}>
        ☐ {block.title}
        {block.responsibleUserName ? ` (${block.responsibleUserName})` : ''}
      </p>
    );
  }

  if (block.type === 'brainstorm' && block.options?.length) {
    return (
      <ul className={cn('text-sm list-disc pl-5', COLORS.text.secondary)}>
        {block.options.map((o) => (
          <li key={o.id}>{o.label}</li>
        ))}
      </ul>
    );
  }

  if (block.eventLine) {
    return <p className={cn('text-sm italic', COLORS.text.muted)}>{block.eventLine}</p>;
  }

  return null;
}
