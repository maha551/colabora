/** @jest-environment jsdom */

import React from 'react';
import { GroupedHistoryView } from '../../../ActivityFeed/GroupedHistoryView';
import { TimelineHistoryView } from '../../../ActivityFeed/TimelineHistoryView';
import { renderComponent } from './testUtils';
import type { DecisionEntry } from '../../../../types/decisions';

const decisionCardMock = jest.fn();

jest.mock('../../../ActivityFeed/DecisionCard', () => ({
  DecisionCard: (props: Record<string, unknown>) => {
    decisionCardMock(props);
    return <div data-testid="decision-card">{String((props.entry as DecisionEntry).id)}</div>;
  },
}));

jest.mock('../../../ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button className={className} type="button">
      {children}
    </button>
  ),
  CollapsibleContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock('../../../shared/LoadMoreButton', () => ({
  LoadMoreButton: () => <div data-testid="load-more-button" />,
}));

jest.mock('../../../shared/DocumentAvatar', () => ({
  DocumentAvatar: ({ title }: { title: string }) => <div data-testid="document-avatar">{title}</div>,
}));

jest.mock('../../../ActivityFeed/decisions', () => ({
  ParagraphChangeDecisionCard: () => <div data-testid="paragraph-change-card" />,
  RuleProposalDecisionCard: () => <div data-testid="rule-proposal-card" />,
  ElectionDecisionCard: () => <div data-testid="election-card" />,
  OrganizationVoteDecisionCard: () => <div data-testid="organization-vote-card" />,
  StructureProposalDecisionCard: () => <div data-testid="structure-proposal-card" />,
  TreeProposalDecisionCard: () => <div data-testid="tree-proposal-card" />,
  DocumentStatusDecisionCard: () => <div data-testid="document-status-card" />,
  MeetingDecisionDecisionCard: () => <div data-testid="meeting-decision-card" />,
  DocumentDeletionDecisionCard: () => <div data-testid="document-deletion-card" />,
}));

function makeEntry(
  id: string,
  documentId: string,
  documentTitle: string,
  overrides: Partial<DecisionEntry> = {}
): DecisionEntry {
  return {
    id,
    kind: 'document_status',
    outcome: 'accepted',
    timestamp: '2026-01-01T10:00:00.000Z',
    documentId,
    documentTitle,
    payload: {},
    ...overrides,
  };
}

describe('Decisions header dedup', () => {
  beforeEach(() => {
    decisionCardMock.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses prominent header only for first card in a timeline run', () => {
    const entries = [
      makeEntry('d1', 'doc-a', 'Document A'),
      makeEntry('d2', 'doc-a', 'Document A'),
      makeEntry('d3', 'doc-b', 'Document B'),
    ];

    const view = renderComponent(
      <TimelineHistoryView
        entries={entries}
        onNavigateToDocument={() => undefined}
        hasMore={false}
        onLoadMore={() => undefined}
      />
    );

    const variants = decisionCardMock.mock.calls.map((call) => call[0].sourceHeaderVariant);
    expect(variants).toEqual(['prominent', 'hidden', 'prominent']);

    view.unmount();
  });

  it('hides per-card source header in grouped view', () => {
    const entries = [
      makeEntry('g1', 'doc-a', 'Document A'),
      makeEntry('g2', 'doc-a', 'Document A'),
    ];

    const view = renderComponent(
      <GroupedHistoryView
        entries={entries}
        onNavigateToDocument={() => undefined}
        hasMore={false}
        onLoadMore={() => undefined}
      />
    );

    const variants = decisionCardMock.mock.calls.map((call) => call[0].sourceHeaderVariant);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.every((variant) => variant === 'hidden')).toBe(true);
    expect(view.container.textContent).toContain('Document A');

    view.unmount();
  });

  it('keeps connector line visible when source header is hidden or prominent', () => {
    const { DecisionCard: RealDecisionCard } = jest.requireActual('../../../ActivityFeed/DecisionCard') as {
      DecisionCard: React.ComponentType<Record<string, unknown>>;
    };
    const sharedProps = {
      entry: makeEntry('c1', 'doc-a', 'Document A'),
      onNavigateToDocument: () => undefined,
      documents: [],
      organizations: [],
      isLast: false,
    };

    const hiddenView = renderComponent(
      <RealDecisionCard
        {...sharedProps}
        sourceHeaderVariant="hidden"
      />
    );

    expect(hiddenView.container.querySelector('.w-0\\.5')).not.toBeNull();
    hiddenView.unmount();

    const prominentView = renderComponent(
      <RealDecisionCard
        {...sharedProps}
        sourceHeaderVariant="prominent"
      />
    );

    expect(prominentView.container.querySelector('.w-0\\.5')).not.toBeNull();
    prominentView.unmount();
  });

  it('starts a new prominent header when document version changes in timeline view', () => {
    const entries = [
      makeEntry('v1-a', 'doc-a', 'Document A', { documentVersionId: '1' }),
      makeEntry('v1-b', 'doc-a', 'Document A', { documentVersionId: '1' }),
      makeEntry('v2-a', 'doc-a', 'Document A', { documentVersionId: '2' }),
    ];

    const view = renderComponent(
      <TimelineHistoryView
        entries={entries}
        onNavigateToDocument={() => undefined}
        hasMore={false}
        onLoadMore={() => undefined}
      />
    );

    const variants = decisionCardMock.mock.calls.map((call) => call[0].sourceHeaderVariant);
    expect(variants).toEqual(['prominent', 'hidden', 'prominent']);

    view.unmount();
  });
});
