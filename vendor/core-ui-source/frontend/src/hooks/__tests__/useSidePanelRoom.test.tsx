/**
 * The companion column is only offered when the dialog can afford it.
 *
 * Measured on the live app at 1083px with the assistant dock open: the
 * overlay is inset by `--assistant-dock-w` (420px), leaving 663px. The panel
 * is a fixed 380 and does not shrink, so the record body took the whole
 * shortfall and rendered at 249px — narrow enough that "RAW-STEEL-48"
 * wrapped across three lines. A media query cannot see this, because the
 * squeeze comes from the dock rather than the window.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import { useSidePanelRoom } from '../useSidePanelRoom';

function Probe() {
  const room = useSidePanelRoom();
  return <span data-testid="room">{room ? 'column' : 'stacked'}</span>;
}

const setViewport = (w: number) => {
  (window as unknown as { innerWidth: number }).innerWidth = w;
};
const setDock = (px: number) =>
  document.documentElement.style.setProperty('--assistant-dock-w', `${px}px`);

beforeEach(() => {
  setViewport(1440);
  document.documentElement.style.removeProperty('--assistant-dock-w');
  document.documentElement.style.setProperty('--dialog-side-panel-w', '380px');
});

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--assistant-dock-w');
  document.documentElement.style.removeProperty('--dialog-side-panel-w');
});

const room = () => screen.getByTestId('room').textContent;

describe('useSidePanelRoom', () => {
  it('offers the column on a wide viewport with no dock', () => {
    render(<Probe />);
    expect(room()).toBe('column');
  });

  it('stacks when the dock leaves the record too little', () => {
    // 1080 - 420 dock - 32 padding = 628 available; 380 panel + 380 floor
    // needs 760. This is the case that shipped looking broken.
    setViewport(1080);
    setDock(420);
    render(<Probe />);
    expect(room()).toBe('stacked');
  });

  it('offers the column at the same width once the dock is closed', () => {
    setViewport(1080);
    setDock(0);
    render(<Probe />);
    // 1080 - 0 - 32 = 1048 >= 760.
    expect(room()).toBe('column');
  });

  it('reacts when the dock opens, which fires no resize event', async () => {
    // The dock publishes its width by setting a custom property on the root
    // element. Nothing else announces the change, so a hook that only listens
    // for `resize` keeps whatever layout the dialog opened with.
    setViewport(1080);
    setDock(0);
    render(<Probe />);
    expect(room()).toBe('column');

    await act(async () => {
      setDock(420);
      // MutationObserver callbacks are delivered as microtasks.
      await Promise.resolve();
    });
    expect(room()).toBe('stacked');
  });
});
