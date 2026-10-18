import apiClient from './client';
import { toArr, unwrapApiDataEnvelope } from './helpers';

export function hasExplicitPaging(params?: Record<string, unknown>): boolean {
  if (!params) return false;
  return params.cursor != null || params.limit != null;
}

export async function fetchAllByCursor(
  path: string,
  params?: Record<string, unknown>
): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const reqParams = {
      ...(params || {}),
      limit: 100,
      cursor,
    };
    const { data } = await apiClient.get(path, { params: reqParams });
    const inner = unwrapApiDataEnvelope(data);
    const pageItems = Array.isArray(inner.entries)
      ? (inner.entries as unknown[])
      : toArr(inner);
    all.push(...pageItems);
    cursor =
      typeof inner.next_cursor === 'string' && inner.next_cursor.length > 0
        ? inner.next_cursor
        : undefined;
    hasMore = Boolean(inner.has_more && cursor);
    if (!pageItems.length) break;
  }
  return all;
}
