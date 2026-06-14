import { Document } from '../../types';

export interface DocumentTreeNode {
  document: Document;
  level: number;
  children: DocumentTreeNode[];
  parent?: DocumentTreeNode;
  isExpanded?: boolean;
  isVisible?: boolean;
}

export interface DocumentTreeData {
  rootNodes: DocumentTreeNode[];
  nodeMap: Map<string, DocumentTreeNode>;
  childrenMap: Map<string, Document[]>;
  flatList: DocumentTreeNode[]; // For virtual scrolling
}

export interface DocumentTreeProps {
  documents: Document[];
  currentDocumentId?: string;
  onSelectDocument: (document: Document) => void;
  expandedNodes?: Set<string>;
  onToggleExpand?: (documentId: string) => void;
  /** Called when current document changes so parent can expand-only ancestor nodes (avoids re-expanding after user collapse). */
  onEnsureAncestorsExpanded?: (documentId: string) => void;
  searchQuery?: string;
  filters?: DocumentTreeFilters;
  showStatus?: boolean;
  showMetadata?: boolean;
  compact?: boolean;
  className?: string;
}

export interface DocumentTreeFilters {
  status?: Document['status'][];
  ownershipType?: Document['ownershipType'][];
  hasChildren?: boolean;
  rootDocuments?: boolean;
}

export interface DocumentTreeSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface DocumentTreeFiltersProps {
  filters: DocumentTreeFilters;
  onFiltersChange: (filters: DocumentTreeFilters) => void;
  availableStatuses?: Document['status'][];
  availableOwnershipTypes?: Document['ownershipType'][];
  className?: string;
}

