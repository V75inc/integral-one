import type { ChatEntityRef } from '../../types/chatEntityRefs';

/** Visible token text (no trailing space — composer adds that). */
export function tokenTextForRef(ref: ChatEntityRef): string {
  if (ref.token) return ref.token;
  const label = ref.label.trim();
  const trigger = ref.kind === 'user' ? '@' : '#';
  return `${trigger}${label}`;
}

/** Normalize ref for storage / matching (trim label, set exact token). */
export function normalizeEntityRef(ref: ChatEntityRef): ChatEntityRef {
  const label = ref.label.trim();
  const trigger = ref.kind === 'user' ? '@' : '#';
  const token = ref.token?.trim() || `${trigger}${label}`;
  return { ...ref, label, token };
}

export function normalizeEntityRefs(refs: ChatEntityRef[]): ChatEntityRef[] {
  return refs.map(normalizeEntityRef);
}

export function tokenTextForUser(user: {
  display_name?: string;
  email?: string;
}): string {
  return (user.display_name || user.email || 'user').trim();
}

export function tokenTextForResourceLabel(label: string): string {
  return label.trim();
}

export function refAppearsInText(text: string, ref: ChatEntityRef): boolean {
  const token = tokenTextForRef(ref);
  return text.toLowerCase().includes(token.toLowerCase());
}

export function refForToken(
  token: string,
  entityRefs: ChatEntityRef[],
): ChatEntityRef | undefined {
  const fold = token.toLowerCase();
  return normalizeEntityRefs(entityRefs).find(
    r => tokenTextForRef(r).toLowerCase() === fold,
  );
}

export interface TagSegment {
  start: number;
  end: number;
  text: string;
  trigger: '@' | '#';
  body: string;
  ref?: ChatEntityRef;
}

function rangeOverlaps(
  start: number,
  end: number,
  occupied: Array<{ start: number; end: number }>,
): boolean {
  return occupied.some(o => start < o.end && end > o.start);
}

function needleForRef(ref: ChatEntityRef): string {
  return tokenTextForRef(normalizeEntityRef(ref));
}

const BODY_WORD_RX = /^[A-Za-z0-9_.\-&'/]+/;

/** Prose continuations — do not include in a free-scanned tag body. */
const TAG_STOP_WORDS = new Set([
  'today',
  'tomorrow',
  'yesterday',
  'now',
  'please',
  'thanks',
  'thank',
  'ok',
  'okay',
  'here',
  'there',
  'this',
  'that',
  'and',
  'or',
  'but',
  'for',
  'with',
  'from',
  'into',
  'about',
  'when',
  'where',
  'what',
  'how',
  'can',
  'could',
  'would',
  'should',
  'will',
  'just',
  'also',
  'then',
  'than',
]);

function isTagBoundary(text: string, index: number): boolean {
  return index <= 0 || /\s/.test(text[index - 1] ?? '');
}

/** Scan a free-form @ / # token (multi-word) when no stored ref matched. */
function scanFreeTag(text: string, start: number, maxWords = 12): TagSegment | null {
  const trigger = text[start] as '@' | '#';
  if (trigger !== '@' && trigger !== '#') return null;
  if (!isTagBoundary(text, start)) return null;

  let i = start + 1;
  const words: string[] = [];
  while (words.length < maxWords && i < text.length) {
    const rest = text.slice(i);
    const word = rest.match(BODY_WORD_RX);
    if (!word) break;
    if (words.length > 0 && TAG_STOP_WORDS.has(word[0].toLowerCase())) break;
    words.push(word[0]);
    i += word[0].length;
    if (i >= text.length) break;
    if (text[i] === '@' || text[i] === '#') break;
    if (text[i] === '\n') break;
    if (text.slice(i, i + 2) === '  ') break;
    if (/[,.!?;:)]/.test(text[i] ?? '')) break;
    if (text[i] === ' ') {
      const next = text.slice(i + 1);
      const nextWord = next.match(BODY_WORD_RX);
      if (!nextWord) break;
      i += 1;
      continue;
    }
    break;
  }

  if (words.length === 0) return null;
  const body = words.join(' ');
  const end = start + 1 + body.length;
  return {
    start,
    end,
    text: text.slice(start, end),
    trigger,
    body,
  };
}

function attachRef(seg: TagSegment, entityRefs: ChatEntityRef[]): TagSegment {
  if (seg.ref) return seg;
  const ref = refForToken(seg.text, entityRefs);
  return ref ? { ...seg, ref } : seg;
}

/** Locate @ / # spans; prefers known entityRefs (supports spaces in labels). */
export function findTagSegments(text: string, entityRefs: ChatEntityRef[]): TagSegment[] {
  if (!text) return [];

  const occupied: Array<{ start: number; end: number }> = [];
  const matches: TagSegment[] = [];
  const normalizedRefs = normalizeEntityRefs(entityRefs);

  const sorted = [...normalizedRefs].sort(
    (a, b) => needleForRef(b).length - needleForRef(a).length,
  );

  for (const ref of sorted) {
    const label = ref.label.trim();
    if (!label) continue;
    const trigger: '@' | '#' = ref.kind === 'user' ? '@' : '#';
    const needle = needleForRef(ref);
    let from = 0;
    while (from < text.length) {
      const idx = text.toLowerCase().indexOf(needle.toLowerCase(), from);
      if (idx < 0) break;
      const end = idx + needle.length;
      if (!isTagBoundary(text, idx) || rangeOverlaps(idx, end, occupied)) {
        from = idx + 1;
        continue;
      }
      occupied.push({ start: idx, end });
      matches.push({
        start: idx,
        end,
        text: text.slice(idx, end),
        trigger,
        body: label,
        ref,
      });
      from = end;
    }
  }

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' && text[i] !== '#') continue;
    if (!isTagBoundary(text, i) || rangeOverlaps(i, i + 1, occupied)) continue;
    const free = scanFreeTag(text, i);
    if (!free || rangeOverlaps(free.start, free.end, occupied)) continue;
    occupied.push({ start: free.start, end: free.end });
    matches.push(attachRef(free, normalizedRefs));
  }

  return matches
    .sort((a, b) => a.start - b.start)
    .map(seg => attachRef(seg, normalizedRefs));
}

export function hrefForEntityRef(
  ref: ChatEntityRef,
  workspaceId?: string | null,
): string | null {
  if (ref.kind === 'app') {
    return `/apps/${encodeURIComponent(ref.id)}`;
  }
  if (ref.kind === 'track') {
    return `/tracks/${encodeURIComponent(ref.id)}`;
  }
  if (ref.kind === 'user' && workspaceId) {
    return `/workspaces/${encodeURIComponent(workspaceId)}/members`;
  }
  return null;
}
