/** @jest-environment jsdom */

import React from 'react';
import { BlockCanvas } from '../BlockCanvas';
import type { ProtocolBlock } from '../protocolBlocks.types';
import { renderComponent } from './testUtils';

jest.mock('../BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: ProtocolBlock }) => (
    <div data-testid="mock-block-renderer">{block.id}</div>
  ),
}));

function makeParagraphBlock(id: string): ProtocolBlock {
  return {
    id,
    type: 'paragraph',
    status: 'open',
    occurredAt: '2026-01-01T10:00:00.000Z',
    orderIndex: 1,
    paragraph: {
      type: 'paragraph',
      id: `${id}-item`,
      occurredAt: '2026-01-01T10:00:00.000Z',
      title: `Title ${id}`,
      text: '',
      orderIndex: 1,
    },
    sectionPreset: 'freeform',
  };
}

describe('BlockCanvas', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders default empty state with icon when no blocks exist', () => {
    const view = renderComponent(<BlockCanvas blocks={[]} />);

    const section = view.container.querySelector('section[aria-label="Protocol blocks"]');
    const status = view.container.querySelector('[role="status"]');
    const icon = status?.querySelector('svg');

    expect(section).not.toBeNull();
    expect(status?.textContent).toContain('No protocol blocks available.');
    expect(icon).not.toBeNull();

    view.unmount();
  });

  it('renders blocks as list items and forwards each block to renderer', () => {
    const blocks: ProtocolBlock[] = [makeParagraphBlock('b1'), makeParagraphBlock('b2')];
    const view = renderComponent(<BlockCanvas blocks={blocks} />);

    const list = view.container.querySelector('ul[role="list"]');
    const items = view.container.querySelectorAll('li');
    const renderedBlocks = view.container.querySelectorAll('[data-testid="mock-block-renderer"]');

    expect(list).not.toBeNull();
    expect(items).toHaveLength(2);
    expect(renderedBlocks).toHaveLength(2);
    expect(renderedBlocks[0]?.textContent).toBe('b1');
    expect(renderedBlocks[1]?.textContent).toBe('b2');

    view.unmount();
  });

  it('renders block list without timeline rail (rail is applied at parent level)', () => {
    const blocks: ProtocolBlock[] = [makeParagraphBlock('b1')];
    const view = renderComponent(<BlockCanvas blocks={blocks} />);

    const list = view.container.querySelector('ul[role="list"]');
    expect(list).not.toBeNull();
    expect(list?.className).not.toContain('pl-10');

    view.unmount();
  });

  it('uses compact spacing when compact prop is true', () => {
    const blocks: ProtocolBlock[] = [makeParagraphBlock('b1'), makeParagraphBlock('b2')];
    const view = renderComponent(<BlockCanvas blocks={blocks} compact />);

    const list = view.container.querySelector('ul[role="list"]');
    expect(list?.className).toContain('space-y-2');
    expect(list?.className).not.toContain('space-y-2.5');

    view.unmount();
  });
});
