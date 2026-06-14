/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { BlockRenderer } from '../BlockRenderer';
import type { ParagraphProtocolBlock, ProtocolBlock } from '../protocolBlocks.types';
import { renderComponent } from './testUtils';

let orgI18n: ReturnType<typeof i18n.createInstance>;

function renderBlockWithI18n(ui: React.ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<I18nextProvider i18n={orgI18n}>{ui}</I18nextProvider>);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function baseBlock(): Pick<ProtocolBlock, 'id' | 'status' | 'occurredAt' | 'orderIndex'> {
  return {
    id: 'block-1',
    status: 'open',
    occurredAt: '2026-01-01T10:00:00.000Z',
    orderIndex: 1,
  };
}

describe('BlockRenderer', () => {
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
              recordedAt: 'Recorded at {{time}}',
              recordedBy: 'Recorded by {{name}}',
            },
            voteStartedAt: 'Started {{time}}',
            voteClosedAt: 'Closed {{time}}',
          },
        },
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows heading for paragraph block without shell status badge (recorded is implicit)', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'paragraph',
      paragraph: {
        type: 'paragraph',
        id: 'p1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        title: 'Introductions',
        text: '',
        orderIndex: 1,
      },
      sectionPreset: 'freeform',
    };

    const view = renderComponent(<BlockRenderer block={block} />);
    const article = view.container.querySelector('article[aria-label="Paragraph block"]');
    const statusBadges = view.container.querySelectorAll('[aria-label^="Status:"]');

    expect(article).not.toBeNull();
    expect(statusBadges.length).toBe(0);
    expect(view.container.textContent).toContain('Introductions');

    view.unmount();
  });

  it('renders fallback summaries for key block types', () => {
    const voteBlock: ProtocolBlock = {
      ...baseBlock(),
      type: 'vote',
      status: 'closed',
      event: {
        type: 'event',
        id: 'e1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { title: 'Budget approval' },
        orderIndex: 1,
      },
      vote: null,
    };

    const documentBlock: ProtocolBlock = {
      ...baseBlock(),
      type: 'document_link',
      status: 'recorded',
      event: {
        type: 'event',
        id: 'e2',
        occurredAt: '2026-01-01T10:01:00.000Z',
        eventType: 'document_created',
        payload: {},
        orderIndex: 2,
      },
      documentId: '42',
      title: '',
    };

    const todoBlock: ProtocolBlock = {
      ...baseBlock(),
      type: 'todo',
      status: 'partial',
      todo: {
        type: 'todo',
        id: 't1',
        occurredAt: '2026-01-01T10:02:00.000Z',
        title: '',
        dueDate: '2026-01-15T00:00:00.000Z',
        status: 'open',
        responsibleUserId: '',
      },
    };

    const datePollBlock: ProtocolBlock = {
      ...baseBlock(),
      type: 'date_poll',
      status: 'completed',
      event: {
        type: 'event',
        id: 'e3',
        occurredAt: '2026-01-01T10:03:00.000Z',
        eventType: 'date_decided',
        payload: {},
        orderIndex: 3,
      },
      chosenSlot: null,
    };

    const view = renderComponent(
      <div>
        <BlockRenderer block={voteBlock} />
        <BlockRenderer block={documentBlock} />
        <BlockRenderer block={todoBlock} />
        <BlockRenderer block={datePollBlock} />
      </div>
    );

    expect(view.container.textContent).toContain('Budget approval');
    expect(view.container.textContent).toContain('Document #42');
    expect(view.container.textContent).toContain('Untitled to-do');
    expect(view.container.textContent).toContain('Pending final slot');
    expect(view.container.querySelector('[aria-label="Status: Closed"]')).not.toBeNull();
    expect(view.container.querySelector('[aria-label="Status: Recorded"]')).not.toBeNull();

    view.unmount();
  });

  it('footer shows recorded time and optional author for paragraph blocks', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'paragraph',
      paragraph: {
        type: 'paragraph',
        id: 'p1',
        occurredAt: '2026-06-15T14:30:00.000Z',
        title: 'Quarterly review',
        text: '',
        orderIndex: 1,
        createdByUserName: 'Alex Moderator',
      } as ParagraphProtocolBlock['paragraph'] & { createdByUserName?: string },
      sectionPreset: 'discussion',
    };

    const view = renderBlockWithI18n(<BlockRenderer block={block} />);
    const footer = view.container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toMatch(/Recorded at/);
    expect(footer?.textContent).toContain('Alex Moderator');

    view.unmount();
  });

  it('footer shows vote opened/closed times when vote record has timestamps', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'vote',
      status: 'closed',
      event: {
        type: 'event',
        id: 'e-vote',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { title: 'Budget' },
        orderIndex: 1,
      },
      vote: {
        id: 'vote-1',
        meetingId: 'm1',
        title: 'Budget',
        status: 'closed',
        anonymous: false,
        createdByUserId: 'u1',
        createdAt: '2026-01-01T10:05:00.000Z',
        closedAt: '2026-01-01T10:45:00.000Z',
        sourceEventId: 'e-vote',
        options: [],
      },
    };

    const view = renderBlockWithI18n(<BlockRenderer block={block} />);
    const footer = view.container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toMatch(/Started/);
    expect(footer?.textContent).toMatch(/Closed/);

    view.unmount();
  });

  it('renders brainstorm content without duplicate nested headers', () => {
    const brainstormBlock: ProtocolBlock = {
      ...baseBlock(),
      type: 'brainstorm',
      status: 'open',
      sourceTimelineItemId: 'e-brainstorm',
      event: {
        type: 'event',
        id: 'e-brainstorm',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'brainstorm_started',
        payload: {},
        orderIndex: 1,
      },
      options: [{ id: 'o1', label: 'Option A' }],
    };

    const view = renderComponent(<BlockRenderer block={brainstormBlock} />);
    const brainstormHeadings = Array.from(view.container.querySelectorAll('h3')).filter(
      (heading) => heading.textContent?.trim() === 'Brainstorm'
    );

    expect(brainstormHeadings).toHaveLength(1);
    expect(view.container.textContent).toContain('Option A');

    view.unmount();
  });

  it('renders a block type icon in the header', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'vote',
      status: 'open',
      event: {
        type: 'event',
        id: 'e1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { title: 'Budget' },
        orderIndex: 1,
      },
      vote: null,
    };

    const view = renderComponent(<BlockRenderer block={block} />);
    const header = view.container.querySelector('header');
    const icon = header?.querySelector('svg');
    expect(icon).not.toBeNull();
    view.unmount();
  });

  it('uses semantic status chip classes with CSS variable colors', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'vote',
      status: 'open',
      event: {
        type: 'event',
        id: 'e1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        eventType: 'vote_started',
        payload: { title: 'Test' },
        orderIndex: 1,
      },
      vote: null,
    };

    const view = renderComponent(<BlockRenderer block={block} />);
    const chip = view.container.querySelector('[aria-label="Status: Open"]');
    expect(chip).not.toBeNull();
    expect(chip?.className).toMatch(/var\(--status-/);
    view.unmount();
  });

  it('uses text-xs for eyebrow and status chip typography', () => {
    const block: ProtocolBlock = {
      ...baseBlock(),
      type: 'todo',
      status: 'partial',
      todo: {
        type: 'todo',
        id: 't1',
        occurredAt: '2026-01-01T10:00:00.000Z',
        title: 'Follow up',
        dueDate: null,
        status: 'open',
        responsibleUserId: '',
      },
    };

    const view = renderComponent(<BlockRenderer block={block} />);
    const eyebrow = view.container.querySelector('h3');
    const chip = view.container.querySelector('[aria-label^="Status:"]');
    expect(eyebrow?.className).toContain('text-xs');
    expect(chip?.className).toContain('text-xs');
    expect(eyebrow?.className).not.toContain('text-[11px]');
    expect(chip?.className).not.toContain('text-[10px]');
    view.unmount();
  });
});
