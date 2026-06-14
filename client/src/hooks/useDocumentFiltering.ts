import { useMemo } from 'react';
import type { Document, Organization } from '../types';
import type { DerivedStatusFilter } from '../lib/documentLifecycle';
import { computeDocumentFiltering } from './documentFilteringUtils';

export type DocumentFilterValue = 'all' | 'owned' | 'personal' | 'shared' | 'organizational' | string;

/** Filter dashboard list by regular documents vs meeting minutes (same semantics as DocumentsTab). */
export type ContentTypeFilter = 'all' | 'documents' | 'minutes';

/** Status filter for documents (same as organization DocumentsTab). Meeting minutes are not filtered by status. */
export type StatusFilterValue = 'all' | DerivedStatusFilter;

export interface UseDocumentFilteringParams {
  documents: Document[];
  organizations: Organization[];
  currentUserId: string;
  searchQuery: string;
  documentFilter: DocumentFilterValue;
  /** When 'documents', exclude meeting minutes; when 'minutes', only minutes; 'all' shows both. */
  contentTypeFilter?: ContentTypeFilter;
  /** When set, filter non-minutes documents by status. */
  statusFilter?: StatusFilterValue;
  sortBy: string;
}

export function useDocumentFiltering(params: UseDocumentFilteringParams): {
  filteredDocuments: Document[];
  governanceDocuments: Document[];
  meetingMinutes: Document[];
  hasHierarchy: boolean;
} {
  return useMemo(() => computeDocumentFiltering(params), [
    params.documents,
    params.organizations,
    params.currentUserId,
    params.searchQuery,
    params.documentFilter,
    params.contentTypeFilter,
    params.statusFilter,
    params.sortBy,
  ]);
}
