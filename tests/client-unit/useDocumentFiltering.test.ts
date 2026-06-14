import type { ContentTypeFilter } from '../../client/src/hooks/useDocumentFiltering';
import { computeDocumentFiltering } from '../../client/src/hooks/documentFilteringUtils';
import { resolveDocumentListLayout } from '../../client/src/components/dashboard/documentListViewUtils';
import type { Document, Organization } from '../../client/src/types';

describe('computeDocumentFiltering', () => {
  const organizations = [{ id: 'org-1', name: 'Org One' }] as Organization[];
  const currentUserId = 'user-1';

  const governanceDoc = {
    id: 'gov-1',
    title: 'Charter',
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'User', type: 'user' },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    collaborators: [],
    paragraphs: [],
    status: 'draft',
    ownershipType: 'personal',
  } as Document;

  const childGovDoc = {
    ...governanceDoc,
    id: 'gov-2',
    title: 'Child',
    parentId: 'gov-1',
    updatedAt: '2026-01-06T10:00:00.000Z',
  } as Document;

  const minutesOlder = {
    id: 'min-1',
    title: 'Minutes Jan',
    ownerId: 'user-1',
    owner: { id: 'org-1', name: 'Org One', type: 'organization' },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    meetingScheduledAt: '2026-01-01T10:00:00.000Z',
    documentKind: 'meeting_minutes',
    collaborators: [],
    paragraphs: [],
    status: 'agreed',
    ownershipType: 'organizational',
    organizationId: 'org-1',
  } as Document;

  const minutesNewer = {
    ...minutesOlder,
    id: 'min-2',
    title: 'Minutes Feb',
    meetingScheduledAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
  } as Document;

  const minutesWithParent = {
    ...minutesOlder,
    id: 'min-3',
    title: 'Minutes with parent',
    parentId: 'gov-1',
  } as Document;

  const baseParams = {
    documents: [governanceDoc, childGovDoc, minutesOlder, minutesNewer, minutesWithParent],
    organizations,
    currentUserId,
    searchQuery: '',
    documentFilter: 'all' as const,
    contentTypeFilter: 'all' as ContentTypeFilter,
    statusFilter: 'all' as const,
    sortBy: 'modified',
  };

  it('excludes meeting minutes when contentTypeFilter is documents', () => {
    const result = computeDocumentFiltering({ ...baseParams, contentTypeFilter: 'documents' });
    expect(result.filteredDocuments.map((d) => d.id)).toEqual(['gov-2', 'gov-1']);
    expect(result.governanceDocuments.map((d) => d.id)).toEqual(['gov-2', 'gov-1']);
    expect(result.meetingMinutes).toEqual([]);
  });

  it('splits governance and minutes for contentTypeFilter all', () => {
    const result = computeDocumentFiltering({ ...baseParams, contentTypeFilter: 'all' });
    expect(result.governanceDocuments.map((d) => d.id)).toEqual(['gov-2', 'gov-1']);
    expect(result.meetingMinutes.map((d) => d.id)).toEqual(['min-2', 'min-1', 'min-3']);
    expect(result.filteredDocuments).toHaveLength(5);
  });

  it('sorts minutes by meeting date descending', () => {
    const result = computeDocumentFiltering({
      ...baseParams,
      contentTypeFilter: 'minutes',
      sortBy: 'modified',
    });
    expect(result.meetingMinutes.map((d) => d.id)).toEqual(['min-2', 'min-1', 'min-3']);
  });

  it('computes hasHierarchy from governance documents only', () => {
    expect(
      computeDocumentFiltering({
        ...baseParams,
        documents: [governanceDoc, childGovDoc, minutesWithParent],
      }).hasHierarchy
    ).toBe(true);

    expect(
      computeDocumentFiltering({
        ...baseParams,
        documents: [governanceDoc, minutesWithParent],
      }).hasHierarchy
    ).toBe(false);
  });

  it('does not duplicate documents across governance and minutes splits', () => {
    const result = computeDocumentFiltering({ ...baseParams, contentTypeFilter: 'all' });
    const combined = [
      ...result.governanceDocuments.map((d) => d.id),
      ...result.meetingMinutes.map((d) => d.id),
    ];
    expect(new Set(combined).size).toBe(combined.length);
    expect(combined).toHaveLength(result.filteredDocuments.length);
  });
});

describe('resolveDocumentListLayout', () => {
  it('uses split sections only for type filter all', () => {
    expect(resolveDocumentListLayout('all')).toBe('split');
    expect(resolveDocumentListLayout('documents')).toBe('flat');
    expect(resolveDocumentListLayout('minutes')).toBe('flat');
  });
});
