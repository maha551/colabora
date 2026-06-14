import { useMemo, useState, useCallback } from 'react';
import { Document } from '../../types';
import { buildDocumentTree, expandAncestors, getVisibleNodes } from './utils';
import { DocumentTreeFilters, DocumentTreeNode } from './types';

export interface UseDocumentTreeOptions {
  documents: Document[];
  searchQuery?: string;
  filters?: DocumentTreeFilters;
  autoExpand?: boolean;
  initialExpanded?: Set<string>;
}

export interface UseDocumentTreeReturn {
  tree: ReturnType<typeof buildDocumentTree>;
  expandedNodes: Set<string>;
  toggleExpand: (documentId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  expandToDocument: (documentId: string) => void;
  visibleNodes: DocumentTreeNode[];
}

export function useDocumentTree({
  documents,
  searchQuery,
  filters,
  autoExpand = true,
  initialExpanded,
}: UseDocumentTreeOptions): UseDocumentTreeReturn {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (initialExpanded) {
      return new Set(initialExpanded);
    }
    if (autoExpand) {
      // Auto-expand all by default
      return new Set(documents.map(d => d.id));
    }
    return new Set();
  });

  // Build tree with memoization
  const tree = useMemo(() => {
    return buildDocumentTree(documents, searchQuery, filters);
  }, [documents, searchQuery, filters]);

  // Update expanded nodes when tree changes (if auto-expand is enabled)
  useMemo(() => {
    if (autoExpand && tree.nodeMap.size > 0) {
      const allIds = new Set(Array.from(tree.nodeMap.keys()));
      setExpandedNodes(prev => {
        // Merge with existing, don't collapse if user manually collapsed
        const merged = new Set(prev);
        allIds.forEach(id => merged.add(id));
        return merged;
      });
    }
  }, [tree.nodeMap, autoExpand]);

  // Toggle expand/collapse
  const toggleExpand = useCallback((documentId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }, []);

  // Expand all
  const expandAll = useCallback(() => {
    setExpandedNodes(new Set(Array.from(tree.nodeMap.keys())));
  }, [tree.nodeMap]);

  // Collapse all
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Expand to show specific document
  const expandToDocument = useCallback((documentId: string) => {
    setExpandedNodes(prev => expandAncestors(tree, documentId, prev));
  }, [tree]);

  // Get visible nodes (for virtual scrolling)
  const visibleNodes = useMemo(() => {
    return getVisibleNodes(tree, expandedNodes);
  }, [tree, expandedNodes]);

  return {
    tree,
    expandedNodes,
    toggleExpand,
    expandAll,
    collapseAll,
    expandToDocument,
    visibleNodes,
  };
}

