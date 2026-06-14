/** @jest-environment jsdom */

import React from 'react';
import { AgendaCalendarSheetFront } from '../AgendaCalendarSheetFront';
import { clickElement, renderComponent } from '../../blocks/__tests__/testUtils';
import type { CalendarEvent } from '../../../../lib/api/calendar';

jest.mock('../../../../hooks/useRelativeTimeTick', () => ({
  useRelativeTimeTick: () => Date.parse('2026-06-08T12:00:00.000Z'),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../OverviewPinButton', () => ({
  OverviewPinButton: () => null,
}));

const baseEvent: CalendarEvent = {
  id: 'ev-1',
  type: 'document_voting',
  title: 'Voting deadline: Budget',
  start: '2026-06-11T10:00:00.000Z',
  end: '2026-06-11T11:00:00.000Z',
  organizationId: 'org-1',
  documentId: 'doc-1',
};

const defaultProps = {
  ev: baseEvent,
  variant: 'default' as const,
  timezone: 'UTC',
  locale: 'en',
  formatRelativeTime: () => 'in 3 days',
  formatDateTime: () => 'Wed, Jun 11, 10:00',
  handlers: {
    onNavigateToDocument: jest.fn(),
  },
  canPin: false,
};

describe('AgendaCalendarSheetFront', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders title with data-testid', () => {
    const view = renderComponent(<AgendaCalendarSheetFront {...defaultProps} />);
    const title = view.container.querySelector('[data-testid="agenda-sheet-title"]');
    expect(title?.textContent).toBe('Voting deadline: Budget');
    view.unmount();
  });

  it('toggles flip on body tap when coarsePointer without navigating', () => {
    const onToggleFlip = jest.fn();
    const view = renderComponent(
      <AgendaCalendarSheetFront
        {...defaultProps}
        coarsePointer
        onToggleFlip={onToggleFlip}
        showFlipToggle
      />
    );

    const card = view.container.querySelector('[role="button"]');
    expect(card).toBeTruthy();
    clickElement(card!);

    expect(onToggleFlip).toHaveBeenCalledTimes(1);
    expect(defaultProps.handlers.onNavigateToDocument).not.toHaveBeenCalled();
    view.unmount();
  });

  it('navigates on body tap when not coarsePointer and event is clickable', () => {
    const view = renderComponent(<AgendaCalendarSheetFront {...defaultProps} coarsePointer={false} />);

    const card = view.container.querySelector('[role="button"]');
    expect(card).toBeTruthy();
    clickElement(card!);

    expect(defaultProps.handlers.onNavigateToDocument).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
