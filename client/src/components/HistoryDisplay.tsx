import React from 'react';
import { VersionHistory } from '../types';
import { Avatar, AvatarFallback } from './ui/avatar';

interface HistoryDisplayProps {
  history: VersionHistory[];
  isDocumentTitle?: boolean;
  className?: string;
}

export function HistoryDisplay({ history, isDocumentTitle = false, className = '' }: HistoryDisplayProps) {
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
            : `${acceptedAt.toLocaleDateString()} ${acceptedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          const isTitleChange = (entry.type || '').toUpperCase() === 'TITLE';
          const headingLevelLabel = entry.headingLevel ? entry.headingLevel.toUpperCase() : undefined;

          return (
            <div key={entry.id} className="p-4 bg-muted/40 rounded-md space-y-2">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-xs">
                    {entry.user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center justify-between flex-1">
                  <span className="font-medium text-foreground text-sm">
                    {entry.user?.name || 'Unknown collaborator'}
                  </span>
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                </div>
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
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

