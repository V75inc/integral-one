/**
 * Persisted assistant-dock preferences.
 *
 * Module-level read/write helpers rather than a hook, mirroring
 * `components/layout/pinnedSidebarCollapse.ts` — the context owns the React
 * state and calls these on change, so nothing else has to subscribe.
 *
 * Every access is try/caught: private mode and quota-exhausted storage both
 * throw on write, and a dock that refuses to open because localStorage is
 * unavailable would be a worse bug than a dock that forgets its width.
 */

const OPEN_KEY = 'integral:assistant-dock:open';
const WIDTH_KEY = 'integral:assistant-dock:width';

/** Width bounds. Below ~360px the composer and staged-change cards wrap
 *  badly; above ~560px the dock starts crowding page content on a laptop. */
export const DOCK_MIN_WIDTH = 360;
export const DOCK_MAX_WIDTH = 560;
export const DOCK_DEFAULT_WIDTH = 420;

export function clampDockWidth(px: number): number {
  if (!Number.isFinite(px)) return DOCK_DEFAULT_WIDTH;
  return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(px)));
}

export function readDockOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDockOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Always returns an in-range width — a hand-edited or stale-bounds value
 *  in storage clamps rather than producing an unusable dock. */
export function readDockWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return DOCK_DEFAULT_WIDTH;
    return clampDockWidth(Number.parseInt(raw, 10));
  } catch {
    return DOCK_DEFAULT_WIDTH;
  }
}

export function writeDockWidth(px: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(clampDockWidth(px)));
  } catch {
    /* ignore */
  }
}
