/** @jest-environment jsdom */

import React from 'react';
import { OrganizationWhatsHappeningCard } from '../../OrganizationWhatsHappeningCard';
import type { Organization } from '../../../../types';
import type { OrganizationPermissions } from '../../../../hooks/useOrganizationPermissions';
import type { CalendarEvent } from '../../../../lib/api/calendar';
import { renderComponent } from '../../blocks/__tests__/testUtils';

const mockUseOrganizationAgenda = jest.fn();

jest.mock('../../../../hooks/useOrganizationAgenda', () => ({
  useOrganizationAgenda: (...args: unknown[]) => mockUseOrganizationAgenda(...args),
  AGENDA_UPCOMING_LIMIT_MOBILE: 3,
}));

jest.mock('../../../../hooks/useTimezone', () => ({
  useTimezone: () => ({
    timezone: 'UTC',
    formatDateTime: (d: string) => d,
    formatRelativeTime: () => 'in 2 days',
  }),
}));

jest.mock('../../../../hooks/useRelativeTimeTick', () => ({
  useRelativeTimeTick: () => Date.parse('2026-06-08T12:00:00.000Z'),
}));

jest.mock('../../../../contexts/ScreenSizeContext', () => ({
  useIsMobile: () => false,
}));

jest.mock('../../../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === 'dashboardOpenPolls' && options?.count != null) {
        return `${options.count} open polls`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../OverviewPinButton', () => ({
  OverviewPinButton: () => <button type="button">pin</button>,
}));

describe('OrganizationWhatsHappeningCard', () => {
  const organization = {
    id: 'org-1',
    name: 'Test Org',
  } as Organization;

  const permissions = {
    isRepresentative: true,
  } as OrganizationPermissions;

  const liveEvent: CalendarEvent = {
    id: 'live-1',
    type: 'meeting',
    title: 'Live Meeting',
    start: '2026-06-08T11:00:00.000Z',
    end: '2026-06-08T13:00:00.000Z',
    organizationId: 'org-1',
    meetingId: 'm-1',
    meetingLink: 'https://meet.example.com',
  };

  const pinnedEvent: CalendarEvent = {
    id: 'pin-1',
    type: 'meeting',
    title: 'Pinned Meeting',
    start: '2026-06-10T10:00:00.000Z',
    end: '2026-06-10T11:00:00.000Z',
    organizationId: 'org-1',
  };

  const upcomingEvent: CalendarEvent = {
    id: 'up-1',
    type: 'document_voting',
    title: 'Doc Vote',
    start: '2026-06-11T10:00:00.000Z',
    end: '2026-06-11T11:00:00.000Z',
    organizationId: 'org-1',
    documentId: 'doc-1',
  };

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders empty state when no content', () => {
    mockUseOrganizationAgenda.mockReturnValue({
      live: [],
      pinned: null,
      upcoming: [],
      openPollCount: 0,
      isLoading: false,
      error: null,
      hasContent: false,
      refresh: jest.fn(),
    });

    const view = renderComponent(
      <OrganizationWhatsHappeningCard
        organization={organization}
        permissions={permissions}
        enabled
        onNavigateToSchedule={jest.fn()}
      />
    );

    expect(view.container.querySelector('#dashboard-whats-happening')).toBeTruthy();
    expect(view.container.textContent).toContain('dashboardNoUpcomingEvents');
    view.unmount();
  });

  it('shows Join on live event without interaction', () => {
    mockUseOrganizationAgenda.mockReturnValue({
      live: [liveEvent],
      pinned: null,
      upcoming: [],
      openPollCount: 0,
      isLoading: false,
      error: null,
      hasContent: true,
      refresh: jest.fn(),
    });

    const view = renderComponent(
      <OrganizationWhatsHappeningCard
        organization={organization}
        permissions={permissions}
        enabled
        onNavigateToSchedule={jest.fn()}
        onNavigateToMeeting={jest.fn()}
      />
    );

    expect(view.container.textContent).toContain('joinMeeting');
    expect(view.container.textContent).toContain('Live Meeting');
    view.unmount();
  });

  it('orders live before pinned before upcoming in strip', () => {
    mockUseOrganizationAgenda.mockReturnValue({
      live: [liveEvent],
      pinned: pinnedEvent,
      upcoming: [upcomingEvent],
      openPollCount: 0,
      isLoading: false,
      error: null,
      hasContent: true,
      refresh: jest.fn(),
    });

    const view = renderComponent(
      <OrganizationWhatsHappeningCard
        organization={organization}
        permissions={permissions}
        enabled
        onNavigateToSchedule={jest.fn()}
      />
    );

    const strip = view.container.querySelector('[data-testid="agenda-calendar-strip"]');
    expect(strip).toBeTruthy();
    const titles = Array.from(strip!.querySelectorAll('[data-testid="agenda-sheet-title"]')).map(
      (el) => el.textContent
    );
    expect(titles.indexOf('Live Meeting')).toBeLessThan(titles.indexOf('Pinned Meeting'));
    expect(titles.indexOf('Pinned Meeting')).toBeLessThan(titles.indexOf('Doc Vote'));
    view.unmount();
  });

  it('renders event type legend when content is shown', () => {
    mockUseOrganizationAgenda.mockReturnValue({
      live: [liveEvent],
      pinned: null,
      upcoming: [],
      openPollCount: 0,
      isLoading: false,
      error: null,
      hasContent: true,
      refresh: jest.fn(),
    });

    const view = renderComponent(
      <OrganizationWhatsHappeningCard
        organization={organization}
        permissions={permissions}
        enabled
        onNavigateToSchedule={jest.fn()}
      />
    );

    expect(view.container.querySelector('[data-testid="agenda-event-type-legend"]')).toBeTruthy();
    view.unmount();
  });

  it('shows skeleton while loading', () => {
    mockUseOrganizationAgenda.mockReturnValue({
      live: [],
      pinned: null,
      upcoming: [],
      openPollCount: 0,
      isLoading: true,
      error: null,
      hasContent: false,
      refresh: jest.fn(),
    });

    const view = renderComponent(
      <OrganizationWhatsHappeningCard
        organization={organization}
        permissions={permissions}
        enabled
        onNavigateToSchedule={jest.fn()}
      />
    );

    expect(view.container.querySelector('[data-testid="agenda-sheet-skeleton"]')).toBeTruthy();
    view.unmount();
  });
});
