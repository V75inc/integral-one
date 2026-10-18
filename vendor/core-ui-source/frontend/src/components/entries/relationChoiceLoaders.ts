/**
 * Shared helpers for entry-relation pickers (Sprint ↔ Task scoping).
 */

import { entriesApi } from '../../api';
import type { Entry, Track } from '../../types';

export function projectIdsFromRelationValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export function sprintLinkedToProject(
  sprint: Pick<Entry, 'custom_fields'>,
  projectId: string
): boolean {
  if (!projectId) return false;
  const ids = projectIdsFromRelationValue(
    (sprint.custom_fields || {}).project
  );
  return ids.includes(projectId);
}

/** Resolve details-track ids for the given project entry ids. */
export async function detailsTrackIdsForProjects(
  projectIds: string[]
): Promise<string[]> {
  const out: string[] = [];
  await Promise.all(
    projectIds.map(async pid => {
      try {
        const entry = await entriesApi.get(pid);
        const rawDetails = (entry.custom_fields || {}).details_track;
        if (Array.isArray(rawDetails)) {
          for (const d of rawDetails) {
            const s = String(d || '').trim();
            if (s) out.push(s);
          }
        } else if (typeof rawDetails === 'string' && rawDetails.trim()) {
          out.push(rawDetails.trim());
        }
      } catch {
        /* skip unreachable projects */
      }
    })
  );
  return Array.from(new Set(out));
}

export function tracksByIds(
  allTracks: Track[],
  trackIds: string[]
): Track[] {
  const want = new Set(trackIds);
  return allTracks.filter(t => want.has(t.id));
}
