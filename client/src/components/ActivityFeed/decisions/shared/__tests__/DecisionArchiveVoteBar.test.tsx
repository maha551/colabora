/** @jest-environment jsdom */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DecisionArchiveVoteBar } from '../DecisionArchiveVoteBar';

jest.mock('../../../../ui/VoteProgressBar', () => ({
  VoteProgressBar: ({
    variant,
    aggregatedCounts,
    totalEligibleVoters,
    votesCast,
    totalVoters,
    interactive,
    showCountsBelow,
  }: {
    variant?: string;
    aggregatedCounts?: { pro?: number; neutral?: number; contra?: number };
    totalEligibleVoters?: number;
    votesCast?: number;
    totalVoters?: number;
    interactive?: boolean;
    showCountsBelow?: boolean;
  }) => (
    <div
      data-testid="vote-progress-bar"
      data-variant={variant}
      data-interactive={String(interactive)}
      data-show-counts={String(showCountsBelow)}
      data-eligible={totalEligibleVoters}
      data-cast={votesCast}
      data-total={totalVoters}
    >
      {aggregatedCounts
        ? `${aggregatedCounts.pro}-${aggregatedCounts.neutral}-${aggregatedCounts.contra}`
        : null}
    </div>
  ),
}));

function render(ui: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return container;
}

describe('DecisionArchiveVoteBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders null when proposal has no votes and no eligible voters', () => {
    const container = render(<DecisionArchiveVoteBar pro={0} contra={0} neutral={0} totalEligibleVoters={0} />);
    expect(container.querySelector('[data-testid="vote-progress-bar"]')).toBeNull();
  });

  it('renders proposal bar read-only without duplicate count row', () => {
    const container = render(
      <DecisionArchiveVoteBar pro={5} contra={2} neutral={1} totalEligibleVoters={10} />
    );
    const bar = container.querySelector('[data-testid="vote-progress-bar"]');
    expect(bar?.getAttribute('data-variant')).toBe('proposal');
    expect(bar?.getAttribute('data-interactive')).toBe('false');
    expect(bar?.getAttribute('data-show-counts')).toBe('undefined');
    expect(bar?.textContent).toBe('5-1-2');
  });

  it('falls back to total votes when eligible count is zero', () => {
    const container = render(
      <DecisionArchiveVoteBar pro={3} contra={1} neutral={0} totalEligibleVoters={0} />
    );
    const bar = container.querySelector('[data-testid="vote-progress-bar"]');
    expect(bar?.getAttribute('data-eligible')).toBe('4');
  });

  it('renders election variant bar', () => {
    const container = render(
      <DecisionArchiveVoteBar variant="election" votesCast={12} totalVoters={20} />
    );
    const bar = container.querySelector('[data-testid="vote-progress-bar"]');
    expect(bar?.getAttribute('data-variant')).toBe('election');
    expect(bar?.getAttribute('data-cast')).toBe('12');
    expect(bar?.getAttribute('data-total')).toBe('20');
  });

  it('renders null for election with no data', () => {
    const container = render(
      <DecisionArchiveVoteBar variant="election" votesCast={0} totalVoters={0} />
    );
    expect(container.querySelector('[data-testid="vote-progress-bar"]')).toBeNull();
  });
});
