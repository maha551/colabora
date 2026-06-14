/** @jest-environment jsdom */

import React from 'react';
import { BlockInserter } from '../BlockInserter';
import { clickElement, renderComponent } from './testUtils';

function setupCallbacks() {
  return {
    onAddParagraph: jest.fn(),
    onStartBrainstorm: jest.fn(),
    onStartVote: jest.fn(),
    onRecordDecision: jest.fn(),
    onAddDatePoll: jest.fn(),
    onAddTodo: jest.fn(),
    onAddDocument: jest.fn(),
  };
}

describe('BlockInserter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('expands and collapses actions from the trigger button', () => {
    const callbacks = setupCallbacks();
    const view = renderComponent(<BlockInserter {...callbacks} />);

    const trigger = view.container.querySelector(
      'button[aria-label="Show quick insert actions"]'
    ) as HTMLButtonElement | null;
    const group = view.container.querySelector('[role="group"]') as HTMLDivElement | null;

    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(group?.className).toContain('max-h-0');

    clickElement(trigger as HTMLButtonElement);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(group?.className).toContain('max-h-96');

    const collapseTrigger = view.container.querySelector(
      'button[aria-label="Hide quick insert actions"]'
    ) as HTMLButtonElement | null;
    expect(collapseTrigger).not.toBeNull();

    clickElement(collapseTrigger as HTMLButtonElement);
    expect(collapseTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(group?.className).toContain('max-h-0');

    view.unmount();
  });

  it('invokes the mapped action callbacks when action buttons are clicked', () => {
    const callbacks = setupCallbacks();
    const view = renderComponent(<BlockInserter {...callbacks} defaultExpanded />);

    const actionLabels = [
      'Add paragraph block',
      'Add brainstorm block',
      'Add vote block',
      'Add decision block',
      'Add date block',
      'Add to-do block',
      'Add document block',
    ];

    actionLabels.forEach((label) => {
      const button = view.container.querySelector(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      clickElement(button as HTMLButtonElement);
    });

    expect(callbacks.onAddParagraph).toHaveBeenCalledTimes(1);
    expect(callbacks.onStartBrainstorm).toHaveBeenCalledTimes(1);
    expect(callbacks.onStartVote).toHaveBeenCalledTimes(1);
    expect(callbacks.onRecordDecision).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddDatePoll).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddTodo).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddDocument).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
