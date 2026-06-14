/** @jest-environment jsdom */

import React from 'react';
import { AgendaSheetFlip } from '../AgendaSheetFlip';
import { renderComponent } from '../../blocks/__tests__/testUtils';

const mockUsePrefersReducedMotion = jest.fn(() => false);

jest.mock('../../../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => mockUsePrefersReducedMotion(),
}));

describe('AgendaSheetFlip', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    mockUsePrefersReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = originalMatchMedia;
  });

  it('applies is-flipped class when toggled on coarse pointer', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: none)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const view = renderComponent(
      <AgendaSheetFlip
        ariaLabel="Test event"
        front={<div>front</div>}
        back={<div>back</div>}
        flipped
        showTouchToggle
      />
    );

    expect(view.container.querySelector('.is-flipped')).toBeTruthy();
    view.unmount();
  });

  it('exposes group role with aria-label', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const view = renderComponent(
      <AgendaSheetFlip
        ariaLabel="Board meeting"
        front={<div>front</div>}
        back={<div>back</div>}
      />
    );

    const group = view.container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Board meeting');
    view.unmount();
  });

  it('applies agenda-sheet--today when isToday', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const view = renderComponent(
      <AgendaSheetFlip
        ariaLabel="Today event"
        front={<div>front</div>}
        back={<div>back</div>}
        isToday
      />
    );

    expect(view.container.querySelector('.agenda-sheet--today')).toBeTruthy();
    view.unmount();
  });

  it('uses reduced motion class when preferred', () => {
    mockUsePrefersReducedMotion.mockReturnValue(true);

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const view = renderComponent(
      <AgendaSheetFlip
        ariaLabel="Event"
        front={<div>front</div>}
        back={<div data-testid="back-face"><button type="button">Open</button></div>}
        flipped
        showTouchToggle
      />
    );

    expect(view.container.querySelector('.agenda-sheet-flip--reduced')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="back-face"] button')).toBeTruthy();
    view.unmount();
  });
});
