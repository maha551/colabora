import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTreeProps } from './types';
import { DocumentTreeNode } from './DocumentTreeNode';
import { useDocumentTree } from './useDocumentTree';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';

export function DocumentTree({
  documents,
  currentDocumentId,
  onSelectDocument,
  expandedNodes: externalExpandedNodes,
  onToggleExpand: externalToggleExpand,
  onEnsureAncestorsExpanded,
  searchQuery = '',
  filters,
  showStatus = true,
  showMetadata = false,
  compact = false,
  className,
}: DocumentTreeProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Use internal or external state management
  const internalTree = useDocumentTree({
    documents,
    searchQuery,
    filters,
    autoExpand: !externalExpandedNodes, // Only auto-expand if not externally controlled
    initialExpanded: externalExpandedNodes,
  });

  const tree = internalTree.tree;
  const expandedNodes = externalExpandedNodes || internalTree.expandedNodes;
  const toggleExpand = externalToggleExpand || internalTree.toggleExpand;

  // Scroll to active document when it changes
  useEffect(() => {
    if (currentDocumentId && activeNodeRef.current) {
      activeNodeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentDocumentId]);

  // Expand ancestors of current document so it's visible. When onEnsureAncestorsExpanded
  // is provided, run only on currentDocumentId/documents change (expand-only), so user
  // collapse is not undone. Otherwise use legacy toggle behavior.
  useEffect(() => {
    if (!currentDocumentId) return;
    if (onEnsureAncestorsExpanded) {
      onEnsureAncestorsExpanded(currentDocumentId);
    }
  }, [currentDocumentId, onEnsureAncestorsExpanded]);

  useEffect(() => {
    if (!currentDocumentId || onEnsureAncestorsExpanded || expandedNodes.has(currentDocumentId)) return;
    const path: string[] = [];
    let currentId: string | undefined = currentDocumentId;
    while (currentId) {
      const doc = documents.find(d => d.id === currentId);
      if (!doc) break;
      path.unshift(doc.id);
      currentId = doc.parentId;
    }
    const ancestorIds = path.slice(0, -1);
    ancestorIds.forEach(id => {
      if (!expandedNodes.has(id)) {
        toggleExpand(id);
      }
    });
  }, [currentDocumentId, documents, expandedNodes, toggleExpand, onEnsureAncestorsExpanded]);

  const renderNode = (node: ReturnType<typeof tree.rootNodes[0]>, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.document.id);
    const isActive = currentDocumentId === node.document.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.document.id} className="w-full" data-document-id={node.document.id}>
        <div
          ref={isActive ? activeNodeRef : undefined}
          className="relative"
        >
          <DocumentTreeNode
            node={node}
            isExpanded={isExpanded}
            isActive={isActive}
            onToggleExpand={() => toggleExpand(node.document.id)}
            onSelect={() => onSelectDocument(node.document)}
            showStatus={showStatus}
            showMetadata={showMetadata}
            compact={compact}
          />
        </div>

        {/* Render children if expanded */}
        {isExpanded && hasChildren && (
          <div className="w-full">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (tree.rootNodes.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <div className="text-muted-foreground mb-2 text-sm">
          {searchQuery || filters ? 'No documents match your search' : 'No documents found'}
        </div>
        {searchQuery && (
          <div className="text-xs text-muted-foreground mt-1">
            Try adjusting your search terms
          </div>
        )}
        {!searchQuery && !filters && (
          <div className="text-xs text-muted-foreground mt-1">
            Get started by creating your first document
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className={cn('w-full', className)}>
      <div
        ref={containerRef}
        role="tree"
        aria-label={t('aria.documentTree')}
        className="w-full"
        tabIndex={0}
      >
        {tree.rootNodes.map((rootNode, index) => (
          <div key={rootNode.document.id} data-tree-index={index}>
            {renderNode(rootNode)}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

