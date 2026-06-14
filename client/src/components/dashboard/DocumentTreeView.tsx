import React, { useState, useCallback } from 'react';
import { DocumentTree } from '../document-tree/DocumentTree';
import { SPACING, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import type { Document } from '../../types';

export interface DocumentTreeViewProps {
  documents: Document[];
  onSelectDocument: (doc: Document) => void;
  searchQuery: string;
  showStatus?: boolean;
  showMetadata?: boolean;
  compact?: boolean;
}

function DocumentTreeViewComponent({
  documents,
  onSelectDocument,
  searchQuery,
  showStatus = true,
  showMetadata = false,
  compact = false,
}: DocumentTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((documentId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }, []);

  return (
    <div className={cn('bg-card border border-border', RADIUS.panel, SPACING.card.padding)}>
      <DocumentTree
        documents={documents}
        onSelectDocument={onSelectDocument}
        expandedNodes={expandedNodes}
        onToggleExpand={toggleExpand}
        searchQuery={searchQuery}
        showStatus={showStatus}
        showMetadata={showMetadata}
        compact={compact}
      />
    </div>
  );
}

export const DocumentTreeView = React.memo(DocumentTreeViewComponent);
