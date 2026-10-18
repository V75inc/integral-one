import { useEffect, useState } from 'react';

import { useMatchesMedia } from './useMediaQuery';

/**
 * Whether a dialog can afford its companion column right now.
 *
 * The column is a fixed 380px and does not shrink, so when the overlay is
 * narrow the record body absorbs the entire shortfall. Measured on a 1083px
 * viewport with the assistant dock open: the overlay is inset by the dock
 * (`--assistant-dock-w`, 420px), leaving 663px, of which the panel takes 380
 * and the record is left with 249 — narrow enough that "RAW-STEEL-48" wrapped
 * across three lines.
 *
 * A breakpoint alone cannot see this, because the squeeze comes from the dock
 * rather than the window. So the test is the space actually available: when
 * the body would drop below a legible floor, the caller stacks the panel
 * under the record instead — the same host it already uses on a phone, so
 * nothing new has to be built and nothing becomes unreachable.
 */

/** Keep in step with `--dialog-side-panel-w` in index.css. */
const SIDE_PANEL_W = 380;
/** Below this the record reads as a column of wrapped fragments. */
const MIN_BODY_W = 380;
/** `sm:p-4` on the overlay, both sides. */
const OVERLAY_PADDING = 32;

function readPx(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasRoom(): boolean {
  if (typeof window === 'undefined') return true;
  const dock = readPx('--assistant-dock-w', 0);
  const panel = readPx('--dialog-side-panel-w', SIDE_PANEL_W);
  const available = window.innerWidth - dock - OVERLAY_PADDING;
  return available >= panel + MIN_BODY_W;
}

export function useSidePanelRoom(): boolean {
  const isSmUp = useMatchesMedia('(min-width: 640px)');
  const [room, setRoom] = useState(hasRoom);

  useEffect(() => {
    const update = () => setRoom(hasRoom());
    update();
    window.addEventListener('resize', update);
    /* The dock publishes its width by setting `--assistant-dock-w` on the
       root element, and opening or closing it fires no resize event — so the
       style attribute is the thing to watch. Without this the dialog keeps
       whatever layout it had when it opened. */
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => {
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, []);

  return isSmUp && room;
}
