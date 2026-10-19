import { useCallback, useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { RelationFieldTarget } from '../../../types';
import { loadRelationTarget, type RawRelationTarget } from './relationTargetLoader';

export interface RelationSpec {
  target?: 'entry' | 'track';
  target_entry_types?: string[];
  target_track_types?: string[];
  target_track_template?: string;
  auto_provision?: boolean;
  allow_cross_track?: boolean;
  many?: boolean;
  inverse_field?: string;
}

export interface UseRelationLabelsResult {
  targets: RelationFieldTarget[];
  loading: boolean;
  error: Error | null;
}

const FIVE_MIN_MS = 5 * 60 * 1000;

/** Normalize a relation value (single id, array, null) to a string[] of ids. */
function normalizeIds(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map(v => (v == null ? '' : String(v)))
      .filter(v => v.length > 0);
  }
  return [String(value)];
}

/** Format an entry's display label, mirroring EntryDetail's resolver. */
function entryLabel(id: string, raw: RawRelationTarget): string {
  const primary =
    String(raw.title || '').trim() ||
    String(raw.body || '').trim().slice(0, 80);
  if (!primary) return `Entry ${id.slice(-6)}`;
  const trackTitle = (raw.track_title || '').trim();
  return trackTitle ? `${primary} (${trackTitle})` : primary;
}

/** Format a track's display label. */
function trackLabel(t: { id: string; title?: string }): string {
  return (t.title || '').trim() || `Track ${t.id.slice(-6)}`;
}

/**
 * Resolve a relation field value (entry ids or track ids) to display
 * targets. Uses React Query so identical ids across mounted hooks share
 * one network fetch via cache key.
 */
export function useRelationLabels(
  value: unknown,
  relation: RelationSpec | undefined,
): UseRelationLabelsResult {
  const ids = useMemo(() => normalizeIds(value), [value]);
  const kind: 'entry' | 'track' =
    String(relation?.target || 'entry') === 'track' ? 'track' : 'entry';

  // useQueries returns a fresh result array on every render. Combine enables
  // structural sharing so unchanged labels remain safe effect dependencies.
  const combine = useCallback(
    (queries: UseQueryResult<RelationFieldTarget, Error>[]): UseRelationLabelsResult => ({
      targets: queries.map((q, i) => q.data ?? {
        id: ids[i],
        label: kind === 'track' ? `Track ${ids[i].slice(-6)}` : `Entry ${ids[i].slice(-6)}`,
        kind,
      }),
      loading: queries.some(q => q.isPending),
      error: queries.find(q => q.error)?.error ?? null,
    }),
    [ids, kind],
  );

  return useQueries({
    queries: ids.map(id => ({
      queryKey: ['relation-target', kind, id] as const,
      queryFn: async (): Promise<RelationFieldTarget> => {
        // Batched: many ids requested in the same tick collapse into one
        // POST /entry-lookup (see relationTargetLoader).
        const raw = await loadRelationTarget(kind, id);
        if (kind === 'track') {
          return {
            id,
            label: trackLabel({ id, title: raw?.title }),
            kind: 'track' as const,
          };
        }
        if (!raw) {
          return { id, label: `Entry ${id.slice(-6)}`, kind: 'entry' as const };
        }
        return {
          id,
          label: entryLabel(id, raw),
          kind: 'entry' as const,
          trackId: raw.track_id,
        };
      },
      staleTime: FIVE_MIN_MS,
      gcTime: Infinity,
      retry: 1,
    })),
    combine,
  });
}
