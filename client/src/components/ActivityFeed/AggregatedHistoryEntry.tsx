import React from 'react';
import { VersionHistory, Document, Organization } from '../../types';
import { DocumentAvatar } from '../shared/DocumentAvatar';
import { ParagraphChangeCard } from '../shared/ParagraphChangeCard';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';

export type AgreedHistoryEntry = VersionHistory & {
  documentId: string;
  documentTitle: string;
  documentDescription?: string;
  paragraphTitle?: string;
};

interface AggregatedHistoryEntryProps {
  entry: AgreedHistoryEntry;
  onNavigateToDocument: (documentId: string) => void;
  isLast?: boolean;
  documents?: Document[];
  organizations?: Organization[];
}

export function AggregatedHistoryEntry({ 
  entry, 
  onNavigateToDocument,
  isLast = false,
  documents = [],
  organizations = [],
}: AggregatedHistoryEntryProps) {
  const doc = documents.find(d => d.id === entry.documentId);
  const org = doc?.organizationId ? organizations.find(o => o.id === doc.organizationId) : null;
  const organizationBorderColor = org?.brandingColor ?? null;
  return (
    <div className="relative flex gap-4">
      {/* Document Avatar on the left with timeline line */}
      <div className="flex flex-col items-center self-stretch">
        <DocumentAvatar
          title={entry.documentTitle}
          description={entry.documentDescription}
          size="md"
        />
        {/* Subtle vertical line connecting to next entry */}
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border/60 mt-2 min-h-[3rem]" />
        )}
      </div>

      {/* History entry content */}
      <div className="flex-1 pb-8">
        {/* Document context header */}
        <div className="mb-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToDocument(entry.documentId)}
            className="h-auto p-0 text-sm font-semibold text-foreground hover:text-primary"
          >
            <Icon name="FileText" className="h-3 w-3 mr-1" />
            {entry.documentTitle}
          </Button>
        </div>
        
        {/* Reuse ParagraphChangeCard */}
        <ParagraphChangeCard
          history={entry}
          organizationBorderColor={organizationBorderColor}
          paragraphTitle={entry.paragraphTitle}
          documentTitle={entry.documentTitle}
          suppressContextDup
        />
      </div>
    </div>
  );
}
