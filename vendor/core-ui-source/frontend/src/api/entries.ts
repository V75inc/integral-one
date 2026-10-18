import apiClient from './client';
import {
  unwrapResource,
  toArr,
  normalizeEntry,
  ensureEntryTypeId,
  hydrateEntryTagsForList,
  unwrapApiDataEnvelope,
} from './helpers';
import { getTypeNameMapForTrack } from './entryTypes';
import type { Comment, Entry } from '../types';

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

async function normalizeEntriesWithTypes(raw: any[]): Promise<Entry[]> {
  await hydrateEntryTagsForList(raw);
  const trackIds = [
    ...new Set(raw.map((e: any) => e.track_id).filter(Boolean)),
  ] as string[];
  const maps: Record<string, Record<string, string>> = {};
  await Promise.all(
    trackIds.map(async tid => {
      maps[tid] = await getTypeNameMapForTrack(tid);
    })
  );
  const pid = cachedPrincipalId();
  return raw.map((e: any) =>
    normalizeEntry(e, {
      typeNameById: e.track_id ? maps[e.track_id] : undefined,
      principalId: pid,
    })
  );
}

export const entriesApi = {
  list: async (params?: Record<string, unknown>) => {
    const { data } = await apiClient.get('/entries', { params });
    const inner = unwrapApiDataEnvelope(data);
    const raw = Array.isArray(inner.entries)
      ? (inner.entries as unknown[])
      : toArr(inner);
    return normalizeEntriesWithTypes(raw);
  },
  get: async (id: string) => {
    const { data } = await apiClient.get(`/entries/${id}`);
    const entry = unwrapResource<any>(data, 'entry');
    await hydrateEntryTagsForList([entry]);
    let typeNameById: Record<string, string> | undefined;
    if (entry?.track_id) {
      typeNameById = await getTypeNameMapForTrack(entry.track_id);
    }
    return normalizeEntry(entry, {
      typeNameById,
      principalId: cachedPrincipalId(),
    });
  },
  create: async (data: {
    track_id: string;
    type?: string;
    type_id?: string;
    title?: string;
    body?: string;
    description?: string;
    attachment_ids?: string[];
    tags?: string[];
    custom_fields?: Record<string, unknown>;
  }) => {
    const slug = String(data.type || 'post').toLowerCase();
    const type_id = data.type_id || (await ensureEntryTypeId(data.track_id, slug));
    const payload: Record<string, unknown> = {
      track_id: data.track_id,
      type_id,
      title: data.title ?? '',
      body: data.body,
      description: data.description,
      attachment_ids: data.attachment_ids,
      custom_fields: {
        ...(data.custom_fields || {}),
        _entry_type_slug: slug,
      },
    };
    if (data.tags != null) payload.tags = data.tags;
    // B-ENT-09: suppress the global top-bar "Something went wrong" system
    // notification on entry-create failures — the composer surfaces a
    // friendlier inline / toast error from the catch path below.
    const { data: res } = await apiClient.post(
      '/entries',
      payload,
      { __suppressSystemNotify: true } as never,
    );
    return normalizeEntry(unwrapResource(res, 'entry'), {
      principalId: cachedPrincipalId(),
    });
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const payload = { ...data };
    // All UI mutation paths share this client. Resolve a fresh concurrency
    // token when a caller only has a partial Entry so one widget cannot
    // silently bypass the record/schema binding at the API boundary.
    if (
      payload.expected_record_revision === undefined ||
      payload.expected_schema_revision === undefined
    ) {
      const current = await entriesApi.get(id);
      if (payload.expected_record_revision === undefined) {
        payload.expected_record_revision = current.record_revision ?? 1;
      }
      if (payload.expected_schema_revision === undefined) {
        payload.expected_schema_revision = current.schema_revision ?? 1;
      }
    }
    const { data: res } = await apiClient.put(`/entries/${id}`, payload);
    const entry = unwrapResource<any>(res, 'entry');
    await hydrateEntryTagsForList([entry]);
    let typeNameById: Record<string, string> | undefined;
    if (entry?.track_id) {
      typeNameById = await getTypeNameMapForTrack(entry.track_id);
    }
    return normalizeEntry(entry, {
      typeNameById,
      principalId: cachedPrincipalId(),
    });
  },
  delete: (id: string) => apiClient.delete(`/entries/${id}`),
  addReaction: (id: string, emoji: string) =>
    apiClient.post(`/entries/${id}/reactions`, { emoji }).then(r => r.data),
  removeReaction: (id: string, emoji: string) =>
    apiClient.delete(
      `/entries/${id}/reactions/${encodeURIComponent(emoji)}`
    ),
  /**
   * The rows plus `can_moderate`, the backend's answer to "may this caller
   * delete comments they did not write". Read that flag rather than deriving
   * it client-side — the delete gate lives in policy_engine, and a second
   * copy of the rule here would drift.
   *
   * Replaced a bare `getComments` that discarded the envelope; every caller
   * needs the flag, so there is no array-only variant to fall back to.
   */
  getCommentsWithMeta: (id: string) =>
    apiClient.get(`/entries/${id}/comments`).then(r => ({
      comments: toArr(r.data) as Comment[],
      canModerate: Boolean(
        (r.data as { can_moderate?: boolean } | undefined)?.can_moderate
      ),
    })),
  addComment: (id: string, text: string, parent_id?: string) =>
    apiClient
      .post(`/entries/${id}/comments`, { text, parent_id })
      .then(r => unwrapResource<Comment>(r.data, 'comment')),
  getWatchers: (id: string) =>
    apiClient.get(`/entries/${id}/watchers`).then(r => r.data),
  watch: (id: string) =>
    apiClient.post(`/entries/${id}/watch`).then(r => r.data),
  unwatch: (id: string) =>
    apiClient.post(`/entries/${id}/unwatch`).then(r => r.data),
  listRelated: async (
    entryId: string,
    relation: string,
    opts?: { limit?: number; cursor?: string; entryType?: string; entryTypes?: string[] }
  ): Promise<{ entries: Entry[]; nextCursor: string | null; hasMore: boolean }> => {
    const { data } = await apiClient.get(`/entries/${entryId}/related`, {
      params: {
        relation,
        limit: opts?.limit,
        cursor: opts?.cursor,
        entry_type: opts?.entryTypes?.length ? opts.entryTypes : opts?.entryType,
      },
    });
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    return {
      entries: await normalizeEntriesWithTypes(raw),
      nextCursor: typeof data?.next_cursor === 'string' ? data.next_cursor : null,
      hasMore: Boolean(data?.has_more),
    };
  },
  /**
   * Run a bundle ``entry.transform`` hook (e.g. won opportunity → project).
   * ``to_track`` may be omitted when the hook's target track type resolves
   * uniquely in the workspace.
   */
  transform: async (
    id: string,
    body?: { to_track?: string; hook_key?: string; override?: boolean }
  ) => {
    const { data } = await apiClient.post(`/entries/${id}/transform`, body || {});
    return data as { new_entry_id: string; hook_key: string };
  },
};
