/** @jest-environment jsdom */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DecisionCardShell } from '../DecisionCardShell';
import { DECISION_CARD } from '../../../../../lib/designSystem';

jest.mock('../../../../ui/Icon', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid="icon" data-name={name} className={className} />
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

describe('DecisionCardShell', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies DECISION_CARD root and elevated classes', () => {
    const container = render(
      <DecisionCardShell icon="Vote" title="Test vote" meta={<span>meta</span>} />
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('gap-3');
    expect(card?.className).toContain(DECISION_CARD.elevated);
  });

  it('applies organization border style when color provided', () => {
    const container = render(
      <DecisionCardShell
        icon="Vote"
        title="Org vote"
        organizationBorderColor="#ff0000"
      />
    );
    const card = container.querySelector('[data-slot="card"]') as HTMLElement;
    expect(card.style.borderColor).toBe('rgb(255, 0, 0)');
    expect(card.style.borderWidth).toBe('2px');
    expect(card?.className).not.toContain(DECISION_CARD.elevated);
  });

  it('renders voteBar before header, then body and footer', () => {
    const container = render(
      <DecisionCardShell
        icon="FileText"
        title="Document"
        voteBar={<div data-testid="vote-bar">Bar</div>}
        footer={<button type="button">View</button>}
      >
        <p>Body content</p>
      </DecisionCardShell>
    );
    const card = container.querySelector('[data-slot="card"]');
    const voteBar = container.querySelector('[data-testid="vote-bar"]');
    expect(card?.className).toContain('overflow-hidden');
    expect(voteBar).not.toBeNull();
    expect(card?.firstElementChild?.contains(voteBar!)).toBe(true);
    expect(container.textContent).toContain('Body content');
    expect(container.textContent).toContain('View');
  });
});
