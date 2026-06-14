import { useEffect, useRef, useCallback } from 'react';
import { DocumentTreeNode } from './types';

export interface UseTreeKeyboardOptions {
  visibleNodes: DocumentTreeNode[];
  expandedNodes: Set<string>;
  onSelect: (node: DocumentTreeNode) => void;
  onToggleExpand: (nodeId: string) => void;
  enabled?: boolean;
}

export function useTreeKeyboard({
  visibleNodes,
  expandedNodes,
  onSelect,
  onToggleExpand,
  enabled = true,
}: UseTreeKeyboardOptions) {
  const focusedIndexRef = useRef<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled || visibleNodes.length === 0) return;

    let newIndex = focusedIndexRef.current;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        newIndex = Math.min(visibleNodes.length - 1, focusedIndexRef.current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        newIndex = Math.max(0, focusedIndexRef.current - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (focusedIndexRef.current >= 0) {
          const node = visibleNodes[focusedIndexRef.current];
          if (node.children.length > 0 && !expandedNodes.has(node.document.id)) {
            onToggleExpand(node.document.id);
          }
        }
        return;
      case 'ArrowLeft':
        e.preventDefault();
        if (focusedIndexRef.current >= 0) {
          const node = visibleNodes[focusedIndexRef.current];
          if (node.children.length > 0 && expandedNodes.has(node.document.id)) {
            onToggleExpand(node.document.id);
          }
        }
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndexRef.current >= 0) {
          onSelect(visibleNodes[focusedIndexRef.current]);
        }
        return;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = visibleNodes.length - 1;
        break;
      default:
        // Type-ahead search
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const searchChar = e.key.toLowerCase();
          const startIndex = (focusedIndexRef.current + 1) % visibleNodes.length;
          
          for (let i = 0; i < visibleNodes.length; i++) {
            const index = (startIndex + i) % visibleNodes.length;
            const node = visibleNodes[index];
            if (node.document.title.toLowerCase().startsWith(searchChar)) {
              newIndex = index;
              break;
            }
          }
        }
        return;
    }

    if (newIndex !== focusedIndexRef.current && newIndex >= 0 && newIndex < visibleNodes.length) {
      focusedIndexRef.current = newIndex;
      // Scroll to focused item
      const element = containerRef.current?.querySelector(
        `[data-tree-index="${newIndex}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (element as HTMLElement).focus();
      }
    }
  }, [visibleNodes, expandedNodes, onSelect, onToggleExpand, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  return {
    containerRef,
    focusedIndex: focusedIndexRef.current,
  };
}

