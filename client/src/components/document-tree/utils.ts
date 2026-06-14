import { Document } from '../../types';
import { DocumentTreeNode, DocumentTreeData, DocumentTreeFilters } from './types';

/**
 * Builds a tree structure from flat document list
 */
export function buildDocumentTree(
  documents: Document[],
  searchQuery?: string,
  filters?: DocumentTreeFilters
): DocumentTreeData {
  // Meeting minutes are not part of the governance document tree
  let filteredDocs = documents.filter((doc) => doc.documentKind !== 'meeting_minutes');
  
  if (searchQuery?.trim()) {
    const query = searchQuery.toLowerCase();
    filteredDocs = filteredDocs.filter(doc =>
      doc.title.toLowerCase().includes(query) ||
      doc.description?.toLowerCase().includes(query) ||
      doc.owner.name.toLowerCase().includes(query)
    );
  }

  // Apply filters
  if (filters) {
    filteredDocs = applyFilters(filteredDocs, filters);
  }

  // Create maps
  const docMap = new Map<string, Document>();
  const childrenMap = new Map<string, Document[]>();
  const nodeMap = new Map<string, DocumentTreeNode>();

  // Initialize maps
  filteredDocs.forEach(doc => {
    docMap.set(doc.id, doc);
    childrenMap.set(doc.id, []);
  });

  // Build children map
  filteredDocs.forEach(doc => {
    if (doc.parentId && docMap.has(doc.parentId)) {
      const parentChildren = childrenMap.get(doc.parentId);
      if (parentChildren) {
        parentChildren.push(doc);
      }
    }
  });

  // Sort function - use sortOrder as primary sort, then by title
  const sortDocuments = (docs: Document[]): Document[] => {
    return [...docs].sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        const sortOrderDiff = a.sortOrder - b.sortOrder;
        if (sortOrderDiff !== 0) {
          return sortOrderDiff;
        }
      } else if (a.sortOrder !== undefined) {
        return -1;
      } else if (b.sortOrder !== undefined) {
        return 1;
      }
      return a.title.localeCompare(b.title);
    });
  };

  // Build tree nodes recursively
  const buildNode = (doc: Document, level: number, parent?: DocumentTreeNode): DocumentTreeNode => {
    const children = sortDocuments(childrenMap.get(doc.id) || []);
    const node: DocumentTreeNode = {
      document: doc,
      level,
      children: [],
      parent,
      isExpanded: true, // Default to expanded
      isVisible: true,
    };

    nodeMap.set(doc.id, node);

    // Recursively build children
    node.children = children.map(child => buildNode(child, level + 1, node));

    return node;
  };

  // Find root documents (no parentId or parent not in filtered set)
  const rootDocuments = filteredDocs.filter(doc => 
    !doc.parentId || !docMap.has(doc.parentId)
  );

  // Build tree from roots
  const rootNodes = sortDocuments(rootDocuments).map(doc => buildNode(doc, 0));

  // Create flat list for virtual scrolling
  const flatList: DocumentTreeNode[] = [];
  const flatten = (nodes: DocumentTreeNode[]) => {
    nodes.forEach(node => {
      flatList.push(node);
      if (node.isExpanded && node.children.length > 0) {
        flatten(node.children);
      }
    });
  };
  flatten(rootNodes);

  return {
    rootNodes,
    nodeMap,
    childrenMap,
    flatList,
  };
}

/**
 * Apply filters to document list
 */
function applyFilters(documents: Document[], filters: DocumentTreeFilters): Document[] {
  let filtered = documents;

  // Status filter
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(doc => 
      doc.status && filters.status!.includes(doc.status)
    );
  }

  // Ownership type filter
  if (filters.ownershipType && filters.ownershipType.length > 0) {
    filtered = filtered.filter(doc => 
      doc.ownershipType && filters.ownershipType!.includes(doc.ownershipType)
    );
  }

  // Has children filter
  if (filters.hasChildren !== undefined) {
    const docMap = new Map(documents.map(d => [d.id, d]));
    filtered = filtered.filter(doc => {
      const hasChildren = documents.some(d => d.parentId === doc.id);
      return filters.hasChildren ? hasChildren : !hasChildren;
    });
  }

  // Root documents filter
  if (filters.rootDocuments) {
    const docMap = new Map(documents.map(d => [d.id, d]));
    filtered = filtered.filter(doc => !doc.parentId || !docMap.has(doc.parentId));
  }

  return filtered;
}

/**
 * Find document in tree by ID
 */
export function findNodeInTree(
  tree: DocumentTreeData,
  documentId: string
): DocumentTreeNode | undefined {
  return tree.nodeMap.get(documentId);
}

/**
 * Get path to document (breadcrumb)
 */
export function getDocumentPath(
  tree: DocumentTreeData,
  documentId: string
): Document[] {
  const node = tree.nodeMap.get(documentId);
  if (!node) return [];

  const path: Document[] = [];
  let current: DocumentTreeNode | undefined = node;
  
  while (current) {
    path.unshift(current.document);
    current = current.parent;
  }

  return path;
}

/**
 * Expand all ancestors of a document
 */
export function expandAncestors(
  tree: DocumentTreeData,
  documentId: string,
  expandedNodes: Set<string>
): Set<string> {
  const path = getDocumentPath(tree, documentId);
  const newExpanded = new Set(expandedNodes);
  
  // Expand all ancestors
  path.forEach(doc => {
    newExpanded.add(doc.id);
  });

  return newExpanded;
}

/**
 * Get all visible nodes (expanded tree)
 */
export function getVisibleNodes(
  tree: DocumentTreeData,
  expandedNodes: Set<string>
): DocumentTreeNode[] {
  const visible: DocumentTreeNode[] = [];

  const traverse = (nodes: DocumentTreeNode[]) => {
    nodes.forEach(node => {
      visible.push(node);
      if (expandedNodes.has(node.document.id) && node.children.length > 0) {
        traverse(node.children);
      }
    });
  };

  traverse(tree.rootNodes);
  return visible;
}

