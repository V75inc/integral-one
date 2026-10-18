/**
 * Dictation hotkey: parse `Mod+Shift+Space`-style specs (the backend
 * validates the same grammar), match keyboard events, and render labels.
 *
 * `Mod` is ⌘ on macOS and Ctrl elsewhere. Matching uses `KeyboardEvent.code`
 * so Shift and keyboard layouts don't change which physical key fires.
 */

export interface Hotkey {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** `KeyboardEvent.code` of the non-modifier key. */
  code: string;
  /** The key as written in the spec (for labels). */
  key: string;
}

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Period: 'Period',
  Comma: 'Comma',
  Slash: 'Slash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Backquote: 'Backquote',
  Minus: 'Minus',
  Equal: 'Equal',
};
const MODIFIERS = new Set(['Mod', 'Ctrl', 'Alt', 'Shift', 'Meta']);

function codeForKey(key: string): string | null {
  if (NAMED_CODES[key]) return NAMED_CODES[key];
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^F(?:[1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

export function parseHotkey(spec: string): Hotkey | null {
  const parts = spec.split('+').map(p => p.trim());
  const key = parts.pop() ?? '';
  const code = codeForKey(key);
  if (!code || parts.length === 0) return null;
  const mods = new Set(parts);
  if (mods.size !== parts.length) return null;
  for (const mod of mods) if (!MODIFIERS.has(mod)) return null;
  return {
    mod: mods.has('Mod'),
    ctrl: mods.has('Ctrl'),
    alt: mods.has('Alt'),
    shift: mods.has('Shift'),
    meta: mods.has('Meta'),
    code,
    key,
  };
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad/i.test(platform);
}

function required(hk: Hotkey, mac: boolean) {
  return {
    meta: hk.meta || (hk.mod && mac),
    ctrl: hk.ctrl || (hk.mod && !mac),
    alt: hk.alt,
    shift: hk.shift,
  };
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/** The event is exactly this chord — no missing or extra modifiers. */
export function matchesHotkey(event: KeyLike, hk: Hotkey, mac = isMacPlatform()): boolean {
  const want = required(hk, mac);
  return (
    event.code === hk.code &&
    event.metaKey === want.meta &&
    event.ctrlKey === want.ctrl &&
    event.altKey === want.alt &&
    event.shiftKey === want.shift
  );
}

/**
 * A key of the chord went up. On macOS the main key's `keyup` never arrives
 * while ⌘ is held, so releasing any modifier of the chord counts too.
 */
export function isChordRelease(event: KeyLike, hk: Hotkey, mac = isMacPlatform()): boolean {
  if (event.code === hk.code) return true;
  const want = required(hk, mac);
  return (
    (want.meta && (event.key === 'Meta' || event.key === 'OS')) ||
    (want.ctrl && event.key === 'Control') ||
    (want.alt && event.key === 'Alt') ||
    (want.shift && event.key === 'Shift')
  );
}

/** `⇧⌘Space` on macOS, `Ctrl+Shift+Space` elsewhere. */
export function formatHotkey(spec: string, mac = isMacPlatform()): string {
  const hk = parseHotkey(spec);
  if (!hk) return spec;
  const want = required(hk, mac);
  if (mac) {
    return `${want.ctrl ? '⌃' : ''}${want.alt ? '⌥' : ''}${want.shift ? '⇧' : ''}${
      want.meta ? '⌘' : ''
    }${hk.key}`;
  }
  return [want.ctrl && 'Ctrl', want.alt && 'Alt', want.shift && 'Shift', want.meta && 'Win', hk.key]
    .filter(Boolean)
    .join('+');
}

/**
 * Build a portable spec from a key press, for recording a new shortcut.
 * Returns null for a bare key or an unsupported key — a shortcut needs a
 * modifier so it never fires while typing.
 */
export function hotkeySpecFromEvent(event: KeyLike, mac = isMacPlatform()): string | null {
  const { code } = event;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F(?:[1-9]|1[0-2])$/.test(code)) key = code;
  else if (NAMED_CODES[code]) key = code;
  if (!key) return null;

  const mods: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) mods.push('Mod');
  if (mac && event.ctrlKey) mods.push('Ctrl');
  if (!mac && event.metaKey) mods.push('Meta');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  if (mods.length === 0) return null;
  return [...mods, key].join('+');
}
