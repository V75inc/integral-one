import type { TrackEntriesPage } from '../../../api/tracks';
import type { Entry } from '../../../types';

/** Flatten infinite-query pages and drop duplicate entry ids. */
export function mergeDedupedTrackEntryPages(pages: TrackEntriesPage[]): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const p of pages) {
    for (const e of p.entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}
