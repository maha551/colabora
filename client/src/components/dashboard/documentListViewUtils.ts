import type { ContentTypeFilter } from '../../hooks/useDocumentFiltering';

/** Determines whether the personal dashboard list uses governance/minutes section headers. */
export function resolveDocumentListLayout(contentTypeFilter: ContentTypeFilter): 'flat' | 'split' {
  return contentTypeFilter === 'all' ? 'split' : 'flat';
}
