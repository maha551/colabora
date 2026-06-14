/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { BrainstormBlock, BRAINSTORM_IDEA_MAX_LENGTH } from '../renderers/BrainstormBlock';
import { renderComponent } from './testUtils';

let orgI18n;

function renderWithOrgI18n(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
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

function baseBrainstormBlock(overrides = {}) {
  return {
    id: 'brainstorm:block-1',
    type: 'brainstorm',
    status: 'open',
    occurredAt: '2026-01-01T10:00:00.000Z',
    orderIndex: 1,
    sourceTimelineItemId: 'e-brainstorm',
    event: {
      type: 'event',
      id: 'e-brainstorm',
      occurredAt: '2026-01-01T10:00:00.000Z',
      orderIndex: 1,
      eventType: 'brainstorm_started',
      payload: null,
    },
    options: [],
    ...overrides,
  };
}

describe('BrainstormBlock', () => {
  beforeAll(async () => {
    orgI18n = i18n.createInstance();
    await orgI18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['organization'],
      defaultNS: 'organization',
      interpolation: { escapeValue: false },
      resources: {
        en: {
          organization: {},
        },
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows inline composer when brainstorm is open and onSubmitBrainstormIdea is set', () => {
    const block = baseBrainstormBlock();
    const { container, unmount } = renderWithOrgI18n(
      <BrainstormBlock block={block} onSubmitBrainstormIdea={async () => {}} />
    );
    expect(container.querySelector('textarea')).not.toBeNull();
    unmount();
  });

  it('hides inline composer when brainstorm is closed', () => {
    const block = baseBrainstormBlock({ status: 'closed' });
    const { container, unmount } = renderWithOrgI18n(
      <BrainstormBlock block={block} onSubmitBrainstormIdea={async () => {}} />
    );
    expect(container.querySelector('textarea')).toBeNull();
    unmount();
  });

  it('hides inline composer when onSubmitBrainstormIdea is omitted', () => {
    const block = baseBrainstormBlock();
    const { container, unmount } = renderWithOrgI18n(<BrainstormBlock block={block} />);
    expect(container.querySelector('textarea')).toBeNull();
    unmount();
  });

  it('hides moderator actions when callbacks are omitted', () => {
    const block = baseBrainstormBlock({ options: [{ id: 'o1', label: 'Idea A' }] });
    const { container, unmount } = renderWithOrgI18n(<BrainstormBlock block={block} />);
    expect(Array.from(container.querySelectorAll('button')).some((b) => /close and vote/i.test(b.textContent ?? ''))).toBe(false);
    expect(Array.from(container.querySelectorAll('button')).some((b) => /end brainstorm/i.test(b.textContent ?? ''))).toBe(false);
    unmount();
  });

  it('shows moderator actions when callbacks are provided', () => {
    const block = baseBrainstormBlock({ options: [{ id: 'o1', label: 'Idea A' }] });
    const { container, unmount } = renderWithOrgI18n(
      <BrainstormBlock block={block} onEndBrainstorm={() => {}} onCloseBrainstormAndVote={() => {}} />
    );
    expect(Array.from(container.querySelectorAll('button')).some((b) => /close and vote/i.test(b.textContent ?? ''))).toBe(true);
    expect(Array.from(container.querySelectorAll('button')).some((b) => /end brainstorm/i.test(b.textContent ?? ''))).toBe(true);
    unmount();
  });

  it('clears draft after successful submit', async () => {
    const block = baseBrainstormBlock();
    const view = renderComponent(
      <I18nextProvider i18n={orgI18n}>
        <BrainstormBlock block={block} onSubmitBrainstormIdea={async () => {}} />
      </I18nextProvider>
    );
    const textarea = view.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(textarea, 'New idea');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea).toHaveValue('New idea');

    const addBtn = Array.from(view.container.querySelectorAll('button')).find((b) => /add idea/i.test(b.textContent ?? ''));
    expect(addBtn).toBeDefined();
    await act(async () => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(textarea).toHaveValue('');
    view.unmount();
  });

  it('enforces max length constant matching server', () => {
    expect(BRAINSTORM_IDEA_MAX_LENGTH).toBe(280);
  });
});
