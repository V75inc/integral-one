/**
 * Global dictation hotkey for the active chat surface.
 *
 * Modes:
 *  - `toggle` — each press starts or stops.
 *  - `hold` — push-to-talk: listen while the chord is held.
 *  - `hold_or_toggle` (default) — a quick tap (< 300 ms) toggles on; holding
 *    longer is push-to-talk; pressing again while listening stops.
 *
 * Release is detected on keyup of ANY key in the chord, on window blur and on
 * tab hide — macOS doesn't deliver the main key's keyup while ⌘ is held, and
 * a missed release would leave the microphone open.
 */
import { useEffect, useRef } from 'react';

import type { HotkeyMode } from '../../api/speech';
import { isChordRelease, isMacPlatform, matchesHotkey, parseHotkey } from './hotkey';

export const TAP_THRESHOLD_MS = 300;

export interface DictationHotkeyOptions {
  hotkey: string;
  mode: HotkeyMode;
  enabled: boolean;
  /** Only the chat surface the user is working in reacts. */
  isActive: () => boolean;
  isListening: () => boolean;
  start: () => void;
  stop: () => void;
}

export function useDictationHotkey(options: DictationHotkeyOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const { hotkey, enabled } = options;

  useEffect(() => {
    const parsed = parseHotkey(hotkey);
    if (!parsed || !enabled) return undefined;
    const hk = parsed;
    const mac = isMacPlatform();
    let heldSince: number | null = null;

    const release = () => {
      if (heldSince === null) return;
      const heldFor = Date.now() - heldSince;
      heldSince = null;
      const o = latest.current;
      if (o.mode === 'hold' || heldFor >= TAP_THRESHOLD_MS) o.stop();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesHotkey(event, hk, mac)) return;
      const o = latest.current;
      if (!o.isActive()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || heldSince !== null) return;

      if (o.mode === 'toggle') {
        if (o.isListening()) o.stop();
        else o.start();
        return;
      }
      if (o.isListening()) {
        if (o.mode === 'hold_or_toggle') o.stop();
        return;
      }
      o.start();
      heldSince = Date.now();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (heldSince !== null && isChordRelease(event, hk, mac)) release();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') release();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hotkey, enabled]);
}
