import type { RelationFieldTarget } from '../../../types';

/** Optional parent context when drilling from one entry into a related one. */
export type RelationNavContext = {
  fromEntryId?: string;
  fromTrackId?: string;
  fromTitle?: string;
};

/**
 * Return the in-app route for a resolved relation target, or null when the
 * target lacks enough info to navigate (e.g. an entry id without a parent
 * track id). Callers render a plain span in that case.
 *
 * When ``ctx`` carries a from-entry, query params preserve breadcrumb parent
 * context (Project → Contact, etc.).
 */
export function routeForRelationTarget(
  target: RelationFieldTarget,
  ctx?: RelationNavContext | null
): string | null {
  if (target.kind === 'track') {
    return target.id ? `/tracks/${target.id}` : null;
  }
  if (target.kind === 'entry' && target.trackId) {
    const params = new URLSearchParams();
    params.set('entry', target.id);
    if (ctx?.fromEntryId && ctx?.fromTrackId) {
      params.set('from_entry', ctx.fromEntryId);
      params.set('from_track', ctx.fromTrackId);
      if (ctx.fromTitle) params.set('from_title', ctx.fromTitle);
    }
    return `/tracks/${target.trackId}?${params.toString()}`;
  }
  return null;
}
