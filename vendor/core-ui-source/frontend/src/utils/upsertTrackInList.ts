import type { Track } from '../types';

/** Keep the workspace Tracks page coherent with an acknowledged Track write. */
export function upsertTrackInList(
  current: Track[] | undefined,
  track: Track,
): Track[] {
  const tracks = current ?? [];
  const index = tracks.findIndex((item) => item.id === track.id);
  if (index < 0) return [...tracks, track];

  const next = [...tracks];
  next[index] = track;
  return next;
}
