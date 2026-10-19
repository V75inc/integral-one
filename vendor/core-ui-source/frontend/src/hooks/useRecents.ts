/**
 * useRecents — per-scope recently-visited Tracks and Apps.
 *
 * Stored in localStorage under ``integral.recents.{user_id}.{scope_key}``
 * as `{ tracks: [id…], apps: [id…] }`. Append-to-front, dedupe, capped
 * at MAX_PER_KIND. Cleared if the storage key is missing (no migration).
 *
 * v1 is client-only — see plan N5. v2 should server-back this so recents
 * follow the user across devices.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useScope, type Scope } from '../context/ScopeContext';

interface RecentsBucket {
  tracks: string[];
  apps: string[];
}

const EMPTY: RecentsBucket = { tracks: [], apps: [] };
const MAX_PER_KIND = 8;

function scopeKey(scope: Scope): string {
  return `ws:${scope.workspaceId}`;
}

function storageKey(userId: string, scope: Scope): string {
  return `integral.recents.${userId}.${scopeKey(scope)}`;
}

function readRecents(key: string): RecentsBucket {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    const tracks = Array.isArray(parsed?.tracks)
      ? parsed.tracks.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    const apps = Array.isArray(parsed?.apps)
      ? parsed.apps.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    return { tracks, apps };
  } catch {
    return { ...EMPTY };
  }
}

function writeRecents(key: string, value: RecentsBucket): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota errors ignored — recents are non-critical */
  }
}

export function useRecents() {
  const { user } = useAuth();
  const { scope } = useScope();
  const userId = user?.id ?? '';
  const key = userId && scope ? storageKey(userId, scope) : null;

  const [bucket, setBucket] = useState<RecentsBucket>(() =>
    key ? readRecents(key) : { ...EMPTY }
  );

  // Re-read when scope or user changes (different storage key).
  useEffect(() => {
    if (!key) {
      setBucket({ ...EMPTY });
      return;
    }
    setBucket(readRecents(key));
  }, [key]);

  const visit = useCallback(
    (kind: 'track' | 'app', id: string) => {
      if (!key || !id) return;
      setBucket(prev => {
        const list = kind === 'track' ? prev.tracks : prev.apps;
        const next = [id, ...list.filter(x => x !== id)].slice(0, MAX_PER_KIND);
        const updated: RecentsBucket =
          kind === 'track'
            ? { tracks: next, apps: prev.apps }
            : { tracks: prev.tracks, apps: next };
        writeRecents(key, updated);
        return updated;
      });
    },
    [key]
  );

  return { recents: bucket, visit };
}
