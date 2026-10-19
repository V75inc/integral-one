import apiClient from './client';
import { fetchAllByCursor, hasExplicitPaging } from './pagination';
import { toArr } from './helpers';
import {
  normalizeEntry,
  hydrateEntryTagsForList,
  unwrapApiDataEnvelope,
} from './helpers';
import { getTypeNameMapForTrack } from './entryTypes';
import type { Entry } from '../types';

/** Page size for feed infinite scroll (backend max 100). */
export const FEED_PAGE_LIMIT = 20;

export type FeedEntriesPage = {
  entries: Entry[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
};

function parsePagedPayload(data: unknown): {
  rawItems: unknown[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
} {
  const inner = unwrapApiDataEnvelope(data);
  const d = inner;
  const rawItems = Array.isArray(d.entries)
    ? (d.entries as unknown[])
    : toArr(inner);
  const next =
    typeof d.next_cursor === 'string' && d.next_cursor.length > 0
      ? d.next_cursor
      : null;
  const hasMore = Boolean(d.has_more);
  const total = typeof d.total === 'number' ? d.total : undefined;
  return { rawItems, nextCursor: next, hasMore, total };
}

async function fetchFeedEntriesPageFromPath(
  path: string,
  params: Record<string, unknown>
): Promise<FeedEntriesPage> {
  const { data } = await apiClient.get(path, { params });
  const { rawItems, nextCursor, hasMore, total } = parsePagedPayload(data);
  const entries = await normalizeEntriesWithTypes(rawItems);
  return { entries, nextCursor, hasMore, total };
}

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

async function normalizeEntriesWithTypes(raw: unknown[]): Promise<Entry[]> {
  await hydrateEntryTagsForList(raw as any[]);
  const trackIds = [
    ...new Set(
      raw.map((e: any) => e.track_id).filter(Boolean)
    ),
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

export const feedApi = {
  /**
   * Single page with cursor metadata for infinite scroll.
   * Caller should pass ``limit`` (e.g. FEED_PAGE_LIMIT) and optional ``cursor``.
   */
  getEntriesPage: async (
    params?: Record<string, unknown>
  ): Promise<FeedEntriesPage> => {
    const merged = { limit: FEED_PAGE_LIMIT, ...params };
    try {
      return await fetchFeedEntriesPageFromPath('/feed_entries', merged);
    } catch {
      return await fetchFeedEntriesPageFromPath('/entries', merged);
    }
  },

  getEntries: async (params?: Record<string, unknown>): Promise<Entry[]> => {
    try {
      if (hasExplicitPaging(params)) {
        const data = (await apiClient.get('/feed_entries', { params })).data;
        const inner = unwrapApiDataEnvelope(data);
        const raw = Array.isArray(inner.entries)
          ? (inner.entries as unknown[])
          : toArr(inner);
        return normalizeEntriesWithTypes(raw);
      }
      return normalizeEntriesWithTypes(
        await fetchAllByCursor('/feed_entries', params)
      );
    } catch {
      if (hasExplicitPaging(params)) {
        const data = (await apiClient.get('/entries', { params })).data;
        const inner = unwrapApiDataEnvelope(data);
        const raw = Array.isArray(inner.entries)
          ? (inner.entries as unknown[])
          : toArr(inner);
        return normalizeEntriesWithTypes(raw);
      }
      return normalizeEntriesWithTypes(
        await fetchAllByCursor('/entries', params)
      );
    }
  },
};
