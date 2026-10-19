import apiClient from './client';

export interface PinnedSet {
  tracks: string[];
  apps: string[];
}

const EMPTY: PinnedSet = { tracks: [], apps: [] };

function normalize(data: unknown): PinnedSet {
  const raw = (data as { pinned?: Partial<PinnedSet> })?.pinned ?? {};
  return {
    tracks: Array.isArray(raw.tracks)
      ? raw.tracks.filter((x): x is string => typeof x === 'string')
      : [],
    apps: Array.isArray(raw.apps)
      ? raw.apps.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export const pinnedApi = {
  get: async (): Promise<PinnedSet> => {
    try {
      const { data } = await apiClient.get('/users/me/pinned');
      return normalize(data);
    } catch {
      return { ...EMPTY };
    }
  },

  toggle: async (
    kind: 'track' | 'app',
    id: string,
    pinned: boolean,
  ): Promise<PinnedSet> => {
    const { data } = await apiClient.post('/users/me/pinned', { kind, id, pinned });
    return normalize(data);
  },
};
