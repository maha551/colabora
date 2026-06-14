import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

interface RenderResult {
  container: HTMLDivElement;
  rerender: (nextUi: React.ReactElement) => void;
  unmount: () => void;
}

export function renderComponent(ui: React.ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });

  return {
    container,
    rerender: (nextUi: React.ReactElement) => {
      act(() => {
        root.render(nextUi);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export function clickElement(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
