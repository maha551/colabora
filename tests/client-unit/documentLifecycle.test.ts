import {
  getAdoptionPhase,
  getAmendmentSubState,
  isDocumentReadOnly,
  isAmendmentEditingAllowed,
  matchesStatusFilter,
  getLifecycleSteps,
  getPrimaryLifecycleStep,
} from '../../client/src/lib/documentLifecycle';
import type { Document } from '../../client/src/types';

const t = (key: string, opts?: Record<string, unknown>) => {
  if (opts?.date) return `${key}:${opts.date}`;
  if (opts?.count !== undefined) return `${key}:${opts.count}`;
  return key;
};

const formatDate = (d: string) => d;

function baseDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    title: 'Test',
    ownershipType: 'organizational',
    status: 'agreed',
    paragraphs: [],
    collaborators: [],
    owner: { id: 'org-1', name: 'Org', type: 'organization' },
    ownerId: 'org-1',
    organizationId: 'org-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    ...overrides,
  } as Document;
}

describe('documentLifecycle', () => {
  it('maps agreed status to adopted phase', () => {
    expect(getAdoptionPhase(baseDoc())).toBe('adopted');
    expect(getAdoptionPhase(baseDoc({ status: 'voting' }))).toBe('voting');
  });

  it('derives amendment sub-states', () => {
    expect(getAmendmentSubState(baseDoc({ amendmentsOpen: true }))).toBe('open');
    expect(getAmendmentSubState(baseDoc({ amendmentsOpen: true }), 2)).toBe('open_with_candidates');
    expect(getAmendmentSubState(baseDoc({ amendmentAdoptionVoteId: 'vote-1' }))).toBe('adoption_vote_pending');
    expect(getAmendmentSubState(baseDoc())).toBe('closed');
  });

  it('read-only when agreed and amendments closed', () => {
    expect(isDocumentReadOnly(baseDoc())).toBe(true);
    expect(isDocumentReadOnly(baseDoc({ amendmentsOpen: true }))).toBe(false);
    expect(isDocumentReadOnly(baseDoc({ amendmentAdoptionVoteId: 'vote-1' }))).toBe(true);
    expect(isDocumentReadOnly(baseDoc({ status: 'rejected' }))).toBe(true);
  });

  it('allows amendment editing only when window is open', () => {
    expect(isAmendmentEditingAllowed(baseDoc({ amendmentsOpen: true }))).toBe(true);
    expect(isAmendmentEditingAllowed(baseDoc())).toBe(false);
    expect(isAmendmentEditingAllowed(baseDoc({ amendmentsOpen: true, amendmentAdoptionVoteId: 'v' }))).toBe(false);
  });

  it('matches derived status filters', () => {
    expect(matchesStatusFilter(baseDoc({ amendmentsOpen: true }), 'amendments_open')).toBe(true);
    expect(matchesStatusFilter(baseDoc(), 'amendments_closed')).toBe(true);
    expect(matchesStatusFilter(baseDoc({ amendmentAdoptionVoteId: 'v' }), 'amendment_adoption_pending')).toBe(true);
    expect(matchesStatusFilter(baseDoc({ status: 'voting' }), 'voting')).toBe(true);
  });

  it('keeps step 3 current and step 4 info when adopted', () => {
    const steps = getLifecycleSteps(baseDoc({ amendmentsOpen: true }), t, formatDate, 1);
    const outcome = steps.find((s) => s.id === 'outcome');
    const amendments = steps.find((s) => s.id === 'amendments');
    expect(outcome?.state).toBe('current');
    expect(amendments?.state).toBe('info');
    expect(amendments?.label).toBe('lifecycleStepper.amendmentsOpenWithCount:1');
  });

  it('primary lifecycle step excludes info amendments step', () => {
    const primary = getPrimaryLifecycleStep(baseDoc({ amendmentsOpen: true }), t, formatDate);
    expect(primary?.id).toBe('outcome');
  });
});
