/**
 * User-facing text normalization so common encoding glitches don't render as
 * ``?``, ``�`` (U+FFFD), or typical UTF-8/latin1 mojibake.
 */

/** Latin-1-as-UTF-8 mojibake often contains these lead bytes. */
const MOJIBAKE_HINT = /[\u00C2\u00C3\u00E2\u00EF]|â€|Ã.|Â./;

/**
 * If ``s`` is UTF-8 octets misread as ISO-8859-1/latin1, reinterpret bytes as UTF-8.
 * No-op if any code unit is > 255 (already widened Unicode).
 */
function tryRepairUtf8MisreadAsLatin1(s: string): string {
  if (s.length < 2 || !MOJIBAKE_HINT.test(s)) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 255) return s;
    bytes[i] = c;
  }
  const repaired = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (repaired.includes('\uFFFD')) return s;

  const mojBefore = (s.match(/[\u00C2\u00C3\u00C4\u00C5\u00E2\u00EF]/g) || []).length;
  const mojAfter = (repaired.match(/[\u00C2\u00C3\u00C4\u00C5\u00E2\u00EF]/g) || []).length;
  if (mojAfter > mojBefore) return s;
  return repaired;
}

/**
 * Unicode NFC + repair common decoding artifacts for display.
 */
export function normalizeForDisplay(text: string | null | undefined): string {
  if (text == null) return '';
  let s = String(text).normalize('NFC');

  // U+FFFD: replacement character from bad UTF-8; often between letters (e.g. hyphen lost).
  s = s.replace(/(\p{L})\uFFFD(\p{L})/gu, '$1-$2');

  s = tryRepairUtf8MisreadAsLatin1(s);
  return s;
}

/** Deep-normalize every string in JSON-like API payloads (ids stay ASCII-safe). */
export function normalizeDeepStrings(value: unknown): unknown {
  if (typeof value === 'string') return normalizeForDisplay(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeDeepStrings);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = normalizeDeepStrings(v);
  }
  return out;
}
