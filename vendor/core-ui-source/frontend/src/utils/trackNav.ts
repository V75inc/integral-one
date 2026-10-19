import type { Track } from '../types';

/**
 * Whether a track should appear in App / workspace navigation lists.
 *
 * - ``nav_visible === false`` → hidden (line-item / internal tracks).
 * - ``kind === 'settings'`` → surfaced via Settings Hub, not track nav.
 * Missing ``nav_visible`` is treated as visible (legacy tracks).
 */
export function isTrackNavVisible(
  track: Pick<Track, 'nav_visible' | 'kind'> | null | undefined
): boolean {
  if (!track) return false;
  if (track.kind === 'settings') return false;
  return track.nav_visible !== false;
}
