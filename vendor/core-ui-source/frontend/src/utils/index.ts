import {
  formatDistanceToNow,
  parseISO,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
} from 'date-fns';
import type { CSSProperties } from 'react';
import type { User } from '../types';

export {
  buildCommentForest,
  countSubtreeComments,
  getNewestRootPreviews,
  getSingleNewestThreadPreview,
} from './commentTree';
export type { CommentThreadNode, RootPreviewRow } from './commentTree';

export {
  operationalModelLibrarySelectOptions,
  operationalModelTemplateSelectOptions,
  manifestAppTracks,
} from './operationalModelSelectOptions';
export type { OperationalModelSelectRow } from './operationalModelSelectOptions';

export {
  appPath,
  entryPath,
  resolveNotificationHref,
  resourcePath,
  trackPath,
  workspacePath,
} from './resourcePaths';
export type { ResourceKind } from './resourcePaths';

/**
 * Pluralize a noun for a given count. English-only.
 *
 * pluralize(0, 'app') -> 'apps'
 * pluralize(1, 'app') -> 'app'
 * pluralize(2, 'app') -> 'apps'
 * pluralize(2, 'entry', 'entries') -> 'entries'
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Format "{count} {noun}" with correct singular/plural. */
export function pluralCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

/** Compare backend principal ids (e.g. entry.author_id) to the logged-in user. */
export function isSamePrincipal(
  user: Pick<User, 'id' | 'user_id'> | null | undefined,
  remoteId: string | undefined
): boolean {
  if (!user || remoteId == null || remoteId === '') return false;
  // A principal carries two parallel ids — the AuthUser id (`o.User.X`,
  // surfaced as `user.user_id`) and the graph User node id (`n.User.X`,
  // surfaced as `user.id`). Different writers stamp either one on
  // `owner_user_id` / `author_id` fields depending on which layer
  // produced the record. Match against EITHER so identity checks stay
  // consistent across the auth/graph boundary.
  if (user.user_id && user.user_id === remoteId) return true;
  if (user.id && user.id === remoteId) return true;
  return false;
}

/** Collapse duplicate collaborator rows that share an id or user_id (graph vs auth principal). */
export function dedupeCollaborators<T extends { id?: string; user_id?: string }>(
  list: T[]
): T[] {
  const out: T[] = [];
  for (const c of list) {
    const ids = [c.id, c.user_id].filter(Boolean) as string[];
    const clash = out.some(existing => {
      const eids = [existing.id, existing.user_id].filter(Boolean) as string[];
      return ids.some(i => eids.includes(i));
    });
    if (!clash) out.push(c);
  }
  return out;
}

export function formatRelativeTime(dateStr: string): string {
  try { return formatDistanceToNow(parseISO(dateStr), { addSuffix: true }); }
  catch { return dateStr || ''; }
}

/** Two-line "Today / 9:42 AM" timestamps for editorial entry rows.
 *
 * Returns a `{ dateLabel, timeLabel }` pair the caller can stack vertically
 * in the right-column of a list row. The date label collapses long-tail
 * dates aggressively:
 *   - same calendar day → "Today"
 *   - yesterday          → "Yesterday"
 *   - same calendar year → "Mon 8" (locale-short)
 *   - prior years        → "Jan 8, 2024"
 * The time label is always present in 12h locale form (e.g. "9:42 AM").
 */
export function formatStackedDateTime(dateStr: string): {
  dateLabel: string;
  timeLabel: string;
} {
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    let dateLabel: string;
    if (sameDay(d, now)) {
      dateLabel = 'Today';
    } else if (sameDay(d, yesterday)) {
      dateLabel = 'Yesterday';
    } else if (d.getFullYear() === now.getFullYear()) {
      dateLabel = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } else {
      dateLabel = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const timeLabel = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return { dateLabel, timeLabel };
  } catch {
    return { dateLabel: dateStr || '', timeLabel: '' };
  }
}

/** Compact relative labels (e.g. 8h, 3d) for social-style headers. */
export function formatShortRelativeTime(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    const sec = differenceInSeconds(now, d);
    if (sec < 45) return 'now';
    const min = differenceInMinutes(now, d);
    if (min < 60) return `${min}m`;
    const hr = differenceInHours(now, d);
    if (hr < 24) return `${hr}h`;
    const days = differenceInDays(now, d);
    if (days < 7) return `${days}d`;
    const wk = differenceInWeeks(now, d);
    if (wk < 5) return `${wk}w`;
    const mo = differenceInMonths(now, d);
    if (mo < 12) return `${mo}mo`;
    return `${differenceInYears(now, d)}y`;
  } catch {
    return dateStr || '';
  }
}
export function getInitials(name: string): string {
  if (!name) return '?';
  return name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
}
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

/** Only built-in entry type; further types come from the track operational model (API). */
export const BASE_ENTRY_TYPE_SLUGS: readonly string[] = ['post'];

/** Fallback avatar fill when no photo (matches default track / logo accent). */
export function getAvatarColor(_name?: string): string {
  return 'bg-[var(--brand-accent)]';
}
export function getEntryTypeStyle(type: string): { bg: string; text: string } {
  const m: Record<string, { bg: string; text: string }> = {
    post: {
      bg: 'bg-blue-50 dark:bg-blue-950/45',
      text: 'text-blue-700 dark:text-blue-200',
    },
    task: {
      bg: 'bg-violet-50 dark:bg-violet-950/45',
      text: 'text-violet-700 dark:text-violet-200',
    },
    update: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/45',
      text: 'text-emerald-700 dark:text-emerald-200',
    },
    issue: {
      bg: 'bg-red-50 dark:bg-red-950/45',
      text: 'text-red-700 dark:text-red-200',
    },
    idea: {
      bg: 'bg-amber-50 dark:bg-amber-950/45',
      text: 'text-amber-700 dark:text-amber-200',
    },
    question: {
      bg: 'bg-cyan-50 dark:bg-cyan-950/45',
      text: 'text-cyan-700 dark:text-cyan-200',
    },
    decision: {
      bg: 'bg-orange-50 dark:bg-orange-950/45',
      text: 'text-orange-700 dark:text-orange-200',
    },
    milestone: {
      bg: 'bg-pink-50 dark:bg-pink-950/45',
      text: 'text-pink-700 dark:text-pink-200',
    },
  };
  return (
    m[type?.toLowerCase()] || {
      bg: 'bg-gray-50 dark:bg-neutral-800',
      text: 'text-gray-600 dark:text-neutral-300',
    }
  );
}

/** Solid circle background for entry-type line icons (white glyph on top). */
export function getEntryTypeSolidBg(type: string): string {
  const m: Record<string, string> = {
    post: 'bg-blue-600 dark:bg-blue-500',
    task: 'bg-violet-600 dark:bg-violet-500',
    update: 'bg-emerald-600 dark:bg-emerald-500',
    issue: 'bg-red-600 dark:bg-red-500',
    idea: 'bg-amber-500 dark:bg-amber-500',
    question: 'bg-cyan-600 dark:bg-cyan-500',
    decision: 'bg-orange-600 dark:bg-orange-500',
    milestone: 'bg-pink-600 dark:bg-pink-500',
  };
  return m[type?.toLowerCase()] || 'bg-gray-500 dark:bg-gray-600';
}

export type TrackAccentSource = { accent_color?: string | null } | null | undefined;

/** Resolve an identity color: active workspace first, then item choice, then theme default. */
export function resolveIdentityColor(
  itemColor?: string | null,
  workspaceColor?: string | null,
): string | undefined {
  return workspaceColor?.trim() || itemColor?.trim() || undefined;
}

const _HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const _HEX6 = /^#([0-9a-f]{6})$/i;

/** Normalize to #rrggbb or null when unset / invalid. */
export function parseTrackAccentHex(input?: string | null): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  let m = raw.match(_HEX6);
  if (m) return `#${m[1].toLowerCase()}`;
  m = raw.match(_HEX3);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase();
  return null;
}

function _hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Whether light (white) or dark glyphs read best on this hex fill. */
export function trackAccentGlyphTone(hex: string): 'light' | 'dark' {
  const rgb = _hexToRgb(hex);
  if (!rgb) return 'light';
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 150 ? 'dark' : 'light';
}

/** Background for track accent bars (theme default or custom hex). */
export function trackAccentSurfaceProps(
  track: TrackAccentSource
): { className: string; style?: CSSProperties } {
  const hex = parseTrackAccentHex(track?.accent_color);
  if (!hex) {
    return { className: 'bg-[var(--track-accent-bg)]' };
  }
  return { className: '', style: { backgroundColor: hex } };
}

/** Icon / label color on top of ``trackAccentSurfaceProps`` background. */
export function trackAccentGlyphClass(track: TrackAccentSource): string {
  const hex = parseTrackAccentHex(track?.accent_color);
  if (!hex) return 'text-[var(--track-accent-fg)]';
  return trackAccentGlyphTone(hex) === 'light' ? 'text-white' : 'text-neutral-900';
}

/** Softer glyph for placeholders on accent surfaces. */
export function trackAccentGlyphMutedClass(track: TrackAccentSource): string {
  const hex = parseTrackAccentHex(track?.accent_color);
  if (!hex) return 'text-[var(--track-accent-fg-muted)]';
  return trackAccentGlyphTone(hex) === 'light'
    ? 'text-white/70'
    : 'text-neutral-900/55';
}

const ENTRY_TYPE_PALETTE = [
  { bg: '#7c5bb0', fg: '#7c5bb0' },
  { bg: '#3e86ab', fg: '#3e86ab' },
  { bg: '#5e8e38', fg: '#5e8e38' },
  { bg: '#b87830', fg: '#b87830' },
  { bg: '#2e8e84', fg: '#2e8e84' },
  { bg: '#b85472', fg: '#b85472' },
  { bg: '#7e8830', fg: '#7e8830' },
  { bg: '#3a72a8', fg: '#3a72a8' },
  { bg: '#b86e4a', fg: '#b86e4a' },
  { bg: '#3a9860', fg: '#3a9860' },
  { bg: '#9050a8', fg: '#9050a8' },
  { bg: '#3a8aa8', fg: '#3a8aa8' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function entryTypeColor(type: string, workspaceColor?: string | null): { bg: string; fg: string } {
  const workspaceAccent = parseTrackAccentHex(workspaceColor);
  if (workspaceAccent) return { bg: workspaceAccent, fg: workspaceAccent };
  const key = (type || '').trim().toLowerCase();
  if (!key) return ENTRY_TYPE_PALETTE[0];
  return ENTRY_TYPE_PALETTE[hashString(key) % ENTRY_TYPE_PALETTE.length];
}

/** In-app path only; blocks open redirects (e.g. //evil.com). */
export function safePostAuthRedirect(
  from?: { pathname: string; search?: string; hash?: string } | null
): string {
  if (!from?.pathname) return '/';
  const { pathname, search, hash } = from;
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/';
  return `${pathname}${search ?? ''}${hash ?? ''}`;
}
