import { describe, expect, it } from 'vitest';

import {
  formatHotkey,
  hotkeySpecFromEvent,
  isChordRelease,
  matchesHotkey,
  parseHotkey,
} from '../hotkey';

function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    code: '',
    key: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('hotkey', () => {
  it('parses modifier chords', () => {
    expect(parseHotkey('Mod+Shift+Space')).toMatchObject({
      mod: true,
      shift: true,
      code: 'Space',
      key: 'Space',
    });
    expect(parseHotkey('Ctrl+Alt+D')?.code).toBe('KeyD');
    expect(parseHotkey('Mod+1')?.code).toBe('Digit1');
  });

  it('rejects bare keys, duplicates and unknown parts', () => {
    expect(parseHotkey('Space')).toBeNull();
    expect(parseHotkey('Mod+Mod+K')).toBeNull();
    expect(parseHotkey('Hyper+K')).toBeNull();
    expect(parseHotkey('Mod+Tab')).toBeNull();
  });

  it('maps Mod to Cmd on macOS and Ctrl elsewhere', () => {
    const hk = parseHotkey('Mod+Shift+Space')!;
    const cmd = key({ code: 'Space', metaKey: true, shiftKey: true });
    const ctrl = key({ code: 'Space', ctrlKey: true, shiftKey: true });
    expect(matchesHotkey(cmd, hk, true)).toBe(true);
    expect(matchesHotkey(cmd, hk, false)).toBe(false);
    expect(matchesHotkey(ctrl, hk, false)).toBe(true);
    expect(matchesHotkey(ctrl, hk, true)).toBe(false);
  });

  it('refuses extra modifiers', () => {
    const hk = parseHotkey('Mod+Shift+Space')!;
    expect(
      matchesHotkey(key({ code: 'Space', metaKey: true, shiftKey: true, altKey: true }), hk, true),
    ).toBe(false);
  });

  it('treats releasing any chord key as release', () => {
    const hk = parseHotkey('Mod+Shift+Space')!;
    expect(isChordRelease(key({ code: 'Space' }), hk, true)).toBe(true);
    expect(isChordRelease(key({ key: 'Meta' }), hk, true)).toBe(true);
    expect(isChordRelease(key({ key: 'Shift' }), hk, true)).toBe(true);
    expect(isChordRelease(key({ key: 'Control' }), hk, true)).toBe(false);
    expect(isChordRelease(key({ key: 'Control' }), hk, false)).toBe(true);
  });

  it('formats labels per platform', () => {
    expect(formatHotkey('Mod+Shift+Space', true)).toBe('⇧⌘Space');
    expect(formatHotkey('Mod+Shift+Space', false)).toBe('Ctrl+Shift+Space');
  });

  it('records a shortcut from a key press', () => {
    expect(hotkeySpecFromEvent(key({ code: 'Space', metaKey: true, shiftKey: true }), true)).toBe(
      'Mod+Shift+Space',
    );
    expect(hotkeySpecFromEvent(key({ code: 'KeyD', ctrlKey: true, altKey: true }), false)).toBe(
      'Mod+Alt+D',
    );
    expect(hotkeySpecFromEvent(key({ code: 'KeyD' }), false)).toBeNull();
    expect(hotkeySpecFromEvent(key({ code: 'Tab', ctrlKey: true }), false)).toBeNull();
  });

  it('round-trips a recorded shortcut through the matcher', () => {
    const press = key({ code: 'KeyM', metaKey: true, altKey: true });
    const spec = hotkeySpecFromEvent(press, true)!;
    expect(matchesHotkey(press, parseHotkey(spec)!, true)).toBe(true);
  });
});
