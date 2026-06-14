import React from 'react';
import { VersionHistory } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useTimezone } from '../hooks/useTimezone';
import { getUserColor } from '../lib/userColors';
import { RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface HistoryDisplayProps {
  history: VersionHistory[];
  isDocumentTitle?: boolean;
  className?: string;
  organizationBorderColor?: string | null;
}

export function HistoryDisplay({ history, isDocumentTitle = false, className = '', organizationBorderColor }: HistoryDisplayProps) {
  const { formatDate, formatTime } = useTimezone();
  const historyCount = history.length;

  if (historyCount === 0) {
    return (
      <div className={`space-y-3 pl-6 border-l-2 border-primary/20 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Accepted Changes</h3>
          <span className="text-xs text-muted-foreground">0 entries</span>
        </div>
        <p className="text-sm text-muted-foreground italic">
          No accepted changes yet.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 pl-6 border-l-2 border-primary/20 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Accepted Changes</h3>
        <span className="text-xs text-muted-foreground">
          {historyCount} {historyCount === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="space-y-3">
        {history.map((entry) => {
          const acceptedAt = entry.acceptedAt instanceof Date 
            ? entry.acceptedAt 
            : new Date(entry.acceptedAt);
          const formattedDate = isNaN(acceptedAt.getTime())
            ? 'Unknown date'
            : `${formatDate(acceptedAt)} ${formatTime(acceptedAt, { hour: '2-digit', minute: '2-digit' })}`;
          const isTitleChange = (entry.type || '').toUpperCase() === 'TITLE';
          const headingLevelLabel = entry.headingLevel ? entry.headingLevel.toUpperCase() : undefined;

          return (
            <div
              key={entry.id}
              className={cn(RADIUS.control, "p-4 bg-muted/40 space-y-2 min-w-0", !organizationBorderColor ? 'ring-1 ring-primary/10' : '')}
              style={organizationBorderColor ? { borderColor: organizationBorderColor, borderWidth: '2px', borderStyle: 'solid' } : undefined}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6 flex-shrink-0 border" style={{ borderColor: entry.user?.id ? getUserColor(entry.user.id) : undefined }}>
                  <AvatarImage src={entry.user?.avatar} />
                  <AvatarFallback className="bg-primary/10 text-xs">
                    {entry.user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="font-medium text-foreground text-sm">
                    {entry.user?.name || 'Unknown collaborator'}
                  </span>
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                </div>
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground whitespace-normal min-w-0 max-w-full">
                {isTitleChange
                  ? (isDocumentTitle 
                      ? 'Title change' 
                      : `Heading change${headingLevelLabel ? ` (${headingLevelLabel})` : ''}`)
                  : 'Body change'}
              </div>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{entry.text}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {entry.approvalPercentage ? (
                  <span>
                    Approved with {Math.round(entry.approvalPercentage)}% support
                  </span>
                ) : (
                  <span>Approved</span>
                )}
                {entry.oldText && entry.oldText.trim() !== entry.text.trim() && (
                  <span className="italic">Previous: &quot;{entry.oldText}&quot;</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

