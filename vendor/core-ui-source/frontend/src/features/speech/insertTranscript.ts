/**
 * Pure text surgery for dictation into the composer.
 *
 * Dictated text lives in one region of the composer value, starting at the
 * caret (or replacing the selection) when dictation began:
 *
 *   before | committed (finals so far) | interim (live guess) | after
 *
 * Interim text is written into the textarea itself and replaced on every
 * update — an overlay would fight the tag-highlighting mirror. Spacing is
 * normalized at the region's edges so dictation reads like typing.
 */

export interface DictationAnchor {
  start: number;
  committedLen: number;
  interimLen: number;
}

export interface DictationEdit {
  value: string;
  anchor: DictationAnchor;
  /** Where the caret belongs: just after the dictated text. */
  caret: number;
}

const TOKEN_PATTERN = /[@#][^\s@#]+/g;
const NO_SPACE_BEFORE = /^[\s.,!?;:)\]}%]/;
const OPENERS = /[\s([{"'“‘]$/;
const NO_SPACE_AFTER_PIECE_BEFORE = /^[\s.,!?;:)\]}]/;

/** `[start, end)` ranges of `@mention` / `#tag` tokens in `value`. */
export function tokenRangesOf(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    ranges.push([start, start + match[0].length]);
  }
  return ranges;
}

function lead(prefix: string, text: string): string {
  if (!text) return '';
  const needsSpace = prefix.length > 0 && !OPENERS.test(prefix) && !NO_SPACE_BEFORE.test(text);
  return needsSpace ? ` ${text}` : text;
}

function trail(piece: string, after: string): string {
  if (!piece || !after || /\s$/.test(piece) || NO_SPACE_AFTER_PIECE_BEFORE.test(after)) {
    return piece;
  }
  return `${piece} `;
}

function split(value: string, anchor: DictationAnchor) {
  const start = Math.min(anchor.start, value.length);
  const committedEnd = Math.min(start + anchor.committedLen, value.length);
  const interimEnd = Math.min(committedEnd + anchor.interimLen, value.length);
  return {
    before: value.slice(0, start),
    committed: value.slice(start, committedEnd),
    after: value.slice(interimEnd),
  };
}

/**
 * Open a dictation region at the selection. A selection is replaced; a
 * caret inside an `@`/`#` token moves to the token's end so a mention is
 * never split.
 */
export function beginDictation(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  tokens: Array<[number, number]> = tokenRangesOf(value),
): { value: string; anchor: DictationAnchor } {
  let start = Math.max(0, Math.min(selectionStart, value.length));
  let end = Math.max(start, Math.min(selectionEnd, value.length));
  for (const [a, b] of tokens) {
    if (start > a && start < b) start = b;
    if (end > a && end < b) end = b;
  }
  if (end < start) end = start;
  return {
    value: value.slice(0, start) + value.slice(end),
    anchor: { start, committedLen: 0, interimLen: 0 },
  };
}

/** Replace the live (not-yet-final) text. `''` removes it. */
export function applyInterim(
  value: string,
  anchor: DictationAnchor,
  interim: string,
): DictationEdit {
  const { before, committed, after } = split(value, anchor);
  const core = lead(before + committed, interim.trim());
  const piece = trail(core, after);
  return {
    value: before + committed + piece + after,
    anchor: { ...anchor, interimLen: piece.length },
    caret: before.length + committed.length + core.length,
  };
}

/** Commit final text in place of the live text. */
export function applyFinal(
  value: string,
  anchor: DictationAnchor,
  finalText: string,
): DictationEdit {
  const { before, committed, after } = split(value, anchor);
  const core = lead(before + committed, finalText.trim());
  const piece = trail(core, after);
  return {
    value: before + committed + piece + after,
    anchor: { ...anchor, committedLen: anchor.committedLen + piece.length, interimLen: 0 },
    caret: before.length + committed.length + core.length,
  };
}

/** The finals dictated so far, trimmed. */
export function committedText(value: string, anchor: DictationAnchor): string {
  return split(value, anchor).committed.trim();
}
