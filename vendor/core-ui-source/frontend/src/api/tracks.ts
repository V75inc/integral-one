import apiClient from './client';
import { fetchAllByCursor, hasExplicitPaging } from './pagination';
import {
  unwrapResource,
  toArr,
  buildTypeNameById,
  normalizeEntry,
  hydrateEntryTagsForList,
  unwrapApiDataEnvelope,
} from './helpers';
import { FEED_PAGE_LIMIT } from './feed';
import type { OperationalModelNode, Entry, Track, User } from '../types';

export type TrackEntriesPage = {
  entries: Entry[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
};

export type TrackDetailBundle = {
  track: Track;
  collaborators: User[];
  collaborator_effective_total: number;
  collaborator_inherited_truncated: boolean;
  collaborator_visibility_grant: string | null;
  caller_role?: string | null;
  entry_types: any[];
  views: any[];
};

/** Payload for ``POST /tracks`` (partial; server fills defaults). */
export type CreateTrackBody = {
  title: string;
  purpose?: string;
  icon?: string;
  accent_color?: string;
  visibility?: string;
  template_id?: string;
  workspace_id?: string;
  app_id?: string;
  library_operational_model_id?: string;
  app_track_template_operational_model_id?: string;
  /** Apply tier from parent app manifest ``app.tracks[]`` (mutually exclusive with template/library package fields). */
  app_track_type_key?: string;
};

function cachedPrincipalId(): string | undefined {
  try {
    const c = localStorage.getItem('t75_user');
    if (!c) return undefined;
    const u = JSON.parse(c);
    return u.user_id || u.id;
  } catch {
    return undefined;
  }
}

function mapEntriesForTrack(
  list: any[],
  typeNameById?: Record<string, string>
): ReturnType<typeof normalizeEntry>[] {
  const pid = cachedPrincipalId();
  return list.map(e =>
    normalizeEntry(e, { typeNameById, principalId: pid })
  );
}

function trackNeedsEntryCount(t: Track): boolean {
  return typeof t.entry_count !== 'number' || !Number.isFinite(t.entry_count);
}

/** Fills ``entry_count`` when the list payload omits it (extra GET per track). */
async function withTrackEntryCounts(tracks: Track[]): Promise<Track[]> {
  if (!tracks.length) return tracks;
  const need = tracks.filter(trackNeedsEntryCount);
  if (!need.length) return tracks;
  const totals = await Promise.all(
    need.map(async track => {
      try {
        const { data } = await apiClient.get(`/tracks/${track.id}/entries`, {
          params: { limit: 1 },
        });
        const inner = unwrapApiDataEnvelope(data);
        return typeof inner.total === 'number'
          ? inner.total
          : track.entry_count || 0;
      } catch {
        return track.entry_count || 0;
      }
    })
  );
  const byId = new Map(need.map((t, i) => [t.id, totals[i] as number]));
  return tracks.map(track =>
    byId.has(track.id)
      ? { ...track, entry_count: byId.get(track.id)! }
      : track
  );
}

export const tracksApi = {
  list: async (params?: Record<string, unknown>) => {
    const skipEntryCounts = Boolean(params?.skipEntryCounts);
    const rest = { ...(params || {}) };
    delete rest.skipEntryCounts;
    if (hasExplicitPaging(rest)) {
      const pageTracks = await apiClient
        .get('/tracks', { params: rest })
        .then(r => toArr(r.data) as Track[]);
      return skipEntryCounts ? pageTracks : withTrackEntryCounts(pageTracks);
    }
    const tracks = (await fetchAllByCursor('/tracks', rest)) as Track[];
    return skipEntryCounts ? tracks : withTrackEntryCounts(tracks);
  },
  get: async (id: string) => {
    const track = await apiClient
      .get(`/tracks/${id}`)
      .then(r => unwrapResource<Track>(r.data, 'track'));
    if (!trackNeedsEntryCount(track)) return track;
    const [withCount] = await withTrackEntryCounts([track]);
    return withCount;
  },
  getDetail: async (id: string): Promise<TrackDetailBundle> => {
    const { data } = await apiClient.get(`/tracks/${id}/detail`);
    const inner = unwrapApiDataEnvelope(data);
    return {
      track: unwrapResource<Track>(inner, 'track'),
      collaborators: (inner.collaborators as User[]) || [],
      collaborator_effective_total: Number(inner.collaborator_effective_total || 0),
      collaborator_inherited_truncated: Boolean(
        inner.collaborator_inherited_truncated
      ),
      collaborator_visibility_grant:
        (inner.collaborator_visibility_grant as string | null) ?? null,
      caller_role: (inner.caller_role as string | null | undefined) ?? null,
      entry_types: Array.isArray(inner.entry_types) ? inner.entry_types : [],
      views: Array.isArray(inner.views) ? inner.views : [],
    };
  },
  create: (data: CreateTrackBody) =>
    apiClient
      .post('/tracks', data)
      .then(r => unwrapResource<Track>(r.data, 'track')),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient
      .put(`/tracks/${id}`, data)
      .then(r => unwrapResource<Track>(r.data, 'track')),
  delete: (id: string) => apiClient.delete(`/tracks/${id}`),
  getEntriesPage: async (
    id: string,
    params?: Record<string, unknown>
  ): Promise<TrackEntriesPage> => {
    const merged = { limit: FEED_PAGE_LIMIT, ...params };
    const { data } = await apiClient.get(`/tracks/${id}/entries`, {
      params: merged,
    });
    const inner = unwrapApiDataEnvelope(data);
    const raw = Array.isArray(inner.entries)
      ? (inner.entries as unknown[])
      : toArr(inner);
    const nextCursor =
      typeof inner.next_cursor === 'string' && inner.next_cursor.length > 0
        ? inner.next_cursor
        : null;
    const hasMore = Boolean(inner.has_more);
    const total = typeof inner.total === 'number' ? inner.total : undefined;
    await hydrateEntryTagsForList(raw as any[]);
    const etRes = await apiClient.get('/entry-types', {
      params: { track_id: id },
    });
    const typeNameById = buildTypeNameById(toArr(etRes.data));
    const entries = mapEntriesForTrack(raw as any[], typeNameById) as Entry[];
    return { entries, nextCursor, hasMore, total };
  },

  getEntries: async (id: string, params?: Record<string, unknown>) => {
    const raw = hasExplicitPaging(params)
      ? await apiClient
          .get(`/tracks/${id}/entries`, { params })
          .then(r => {
            const inner = unwrapApiDataEnvelope(r.data);
            return Array.isArray(inner.entries)
              ? (inner.entries as unknown[])
              : toArr(inner);
          })
      : await fetchAllByCursor(`/tracks/${id}/entries`, params);
    await hydrateEntryTagsForList(raw as any[]);
    const etRes = await apiClient.get('/entry-types', {
      params: { track_id: id },
    });
    const typeNameById = buildTypeNameById(toArr(etRes.data));
    return mapEntriesForTrack(raw as any[], typeNameById);
  },
  getCollaborators: async (id: string) => {
    const { data } = await apiClient.get(`/tracks/${id}/collaborators`);
    return (data as { collaborators?: unknown[] })?.collaborators || toArr(data);
  },
  /** Full collaborator response including inheritance metadata. */
  getCollaboratorsDetailed: async (id: string) => {
    const { data } = await apiClient.get(`/tracks/${id}/collaborators`);
    const d = (data ?? {}) as {
      collaborators?: unknown[];
      effective_total?: number;
      inherited_truncated?: boolean;
      visibility_grant?: string | null;
      caller_role?: string | null;
    };
    return {
      collaborators: Array.isArray(d.collaborators) ? d.collaborators : [],
      effective_total: typeof d.effective_total === 'number' ? d.effective_total : 0,
      inherited_truncated: !!d.inherited_truncated,
      visibility_grant: d.visibility_grant ?? null,
      caller_role: d.caller_role ?? null,
    };
  },
  /** Users eligible for ``@``-mention on this track. Scope mirrors the
   *  access cascade — owner + direct + app-inherited collaborators
   *  (minus exclusions), or global user search when ``track.visibility``
   *  is ``"public"``. */
  getMentionCandidates: async (
    trackId: string,
    query?: string,
    limit?: number,
  ): Promise<{
    users: User[];
    visibility_grant: string | null;
    total: number;
  }> => {
    const { data } = await apiClient.get(
      `/tracks/${encodeURIComponent(trackId)}/mention-candidates`,
      { params: { q: query || undefined, limit: limit ?? undefined } },
    );
    const d = (data ?? {}) as {
      users?: unknown[];
      visibility_grant?: string | null;
      total?: number;
    };
    const users = Array.isArray(d.users) ? (d.users as User[]) : [];
    return {
      users,
      visibility_grant: d.visibility_grant ?? null,
      total: typeof d.total === 'number' ? d.total : users.length,
    };
  },
  addCollaborator: (
    trackId: string,
    body: { collaborator_user_id: string; role?: string }
  ) =>
    apiClient.post(`/tracks/${trackId}/collaborators`, {
      collaborator_user_id: body.collaborator_user_id,
      role: body.role || 'editor',
    }),
  removeCollaborator: (trackId: string, userId: string) =>
    apiClient.delete(`/tracks/${trackId}/collaborators/${userId}`),
  /** Update an existing direct collaborator's role. Owner-only.
   *  Accepts ``admin | editor | commenter | viewer`` (owner via transfer flow).
   *  Emits ``track.collaborator_role_update`` ChangeEvent server-side. */
  updateCollaboratorRole: (
    trackId: string,
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) =>
    apiClient.patch(`/tracks/${trackId}/collaborators/${userId}`, { role }),
  addExclusion: (
    trackId: string,
    body: { user_id_to_exclude: string; reason?: string }
  ) =>
    apiClient.post(`/tracks/${trackId}/exclusions`, {
      user_id_to_exclude: body.user_id_to_exclude,
      reason: body.reason,
    }),
  removeExclusion: (trackId: string, userId: string) =>
    apiClient.delete(`/tracks/${trackId}/exclusions/${userId}`),

  transferOwnership: (trackId: string, new_owner_user_id: string) =>
    apiClient
      .post(`/tracks/${trackId}/transfer-ownership`, {
        new_owner_user_id,
      })
      .then(r => r.data as { proposal_id: string; status: string; revision: number }),

  getOperationalModel: (trackId: string) =>
    apiClient
      .get(`/tracks/${trackId}/operational-model`)
      .then(r =>
        unwrapResource<OperationalModelNode>(r.data, 'operational_model')
      ),

  patchOperationalModel: (
    trackId: string,
    body: {
      name?: string;
      description?: string;
      version?: string;
      manifest?: Record<string, unknown>;
      manifest_yaml?: string;
      scope?: string;
    }
  ) =>
    apiClient
      .patch(`/tracks/${trackId}/operational-model`, body)
      .then(r =>
        unwrapResource<OperationalModelNode>(r.data, 'operational_model')
      ),

  mergeLibraryIntoTrack: (trackId: string, library_operational_model_id: string) =>
    apiClient.post(`/tracks/${trackId}/operational-model/merge-library`, {
      library_operational_model_id,
    }),

  getWatchers: (id: string) =>
    apiClient.get(`/tracks/${id}/watchers`).then(r => r.data),
  watch: (id: string) =>
    apiClient.post(`/tracks/${id}/watch`).then(r => r.data),
  unwatch: (id: string) =>
    apiClient.post(`/tracks/${id}/unwatch`).then(r => r.data),
};
