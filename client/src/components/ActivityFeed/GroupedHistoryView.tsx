import React, { useState, useMemo } from 'react';
import { Document, Organization } from '../../types';
import type { DecisionEntry } from '../../types/decisions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { DocumentAvatar } from '../shared/DocumentAvatar';
import { OrganizationAvatar } from '../shared/OrganizationAvatar';
import { resolveOrganizationAvatarData } from '../../utils/organizationUtils';
import { DecisionCard } from './DecisionCard';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/badge';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { getDecisionSourceGroup } from './decisionSourceGrouping';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface GroupedHistoryViewProps {
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

interface DecisionGroup {
  key: string;
  label: string;
  description?: string;
  isOrg: boolean;
  isMeeting?: boolean;
  organizationId?: string;
  entries: DecisionEntry[];
}

export function GroupedHistoryView({
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
}: GroupedHistoryViewProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, DecisionGroup>();

    entries.forEach((entry) => {
      const sourceGroup = getDecisionSourceGroup(entry);
      const key = sourceGroup.key;
      const label = sourceGroup.label;
      const description = sourceGroup.description;
      const isOrg = sourceGroup.isOrg;
      const isMeeting = sourceGroup.isMeeting;
      const organizationId = sourceGroup.organizationId;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          description,
          isOrg,
          isMeeting,
          organizationId,
          entries: [],
        });
      }
      groups.get(key)!.entries.push(entry);
    });

    return Array.from(groups.values());
  }, [entries]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    new Set(grouped.map((g) => g.key))
  );

  React.useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      grouped.forEach((group) => {
        if (!next.has(group.key)) next.add(group.key);
      });
      return next;
    });
  }, [grouped]);

  if (grouped.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <Collapsible
          key={group.key}
          open={expandedKeys.has(group.key)}
          onOpenChange={(open) => {
            setExpandedKeys((prev) => {
              const next = new Set(prev);
              if (open) next.add(group.key);
              else next.delete(group.key);
              return next;
            });
          }}
        >
          <CollapsibleTrigger className={cn("flex items-center gap-2 w-full p-3 bg-muted/50 hover:bg-muted transition-colors", RADIUS.panel)}>
            {expandedKeys.has(group.key) ? (
              <Icon name="ChevronDown" className="h-4 w-4" />
            ) : (
              <Icon name="ChevronRight" className="h-4 w-4" />
            )}
            {group.isMeeting ? (
              <div className={cn('h-6 w-6 bg-muted flex items-center justify-center border border-border', RADIUS.pill)}>
                <Icon name="Video" className="h-3 w-3 text-muted-foreground" />
              </div>
            ) : group.isOrg ? (
              <OrganizationAvatar
                organization={resolveOrganizationAvatarData(
                  group.organizationId
                    ? organizations.find((org) => org.id === group.organizationId)
                    : null,
                  group.label
                )}
                size="sm"
              />
            ) : (
              <DocumentAvatar
                title={group.label}
                description={group.description}
                size="sm"
              />
            )}
            <span className="text-base font-bold">{group.label}</span>
            {group.description && (
              <span className="text-xs text-muted-foreground">{group.description}</span>
            )}
            <Badge variant="secondary" className="ml-auto">
              {group.entries.length} {group.entries.length === 1 ? 'decision' : 'decisions'}
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 pl-8">
            {group.entries.map((entry, index) => (
              <DecisionCard
                key={entry.id}
                entry={entry}
                onNavigateToDocument={onNavigateToDocument}
                onNavigateToOrganization={onNavigateToOrganization}
                onNavigateToHash={onNavigateToHash}
                isLast={index === group.entries.length - 1}
                documents={documents}
                organizations={organizations}
                sourceHeaderVariant="hidden"
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
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
