/**
 * useRetrieve — small wrapper around the Phase 4 ``/api/retrieve`` endpoint.
 *
 * Reads the browser's lexical, semantic or hybrid preference. Feed and
 * Track searches use the same scoped retrieval endpoint as agent tools.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  retrieve,
  type RetrievalMode,
  type RetrievalResult,
} from '../api/retrieve';
import { useSettings } from '../features/settings/store';
import { requiresAppQuery } from '../api/readBoundary';

export type { RetrievalMode, RetrievalResult };

export interface UseRetrieveOptions {
  /** Scope-string passed to /api/retrieve (e.g. ``"track:t-1"``). Optional —
   *  the workspace gate on the backend will scope by header when absent. */
  scope?: string;
  /** Invalidate in-flight results when the authenticated workspace changes. */
  authorityKey?: string;
}

export interface UseRetrieveResult {
  /** The active mode, read from global Settings. Consumers should treat
   *  this as read-only — changing the mode is done in Settings, not
   *  inline. */
  mode: RetrievalMode;
  results: RetrievalResult[];
  submittedQuery: string;
  /** True when the backend fell back from semantic/hybrid to graph search. */
  degraded: boolean;
  loading: boolean;
  error: string | null;
  appQueryRequired: boolean;
  /** Run a retrieval against the current mode and scope. */
  run: (query: string) => Promise<void>;
  /** Clear results + error (e.g. when the search input is emptied). */
  reset: () => void;
}

export function useRetrieve({
  scope,
  authorityKey,
}: UseRetrieveOptions = {}): UseRetrieveResult {
  const [settings] = useSettings();
  const mode = settings.retrieval.mode as RetrievalMode;

  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appQueryRequired, setAppQueryRequired] = useState(false);

  const generation = useRef(0);

  // Do not reuse results across modes, scopes, or authenticated workspaces.
  const reset = useCallback(() => {
    generation.current += 1;
    setResults([]);
    setSubmittedQuery('');
    setDegraded(false);
    setError(null);
    setLoading(false);
    setAppQueryRequired(false);
  }, []);

  useEffect(() => {
    reset();
    return () => { generation.current += 1; };
  }, [mode, scope, authorityKey, reset]);

  const run = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) {
        reset();
        return;
      }
      const request = ++generation.current;
      setResults([]);
      setSubmittedQuery(trimmed);
      setLoading(true);
      setError(null);
      setDegraded(false);
      setAppQueryRequired(false);
      try {
        const res = await retrieve({
          query: trimmed,
          scope,
          mode,
        });
        if (request !== generation.current) return;
        setResults(res.results);
        setDegraded(Boolean(res.degraded));
        setAppQueryRequired(requiresAppQuery(res));
      } catch (err) {
        if (request !== generation.current) return;
        const msg =
          err instanceof Error ? err.message : 'Retrieval request failed';
        setError(msg);
        setDegraded(false);
        setResults([]);
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [mode, scope, authorityKey, reset],
  );

  return { mode, results, submittedQuery, degraded, loading, error, appQueryRequired, run, reset };
}
