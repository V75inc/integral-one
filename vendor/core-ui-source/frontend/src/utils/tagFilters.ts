/** Repeated tag URL parameters preserve single-tag deep links and other filters. */
export function selectedTagIds(params: URLSearchParams): string[] {
  return [...new Set(params.getAll('tag').map(id => id.trim()).filter(Boolean))];
}

export function withTagFilters(params: URLSearchParams, ids: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('tag');
  [...new Set(ids)].filter(Boolean).forEach(id => next.append('tag', id));
  return next;
}

export function toggleTagFilter(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}

export function tagFilterHref(pathname: string, search: string, id: string): string {
  const params = pathname === '/feed' ? new URLSearchParams(search) : new URLSearchParams();
  const next = withTagFilters(params, toggleTagFilter(selectedTagIds(params), id));
  return `/feed${next.size ? `?${next}` : ''}`;
}
