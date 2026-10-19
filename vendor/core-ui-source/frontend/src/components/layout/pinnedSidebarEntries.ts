import type { App, Track } from '../../types';

export type PinnedSidebarEntry =
  | { kind: 'app'; app: App; tracks: Track[] }
  | {
      kind: 'app-group';
      appId: string;
      appName: string;
      accentColor?: string;
      tracks: Track[];
    }
  | { kind: 'track'; track: Track };

export const NO_APP_KEY = '__no_app__';

function trackAppId(track: Track): string {
  return track.app?.id?.trim() || NO_APP_KEY;
}

/**
 * Orders pinned sidebar items: pinned apps (with nested tracks), then
 * multi-track app groups (app not pinned), then standalone pinned tracks.
 */
export function buildPinnedSidebarEntries(
  pinnedApps: App[],
  pinnedTracks: Track[]
): PinnedSidebarEntry[] {
  const tracksByApp = new Map<string, Track[]>();
  const standalone: Track[] = [];

  for (const track of pinnedTracks) {
    const appId = trackAppId(track);
    if (appId === NO_APP_KEY) {
      standalone.push(track);
      continue;
    }
    const bucket = tracksByApp.get(appId) ?? [];
    bucket.push(track);
    tracksByApp.set(appId, bucket);
  }

  const entries: PinnedSidebarEntry[] = [];

  for (const app of pinnedApps) {
    const tracks = tracksByApp.get(app.id) ?? [];
    tracksByApp.delete(app.id);
    entries.push({ kind: 'app', app, tracks });
  }

  for (const [appId, tracks] of tracksByApp) {
    if (tracks.length >= 2) {
      const appName = tracks[0].app?.name?.trim() || 'Untitled app';
      const accentColor = tracks[0].app?.accent_color?.trim() || undefined;
      entries.push({ kind: 'app-group', appId, appName, accentColor, tracks });
    } else {
      standalone.push(...tracks);
    }
  }

  for (const track of standalone) {
    entries.push({ kind: 'track', track });
  }

  return entries;
}
