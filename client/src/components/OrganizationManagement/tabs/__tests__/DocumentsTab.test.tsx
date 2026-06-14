/** @jest-environment jsdom */

import React from 'react';
import { DocumentsTab } from '../DocumentsTab';
import type { Document, Organization, OrganizationGovernanceRules, User } from '../../../../types';
import type { OrganizationPermissions } from '../../../../hooks/useOrganizationPermissions';
import { renderComponent } from '../../blocks/__tests__/testUtils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('DocumentsTab overview modes', () => {
  const organization = {
    id: 'org-1',
    name: 'Org One',
  } as Organization;

  const currentUser = {
    id: 'user-1',
    name: 'User One',
    email: 'user@example.com',
  } as User;

  const permissions = {
    canCreateDocuments: true,
    canStartDocumentVoting: true,
    isRepresentative: true,
  } as OrganizationPermissions;

  const governanceDoc = {
    id: 'doc-1',
    title: 'Governance Charter',
    ownerId: 'user-1',
    owner: { id: 'org-1', name: 'Org One', type: 'organization' },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    collaborators: [],
    paragraphs: [],
    status: 'proposal',
    ownershipType: 'organizational',
    organizationId: 'org-1',
  } as Document;

  const minutesDoc = {
    id: 'doc-2',
    title: 'Minutes - January',
    ownerId: 'user-1',
    owner: { id: 'org-1', name: 'Org One', type: 'organization' },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-03T10:00:00.000Z',
    meetingScheduledAt: '2026-01-01T10:00:00.000Z',
    minutesFinalizedAt: '2026-01-02T10:00:00.000Z',
    documentKind: 'meeting_minutes',
    collaborators: [],
    paragraphs: [],
    status: 'agreed',
    ownershipType: 'organizational',
    organizationId: 'org-1',
  } as Document;

  const baseProps = {
    organization,
    currentUser,
    permissions,
    governanceRules: null as OrganizationGovernanceRules | null,
    documents: [governanceDoc, minutesDoc],
    isLoading: false,
    error: null,
    onCreateDocument: async () => undefined,
    onSelectDocument: jest.fn(),
    onRefreshDocuments: async () => undefined,
  };

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('shows governance documents when viewMode is governance', () => {
    const view = renderComponent(<DocumentsTab {...baseProps} viewMode="governance" />);

    expect(view.container.textContent).toContain('Governance Charter');
    expect(view.container.textContent).not.toContain('Minutes - January');

    view.unmount();
  });

  it('shows meeting minutes when viewMode is minutes', () => {
    const view = renderComponent(<DocumentsTab {...baseProps} viewMode="minutes" />);

    expect(view.container.textContent).toContain('Minutes - January');
    expect(view.container.textContent).not.toContain('Governance Charter');

    view.unmount();
  });

  it('does not render the in-panel governance/minutes toggle', () => {
    const view = renderComponent(<DocumentsTab {...baseProps} viewMode="governance" />);

    const toggle = Array.from(view.container.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === 'Meeting minutes'
    );
    expect(toggle).toBeUndefined();

    view.unmount();
  });
});
