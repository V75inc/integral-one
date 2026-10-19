/**
 * Persisted dock preferences.
 *
 * The clamp matters more than it looks: the width is read straight out of
 * localStorage on first render and applied as an inline pixel width, so a
 * stale value written before the bounds changed — or a hand-edited one —
 * would otherwise produce a dock that covers the page or is too narrow to
 * use, with no in-app way to recover short of clearing storage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCK_DEFAULT_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  clampDockWidth,
  readDockOpen,
  readDockWidth,
  writeDockOpen,
  writeDockWidth,
} from '../assistantDockPrefs';

describe('clampDockWidth', () => {
  it('holds the bounds', () => {
    expect(clampDockWidth(DOCK_MIN_WIDTH - 200)).toBe(DOCK_MIN_WIDTH);
    expect(clampDockWidth(DOCK_MAX_WIDTH + 900)).toBe(DOCK_MAX_WIDTH);
    expect(clampDockWidth(440)).toBe(440);
  });

  it('rounds fractional widths from a pointer drag', () => {
    expect(clampDockWidth(432.6)).toBe(433);
  });

  it('falls back to the default for NaN rather than emitting width: NaNpx', () => {
    expect(clampDockWidth(Number.NaN)).toBe(DOCK_DEFAULT_WIDTH);
    expect(clampDockWidth(Number.POSITIVE_INFINITY)).toBe(DOCK_DEFAULT_WIDTH);
  });
});

describe('dock prefs round-trip', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults to closed at the default width on a fresh browser', () => {
    expect(readDockOpen()).toBe(false);
    expect(readDockWidth()).toBe(DOCK_DEFAULT_WIDTH);
  });

  it('round-trips open state', () => {
    writeDockOpen(true);
    expect(readDockOpen()).toBe(true);
    writeDockOpen(false);
    expect(readDockOpen()).toBe(false);
  });

  it('clamps on the way in AND on the way out', () => {
    writeDockWidth(9999);
    expect(localStorage.getItem('integral:assistant-dock:width')).toBe(
      String(DOCK_MAX_WIDTH),
    );

    // A value that predates the current bounds, written by an older build.
    localStorage.setItem('integral:assistant-dock:width', '1200');
    expect(readDockWidth()).toBe(DOCK_MAX_WIDTH);
  });

  it('survives unparseable stored values', () => {
    localStorage.setItem('integral:assistant-dock:width', 'wide-please');
    expect(readDockWidth()).toBe(DOCK_DEFAULT_WIDTH);
  });

  it('does not throw when storage is unavailable (private mode / quota)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    // Falling back is the point: a dock that refuses to open because
    // localStorage is blocked would be a worse bug than a forgotten width.
    expect(readDockOpen()).toBe(false);
    expect(readDockWidth()).toBe(DOCK_DEFAULT_WIDTH);
    expect(() => writeDockOpen(true)).not.toThrow();
    expect(() => writeDockWidth(420)).not.toThrow();
  });
});
