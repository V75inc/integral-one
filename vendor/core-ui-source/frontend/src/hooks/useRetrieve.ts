/**
 * useRetrieve — small wrapper around the Phase 4 ``/api/retrieve`` endpoint.
 *
 * Reads the global ``retrieval.mode`` (graph | semantic | hybrid) from
 * Settings — the inline per-strip Mode dropdown was retired so the
 * choice is made once globally. ``semantic`` is the default and most
 * common path: vector similarity surfaces matches beyond the in-memory
 * list. ``graph`` keeps the in-memory substring filter (no API call).
 *
 * Consumers (FeedFilterStrip + TrackFilterStrip): pass a ``scope`` string
 * (e.g. ``"track:t-1"``, ``"app:a-1"``) and call ``run(query)`` when
 * the user submits in semantic / hybrid mode. Graph mode is intentionally
 * a no-op at the API level — callers fall back to their existing
 * in-memory filter.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  retrieve,
  type RetrievalMode,
  type RetrievalResult,
} from '../api/retrieve';
import { useSettings } from '../features/settings/store';

export type { RetrievalMode, RetrievalResult };

export interface UseRetrieveOptions {
  /** Scope-string passed to /api/retrieve (e.g. ``"track:t-1"``). Optional —
   *  the workspace gate on the backend will scope by header when absent. */
  scope?: string;
}

export interface UseRetrieveResult {
  /** The active mode, read from global Settings. Consumers should treat
   *  this as read-only — changing the mode is done in Settings, not
   *  inline. */
  mode: RetrievalMode;
  results: RetrievalResult[];
  /** True when the backend fell back from semantic/hybrid to graph search. */
  degraded: boolean;
  loading: boolean;
  error: string | null;
  /** Run a retrieval against the current mode + scope. No-op when mode is
   *  ``graph`` (results are cleared so consumers fall back to local filter). */
  run: (query: string) => Promise<void>;
  /** Clear results + error (e.g. when the search input is emptied). */
  reset: () => void;
}

export function useRetrieve({
  scope,
}: UseRetrieveOptions = {}): UseRetrieveResult {
  const [settings] = useSettings();
  const mode = settings.retrieval.mode as RetrievalMode;

  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear results when mode flips to graph — the consumer's in-memory
  // filter takes over and a stale results array would mis-filter the
  // list. Also resets when switching from one retrieval mode to another
  // (semantic ↔ hybrid) so the user doesn't see stale ranker output
  // until they re-submit.
  useEffect(() => {
    setResults([]);
    setDegraded(false);
    setError(null);
  }, [mode]);

  const reset = useCallback(() => {
    setResults([]);
    setDegraded(false);
    setError(null);
  }, []);

  const run = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) {
        reset();
        return;
      }
      if (mode === 'graph') {
        // Graph mode is the in-memory filter path — no API call needed.
        reset();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await retrieve({
          query: trimmed,
          scope,
          mode,
        });
        setResults(res.results);
        setDegraded(Boolean(res.degraded));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Retrieval request failed';
        setError(msg);
        setDegraded(false);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [mode, scope, reset],
  );

  return { mode, results, degraded, loading, error, run, reset };
}
