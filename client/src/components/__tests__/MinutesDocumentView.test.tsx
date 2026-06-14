/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MinutesDocumentView } from '../MinutesDocumentView';
import type { Document } from '../../types';

const getTimeline = jest.fn();
const listAgenda = jest.fn();
const getMeeting = jest.fn();

jest.mock('../../lib/api', () => ({
  meetingMinutesApi: {
    getTimeline: (...args: unknown[]) => getTimeline(...args),
  },
  meetingAgendaApi: {
    list: (...args: unknown[]) => listAgenda(...args),
  },
  meetingsApi: {
    getMeeting: (...args: unknown[]) => getMeeting(...args),
  },
}));

let docI18n: ReturnType<typeof i18n.createInstance>;

function renderMinutesView(doc: Document): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <I18nextProvider i18n={docI18n}>
        <MinutesDocumentView
          document={doc}
          organizationId="org-1"
          onNavigateToMeeting={jest.fn()}
        />
      </I18nextProvider>,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('MinutesDocumentView', () => {
  beforeAll(async () => {
    docI18n = i18n.createInstance();
    await docI18n.use(initReactI18next as unknown as import('i18next').Module).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['documents', 'organization'],
      defaultNS: 'documents',
      interpolation: { escapeValue: false },
      resources: {
        en: {
          documents: {
            minutesDocument: {
              readOnlyHint: 'Read-only protocol view.',
              openInMeeting: 'Open in meeting',
              protocolLabel: 'Meeting protocol',
              draft: 'Draft minutes',
            },
          },
          organization: {
            minutes: 'Minutes',
            agenda: 'Agenda',
            timelineEmptyDescription: 'No entries yet.',
            protocolCanvas: {
              blockType: { vote: 'Vote', todo: 'To-do', paragraph: 'Paragraph' },
              status: { closed: 'Closed', open: 'Open', recorded: 'Recorded' },
              voteOptionsList: 'Vote options',
              voteOptionPercent: '{{percent}}',
              voteOptionRowAria: '{{label}}, {{count}} votes, {{percent}}',
              todoNoDueDate: 'No due date',
            },
          },
        },
      },
    });
  });

  beforeEach(() => {
    getTimeline.mockReset();
    listAgenda.mockReset();
    getMeeting.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads timeline and renders vote and todo blocks', async () => {
    getTimeline.mockResolvedValue({
      items: [
        {
          type: 'event',
          id: 'evt-vote',
          occurredAt: '2026-06-05T12:00:00.000Z',
          orderIndex: 1,
          eventType: 'vote_ended',
          payload: { meetingVoteId: 'v1', title: 'Was???' },
          vote: {
            id: 'v1',
            meetingId: 'meet-1',
            title: 'Was???',
            status: 'closed',
            anonymous: false,
            options: [
              { id: 'o1', label: 'A', sortOrder: 0 },
              { id: 'o2', label: 'B', sortOrder: 1 },
            ],
            responseCounts: [{ optionId: 'o2', count: 1 }],
            createdAt: '2026-06-05T12:00:00.000Z',
            closedAt: '2026-06-05T12:01:00.000Z',
          },
        },
        {
          type: 'todo',
          id: 'todo-1',
          occurredAt: '2026-06-05T12:02:00.000Z',
          orderIndex: 2,
          title: 'Follow up',
          status: 'pending',
          responsibleUserId: null,
          responsibleUserName: null,
          agendaItemId: null,
        },
      ],
    });
    listAgenda.mockResolvedValue({ items: [] });
    getMeeting.mockResolvedValue({
      id: 'meet-1',
      currentAgendaItemId: null,
      minutesFinalizedAt: null,
    });

    const doc: Document = {
      id: 'doc-1',
      title: 'Weekly sync minutes',
      documentKind: 'meeting_minutes',
      meetingId: 'meet-1',
      organizationId: 'org-1',
      status: 'draft',
      ownerId: 'org-1',
      owner: { id: 'org-1', name: 'Org', type: 'organization' },
      ownershipType: 'organizational',
      collaborators: [],
      paragraphs: [],
      createdAt: '2026-06-05T10:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    };

    const { container, unmount } = renderMinutesView(doc);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getTimeline).toHaveBeenCalledWith('org-1', 'meet-1');
    expect(container.textContent).toContain('Was???');
    expect(container.textContent).toContain('Follow up');
    expect(container.textContent).toContain('Open in meeting');
    unmount();
  });
});
