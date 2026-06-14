import React from 'react';
import { Document, Organization } from '../../types';
import type { DecisionEntry } from '../../types/decisions';
import { DecisionCard } from './DecisionCard';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { getDecisionSourceGroup } from './decisionSourceGrouping';

interface TimelineHistoryViewProps {
  entries: DecisionEntry[];
  onNavigateToDocument: (documentId: string) => void;
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
  remainingCount?: number;
  documents?: Document[];
  organizations?: Organization[];
}

export function TimelineHistoryView({
  entries,
  onNavigateToDocument,
  onNavigateToOrganization,
  onNavigateToHash,
  hasMore,
  onLoadMore,
  loadingMore = false,
  remainingCount = 0,
  documents = [],
  organizations = [],
}: TimelineHistoryViewProps) {
  if (entries.length === 0) {
    return null;
  }

  const groupedRuns = entries.map((entry, index) => {
    const currentGroup = getDecisionSourceGroup(entry);
    const previousEntry = index > 0 ? entries[index - 1] : undefined;
    const previousGroup = previousEntry ? getDecisionSourceGroup(previousEntry) : undefined;
    const startsNewGroupRun = !previousGroup || currentGroup.key !== previousGroup.key;

    return {
      entry,
      startsNewGroupRun,
    };
  });

  return (
    <div className="space-y-0">
      {groupedRuns.map(({ entry, startsNewGroupRun }, index) => (
        <DecisionCard
          key={entry.id}
          entry={entry}
          onNavigateToDocument={onNavigateToDocument}
          onNavigateToOrganization={onNavigateToOrganization}
          onNavigateToHash={onNavigateToHash}
          isLast={index === entries.length - 1}
          documents={documents}
          organizations={organizations}
          sourceHeaderVariant={startsNewGroupRun ? 'prominent' : 'hidden'}
        />
      ))}
      {hasMore && (
        <div className="pt-4">
          <LoadMoreButton
            remainingCount={remainingCount}
            onLoadMore={onLoadMore}
            disabled={loadingMore}
          />
        </div>
      )}
    </div>
  );
}
