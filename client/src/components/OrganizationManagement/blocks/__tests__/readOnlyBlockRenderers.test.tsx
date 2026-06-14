/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createReadOnlyBlockRenderers } from '../readOnlyBlockRenderers';
import { BlockRenderer } from '../BlockRenderer';
import type { ProtocolBlock } from '../protocolBlocks.types';

let orgI18n: ReturnType<typeof i18n.createInstance>;

function renderWithOrgI18n(ui: React.ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<I18nextProvider i18n={orgI18n}>{ui}</I18nextProvider>);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('createReadOnlyBlockRenderers', () => {
  beforeAll(async () => {
    orgI18n = i18n.createInstance();
    await orgI18n.use(initReactI18next as unknown as import('i18next').Module).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['organization'],
      defaultNS: 'organization',
      interpolation: { escapeValue: false },
      resources: {
        en: {
          organization: {
            protocolCanvas: {
              blockType: { vote: 'Vote', todo: 'To-do' },
              status: { closed: 'Closed', open: 'Open' },
              voteOptionsList: 'Vote options',
              voteOptionPercent: '{{percent}}',
              voteOptionRowAria: '{{label}}, {{count}} votes, {{percent}}',
              todoNoDueDate: 'No due date',
            },
            voteClosed: 'Closed',
          },
        },
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders vote block without cast or close action buttons', () => {
    const renderers = createReadOnlyBlockRenderers();
    const block: ProtocolBlock = {
      id: 'vote:evt-1',
      type: 'vote',
      status: 'closed',
      occurredAt: '2026-06-05T12:00:00.000Z',
      orderIndex: 1,
      event: {
        type: 'event',
        id: 'evt-1',
        occurredAt: '2026-06-05T12:00:00.000Z',
        orderIndex: 1,
        eventType: 'vote_ended',
        payload: { meetingVoteId: 'v1', title: 'Budget vote' },
      },
      vote: {
        id: 'v1',
        meetingId: 'm1',
        title: 'Budget vote',
        status: 'closed',
        anonymous: false,
        options: [
          { id: 'o1', label: 'Yes', sortOrder: 0 },
          { id: 'o2', label: 'No', sortOrder: 1 },
        ],
        responseCounts: [{ optionId: 'o1', count: 2 }],
        createdAt: '2026-06-05T12:00:00.000Z',
        closedAt: '2026-06-05T12:05:00.000Z',
      },
    };

    const { container, unmount } = renderWithOrgI18n(
      <BlockRenderer block={block} renderers={renderers} readOnly />,
    );

    expect(container.textContent).toContain('Budget vote');
    expect(container.querySelector('button')).toBeNull();
    unmount();
  });

  it('renders todo block without edit or status buttons', () => {
    const renderers = createReadOnlyBlockRenderers();
    const block: ProtocolBlock = {
      id: 'todo:t1',
      type: 'todo',
      status: 'open',
      occurredAt: '2026-06-05T12:00:00.000Z',
      orderIndex: 2,
      todo: {
        type: 'todo',
        id: 't1',
        occurredAt: '2026-06-05T12:00:00.000Z',
        orderIndex: 2,
        title: 'Send notes',
        status: 'pending',
        responsibleUserId: null,
        responsibleUserName: null,
        agendaItemId: null,
      },
    };

    const { container, unmount } = renderWithOrgI18n(
      <BlockRenderer block={block} renderers={renderers} readOnly />,
    );

    expect(container.textContent).toContain('Send notes');
    expect(container.textContent).not.toContain('Mark complete');
    expect(container.textContent).not.toContain('Bearbeiten');
    unmount();
  });
});
