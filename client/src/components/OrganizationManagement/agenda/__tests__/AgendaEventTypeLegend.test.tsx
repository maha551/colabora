/** @jest-environment jsdom */

import React from 'react';
import { AgendaEventTypeLegend } from '../AgendaEventTypeLegend';
import { renderComponent } from '../../blocks/__tests__/testUtils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('AgendaEventTypeLegend', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all four event type labels', () => {
    const view = renderComponent(<AgendaEventTypeLegend />);

    const legend = view.container.querySelector('[data-testid="agenda-event-type-legend"]');
    expect(legend).toBeTruthy();
    expect(legend?.getAttribute('aria-label')).toBe('dashboardSheetLegendAria');

    const text = legend?.textContent ?? '';
    expect(text).toContain('dashboardSheetTypeMeeting');
    expect(text).toContain('dashboardSheetTypePoll');
    expect(text).toContain('dashboardSheetTypeDocument');
    expect(text).toContain('dashboardSheetTypeElection');
    view.unmount();
  });
});
