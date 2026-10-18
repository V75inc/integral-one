import type { Track } from '../types';

/** Where to land after a track is deleted. */
export function pathAfterTrackDelete(track: Pick<Track, 'app'>): string {
  const appId = track.app?.id?.trim();
  return appId ? `/apps/${appId}` : '/tracks';
}
