import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAP_THRESHOLD_MS, useDictationHotkey } from '../useDictationHotkey';

function keyEvent(
  type: 'keydown' | 'keyup',
  opts: Partial<KeyboardEvent> & { code: string; key: string },
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    shiftKey: true,
    ...opts,
  });
}

describe('useDictationHotkey', () => {
  let start: ReturnType<typeof vi.fn<() => void>>;
  let stop: ReturnType<typeof vi.fn<() => void>>;
  let listening: boolean;

  beforeEach(() => {
    start = vi.fn<() => void>();
    stop = vi.fn<() => void>();
    listening = false;
    start.mockImplementation(() => {
      listening = true;
    });
    stop.mockImplementation(() => {
      listening = false;
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mount(mode: 'hold' | 'hold_or_toggle' | 'toggle' = 'hold') {
    return renderHook(() =>
      useDictationHotkey({
        hotkey: 'Ctrl+Shift+Space',
        mode,
        enabled: true,
        isActive: () => true,
        isListening: () => listening,
        start,
        stop,
      }),
    );
  }

  it('stops hold-to-talk on window blur', () => {
    mount('hold');
    act(() => {
      window.dispatchEvent(
        keyEvent('keydown', { code: 'Space', key: ' ', ctrlKey: true, shiftKey: true }),
      );
    });
    expect(start).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops hold-to-talk on tab hide', () => {
    mount('hold');
    act(() => {
      window.dispatchEvent(
        keyEvent('keydown', { code: 'Space', key: ' ', ctrlKey: true, shiftKey: true }),
      );
    });
    expect(start).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('releases hold when a chord key goes up after the tap threshold', () => {
    mount('hold_or_toggle');
    act(() => {
      window.dispatchEvent(
        keyEvent('keydown', { code: 'Space', key: ' ', ctrlKey: true, shiftKey: true }),
      );
    });
    expect(start).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(TAP_THRESHOLD_MS + 10);
      window.dispatchEvent(
        keyEvent('keyup', { code: 'Space', key: ' ', ctrlKey: true, shiftKey: true }),
      );
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
