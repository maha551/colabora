import type { Document, Organization } from '../types';
import { matchesStatusFilter } from '../lib/documentLifecycle';
import type { ContentTypeFilter, DocumentFilterValue, StatusFilterValue } from './useDocumentFiltering';

export interface ComputeDocumentFilteringParams {
  documents: Document[];
  organizations: Organization[];
  currentUserId: string;
  searchQuery: string;
  documentFilter: DocumentFilterValue;
  contentTypeFilter?: ContentTypeFilter;
  statusFilter?: StatusFilterValue;
  sortBy: string;
}

export interface ComputeDocumentFilteringResult {
  filteredDocuments: Document[];
  governanceDocuments: Document[];
  meetingMinutes: Document[];
  hasHierarchy: boolean;
}

function isMeetingMinutes(doc: Document): boolean {
  return doc.documentKind === 'meeting_minutes';
}

function dateForMinutes(doc: Document): string {
  return doc.meetingScheduledAt || doc.minutesFinalizedAt || doc.updatedAt;
}

function sortDocuments(docs: Document[], sortBy: string, minutesOnly: boolean): Document[] {
  const sorted = [...docs];
  sorted.sort((a, b) => {
    if (minutesOnly) {
      return new Date(dateForMinutes(b)).getTime() - new Date(dateForMinutes(a)).getTime();
    }
    switch (sortBy) {
      case 'modified':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      case 'suggestions': {
        const aSuggestions = a.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);
        const bSuggestions = b.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);
        return bSuggestions - aSuggestions;
      }
      default:
        return 0;
    }
  });
  return sorted;
}

export function computeDocumentFiltering({
  documents,
  organizations,
  currentUserId,
  searchQuery,
  documentFilter,
  contentTypeFilter = 'all',
  statusFilter = 'all',
  sortBy,
}: ComputeDocumentFilteringParams): ComputeDocumentFilteringResult {
  let filtered = documents.filter((doc) => {
    if (contentTypeFilter === 'all') return true;
    const isMinutes = isMeetingMinutes(doc);
    if (contentTypeFilter === 'documents') return !isMinutes;
    return isMinutes;
  });

  filtered = filtered.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (statusFilter !== 'all') {
    filtered = filtered.filter((doc) => matchesStatusFilter(doc, statusFilter));
  }

  if (documentFilter !== 'all') {
    filtered = filtered.filter((doc) => {
      const isOwner =
        doc.ownershipType === 'organizational'
          ? doc.organizationId && organizations.some((org) => org.id === doc.organizationId)
          : doc.ownerId === currentUserId;
      const isCollaborator = (doc.collaborators || []).some(
        (collab) =>
          collab.user?.id === currentUserId || collab.userId === currentUserId
      );
      const ownershipType = doc.ownershipType || 'personal';

      if (documentFilter === 'owned') return isOwner;
      if (documentFilter === 'personal') return ownershipType === 'personal' && isOwner;
      if (documentFilter === 'shared')
        return ownershipType === 'shared' || (isCollaborator && !isOwner);
      if (documentFilter === 'organizational') return ownershipType === 'organizational';
      if (organizations.some((org) => org.id === documentFilter)) {
        return doc.organizationId === documentFilter;
      }
      return true;
    });
  }

  let filteredDocuments: Document[];
  if (contentTypeFilter === 'minutes') {
    filteredDocuments = sortDocuments(filtered, sortBy, true);
  } else if (contentTypeFilter === 'documents') {
    filteredDocuments = sortDocuments(filtered, sortBy, false);
  } else {
    const governance = filtered.filter((doc) => !isMeetingMinutes(doc));
    const minutes = filtered.filter((doc) => isMeetingMinutes(doc));
    filteredDocuments = [
      ...sortDocuments(governance, sortBy, false),
      ...sortDocuments(minutes, sortBy, true),
    ];
  }

  const governanceDocuments = filteredDocuments.filter((doc) => !isMeetingMinutes(doc));
  const meetingMinutes = filteredDocuments.filter((doc) => isMeetingMinutes(doc));
  const hasHierarchy = governanceDocuments.some((doc) => doc.parentId);

  return { filteredDocuments, governanceDocuments, meetingMinutes, hasHierarchy };
}
