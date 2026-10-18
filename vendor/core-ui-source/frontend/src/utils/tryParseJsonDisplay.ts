/** Parse a string for JSON viewer display; returns null if not JSON object/array text. */
export function tryParseJsonDisplay(s: string | undefined | null): unknown | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  if (t.length === 0) return null;
  const c = t[0];
  if (c !== "{" && c !== "[") return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

/**
 * Render a tool-call arg/result value as indented, display-ready text.
 *
 * native provider tool results arrive in mixed shapes: a parsed object, OR a
 * JSON-encoded string (the streaming translator falls back to the raw
 * `content` / `tool_result` text). A JSON-encoded string printed verbatim is an
 * unindented one-line blob — so parse it first and pretty-print. Non-JSON
 * strings pass through unchanged; objects are stringified with 2-space indent.
 */
export function formatToolValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    const parsed = tryParseJsonDisplay(value);
    return parsed !== null ? JSON.stringify(parsed, null, 2) : value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
