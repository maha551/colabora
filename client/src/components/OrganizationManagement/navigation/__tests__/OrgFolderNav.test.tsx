/** @jest-environment jsdom */

import React from 'react';
import { Tabs } from '../../../ui/tabs';
import { OrgFolderPrimaryNav } from '../OrgFolderPrimaryNav';
import { OrgFolderSecondaryNav } from '../OrgFolderSecondaryNav';
import {
  clickElement,
  renderComponent,
} from '../../blocks/__tests__/testUtils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        overview: 'Overview',
        documents: 'Documents',
        community: 'Community',
        governance: 'Governance',
        members: 'Members',
        schedule: 'Schedule',
        transparency: 'Transparency',
        representatives: 'Representatives',
        'folderNav.primary': 'Organization sections',
        'folderNav.secondary': 'Section pages',
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('OrgFolderPrimaryNav', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders four primary section buttons', () => {
    const { container, unmount } = renderComponent(
      <OrgFolderPrimaryNav
        activeGroup="overview"
        isRepresentative={false}
        onNavigate={jest.fn()}
      />
    );

    const nav = container.querySelector('nav[aria-label="Organization sections"]');
    expect(nav).not.toBeNull();
    expect(nav?.querySelectorAll('button')).toHaveLength(4);
    unmount();
  });

  it('marks the active group with aria-current="page"', () => {
    const { container, unmount } = renderComponent(
      <OrgFolderPrimaryNav
        activeGroup="community"
        isRepresentative={false}
        onNavigate={jest.fn()}
      />
    );

    const active = container.querySelector('button[aria-current="page"]');
    expect(active?.textContent).toContain('Community');
    unmount();
  });

  it('navigates to the first child tab when a primary section is clicked', () => {
    const onNavigate = jest.fn();
    const { container, unmount } = renderComponent(
      <OrgFolderPrimaryNav
        activeGroup="overview"
        isRepresentative={false}
        onNavigate={onNavigate}
      />
    );

    const governanceButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Governance')
    );
    expect(governanceButton).toBeDefined();
    clickElement(governanceButton!);
    expect(onNavigate).toHaveBeenCalledWith('governance');
    unmount();
  });
});

describe('OrgFolderSecondaryNav', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('omits representatives for non-representatives', () => {
    const { container, unmount } = renderComponent(
      <Tabs value="governance">
        <OrgFolderSecondaryNav tabs={['governance', 'transparency']} />
      </Tabs>
    );

    expect(container.textContent).not.toContain('Representatives');
    unmount();
  });

  it('renders representatives for representatives in governance group', () => {
    const { container, unmount } = renderComponent(
      <Tabs value="governance">
        <OrgFolderSecondaryNav
          tabs={['governance', 'transparency', 'representatives']}
        />
      </Tabs>
    );

    expect(container.textContent).toContain('Representatives');
    unmount();
  });

  it('returns null when only one tab is in the section', () => {
    const { container, unmount } = renderComponent(
      <Tabs value="dashboard">
        <OrgFolderSecondaryNav tabs={['dashboard']} />
      </Tabs>
    );

    expect(container.querySelector('[aria-label="Section pages"]')).toBeNull();
    unmount();
  });
});
