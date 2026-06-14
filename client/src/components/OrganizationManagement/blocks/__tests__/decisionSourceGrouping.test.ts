import { getDecisionSourceGroup } from '../../../ActivityFeed/decisionSourceGrouping';
import type { DecisionEntry } from '../../../../types/decisions';

function makeEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: overrides.id ?? 'entry-1',
    kind: 'document_status',
    outcome: 'accepted',
    timestamp: '2026-01-01T10:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('getDecisionSourceGroup', () => {
  it('groups by document id when no version is provided', () => {
    const group = getDecisionSourceGroup(
      makeEntry({
        documentId: 'doc-1',
        documentTitle: 'Minutes',
        organizationId: 'org-1',
      })
    );

    expect(group).toMatchObject({
      key: 'doc-doc-1',
      label: 'Minutes',
      isDocument: true,
      isOrg: false,
      documentId: 'doc-1',
      organizationId: 'org-1',
    });
  });

  it('groups by document version when version metadata exists', () => {
    const group = getDecisionSourceGroup(
      makeEntry({
        documentId: 'doc-1',
        documentTitle: 'Minutes',
        documentVersionId: '42',
      })
    );

    expect(group).toMatchObject({
      key: 'docv-doc-1-42',
      label: 'Minutes',
      description: 'Version 42',
      isDocument: true,
      isOrg: false,
      documentId: 'doc-1',
      documentVersionId: '42',
    });
  });

  it('reads document version id from payload aliases', () => {
    const group = getDecisionSourceGroup(
      makeEntry({
        documentId: 'doc-1',
        payload: { versionId: '7' },
      })
    );

    expect(group.key).toBe('docv-doc-1-7');
    expect(group.description).toBe('Version 7');
  });

  it('falls back to organization grouping when no document exists', () => {
    const group = getDecisionSourceGroup(
      makeEntry({
        organizationId: 'org-2',
        organizationName: 'Org B',
      })
    );

    expect(group).toMatchObject({
      key: 'org-org-2',
      label: 'Org B',
      isDocument: false,
      isOrg: true,
      organizationId: 'org-2',
    });
  });

  it('falls back to "other" grouping when no source metadata exists', () => {
    const group = getDecisionSourceGroup(makeEntry());

    expect(group).toMatchObject({
      key: 'other',
      label: 'Other',
      isDocument: false,
      isOrg: false,
    });
  });
});
