/**
 * ScopeContext — active Workspace.
 *
 * Server-authoritative scope: the canonical "which workspace am I in?"
 * answer lives on the User node as ``active_workspace_id`` and is
 * fetched at session boot via ``GET /users/me/scope``. localStorage is
 * a render-time cache only — it lets the very first paint pick the
 * right workspace before the server round-trip finishes, but the
 * server's answer always wins on conflict.
 *
 * Why server-authoritative:
 *  - DB purge / re-seed → stale localStorage doesn't strand users on
 *    a deleted workspace; the server returns the new default.
 *  - Membership revocation → user can no longer pick a workspace they
 *    were kicked from; backend validates on every list endpoint.
 *  - Multi-device → same workspace shown across browsers / tabs.
 *  - Private mode / cleared browser → still resumes on the same
 *    workspace.
 *
 * Header injection: ``X-Integral-Scope: ws:<workspace_id>`` set on
 * every outbound axios request + on the native provider chat fetch path. The
 * backend treats this as a HINT and validates against live membership
 * (``services/request_scope.py``); the resolved id is persisted back
 * to ``User.active_workspace_id`` so the chain converges.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workspacesApi, type Workspace } from '../api/workspaces';
import { usersApi, type MyScope } from '../api/users';
import { setActiveScopeHeader } from '../api/client';
import { removeUnscopedCachesOnWorkspaceSwitch } from '../queryKeys';
import { useAuth } from './AuthContext';

export interface Scope {
  workspaceId: string;
}

interface ScopeContextValue {
  scope: Scope | null;
  workspaces: Workspace[];
  workspacesLoading: boolean;
  setScope: (next: Scope) => void;
  activeWorkspace: Workspace | null;
  /** Convenience: did the active workspace resolve to a Personal one? */
  isPersonal: boolean;
}

const STORAGE_KEY = 'integral.scope';

const ScopeCtx = createContext<ScopeContextValue | null>(null);

function readStoredScope(): Scope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.workspaceId === 'string' && parsed.workspaceId) {
      return { workspaceId: parsed.workspaceId };
    }
    // Legacy shapes — forward-migrate transparently.
    if (parsed?.kind === 'org' && typeof parsed.id === 'string') {
      return { workspaceId: parsed.id };
    }
    // 'personal' had no id; can't migrate without the workspaces query —
    // signal "no stored scope" and let the provider pick the default.
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function writeStoredScope(scope: Scope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } catch {
    /* ignore quota errors */
  }
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );

  // localStorage seed is only for the very first paint. Once the
  // ``/me/scope`` query resolves, the server's answer overwrites this
  // — see the syncing effect below.
  const [scope, setScopeState] = useState<Scope | null>(() => readStoredScope());

  // Reset the in-memory scope whenever the signed-in user changes
  // (logout → login as different user, or session swap in the same
  // tab). ``clearTokens()`` wipes ``integral.scope`` from localStorage
  // on logout, but the React state survives that wipe and would
  // otherwise leak the previous user's workspace into the workspace
  // switcher until ``/me/scope`` round-trips. Resetting on user-id
  // change closes that window — the switcher renders neutral until
  // the server-authoritative scope lands.
  const lastUserIdRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (lastUserIdRef.current === currentId) return;
    lastUserIdRef.current = currentId;
    setScopeState(currentId ? readStoredScope() : null);
  }, [user?.id]);

  // Server-authoritative scope. The backend stores the user's active
  // workspace on ``User.active_workspace_id`` and validates it against
  // live membership on every read. We hydrate from it at boot so a
  // stale localStorage entry can't strand the user on a deleted /
  // revoked workspace after a DB purge or admin action.
  const scopeQuery = useQuery({
    queryKey: ['me', 'scope'],
    queryFn: () => usersApi.getMyScope(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  // Once the server answers, reconcile. The server's id wins on
  // conflict; we only keep the localStorage value when the server
  // hasn't answered yet (initial paint) or hasn't picked a default.
  useEffect(() => {
    if (!scopeQuery.isSuccess) return;
    const serverId = scopeQuery.data?.active_workspace_id || null;
    if (!serverId) return;
    if (scope?.workspaceId === serverId) return;
    const next: Scope = { workspaceId: serverId };
    setScopeState(next);
    writeStoredScope(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeQuery.isSuccess, scopeQuery.data]);

  // Pure-client fallback for the unlikely case that ``/me/scope``
  // returns no active id AND there's no stored scope. Picks a sensible
  // default (Personal first) and writes it back to the server so the
  // server keeps converging to the canonical state.
  useEffect(() => {
    if (!workspacesQuery.isSuccess || !scopeQuery.isSuccess) return;
    const list = workspacesQuery.data ?? [];
    if (list.length === 0) return;
    const validIds = new Set(list.map(w => w.id));
    if (scope && validIds.has(scope.workspaceId)) return;
    if (scopeQuery.data?.active_workspace_id) return; // server already answered
    const personal = list.find(w => w.kind === 'personal');
    const next: Scope = { workspaceId: (personal ?? list[0]).id };
    setScopeState(next);
    writeStoredScope(next);
    // Best-effort server write — ignore failure so a network hiccup
    // doesn't break the boot path.
    usersApi.setMyScope(next.workspaceId).catch(() => {
      /* server will heal on next list request via request_scope */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacesQuery.isSuccess, scopeQuery.isSuccess]);

  const setScope = useCallback(
    (next: Scope) => {
      setActiveScopeHeader(`ws:${next.workspaceId}`);
      setScopeState(next);
      writeStoredScope(next);
      // Persist to the server. We don't await — the local cache flip
      // gives instant UX, and the server-side ``request_scope``
      // resolver will accept the next list call's header even if the
      // explicit ``PUT /users/me/scope`` hasn't landed yet.
      usersApi.setMyScope(next.workspaceId).catch(() => {
        /* best-effort: server will heal on next list call */
      });
      // Write the new scope directly into the cache instead of invalidating.
      // Invalidating triggers an immediate GET /users/me/scope refetch that
      // races with the PUT — if the GET lands first the server still returns
      // the old workspace, the sync effect sees a mismatch, and scope reverts,
      // undoing the switch the user just made. A direct cache write propagates
      // to all consumers instantly with no network round-trip and no race.
      qc.setQueryData(['me', 'scope'], (old: MyScope | undefined) =>
        old ? { ...old, active_workspace_id: next.workspaceId } : old,
      );
    },
    [qc],
  );

  // Publish header value on every scope change so axios + chat fetch
  // forward ``X-Integral-Scope: ws:<id>`` to the backend.
  // Publish before child passive effects start their new-workspace requests.
  // https://react.dev/reference/react/useLayoutEffect
  useLayoutEffect(() => {
    if (!scope) {
      setActiveScopeHeader(null);
      return;
    }
    setActiveScopeHeader(`ws:${scope.workspaceId}`);
  }, [scope]);

  // On workspace switch, invalidate every cache that the backend
  // filters by ``X-Integral-Scope``. Without this, react-query
  // re-serves the previous workspace's payload on the next consumer
  // mount — sidebar tracks/apps, feed entries, command palette,
  // and per-workspace ai-chat thread lists all silently keep stale
  // results until something else triggers a refetch. Skip the very
  // first run so the initial mount (no previous workspace) doesn't
  // blow the freshly-populated caches.
  const previousWorkspaceIdRef = useRef<string | null>(
    scope?.workspaceId ?? null
  );
  useEffect(() => {
    const wid = scope?.workspaceId ?? null;
    const prevWid = previousWorkspaceIdRef.current;
    if (prevWid === wid) return;
    const isFirstRun = prevWid === null && wid !== null;
    previousWorkspaceIdRef.current = wid;
    if (isFirstRun) return;
    // I-PERF: was invalidating 6 broad prefixes on every workspace switch,
    // which fires a refetch storm against the backend for the NEW scope.
    // Instead, REMOVE caches for the PREVIOUS workspace so stale data can't
    // leak, and let the new scope's queries refetch lazily on demand.
    //
    // Partitioned by workspace id in the query key (removed when key
    // includes prevWid). Unscoped leftovers — views / tags / notifications /
    // tracks lists without a workspace segment — are wiped via
    // ``removeUnscopedCachesOnWorkspaceSwitch``.
    const scopedPrefixes = [
      'tracks',
      'apps',
      'feed',
      'entries',
      'entryTypes',
      'skills',
      'connectors',
    ] as const;
    if (prevWid) {
      for (const prefix of scopedPrefixes) {
        qc.removeQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === prefix &&
            q.queryKey.includes(prevWid),
        });
      }
      qc.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'chat' &&
          q.queryKey[1] === 'threads' &&
          q.queryKey.includes(prevWid),
      });
      removeUnscopedCachesOnWorkspaceSwitch(qc);
    } else {
      // Defensive fallback: prior wid unknown — drop scoped prefixes wholesale
      // so we never serve a previous-workspace payload after a manual switch.
      for (const prefix of scopedPrefixes) {
        qc.removeQueries({ queryKey: [prefix] });
      }
      qc.removeQueries({ queryKey: ['chat', 'threads'] });
      removeUnscopedCachesOnWorkspaceSwitch(qc);
    }
  }, [scope?.workspaceId, qc]);

  const activeWorkspace = useMemo<Workspace | null>(() => {
    if (!scope) return null;
    return workspaces.find(w => w.id === scope.workspaceId) ?? null;
  }, [scope, workspaces]);

  // Brand and neutral highlight tokens represent the active workspace
  // throughout the UI. Set them at the document root so feed markers,
  // cards, controls, and other shared surfaces all follow workspace color.
  useEffect(() => {
    const root = document.documentElement;
    const raw = activeWorkspace?.accent_color?.trim() || '';
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
      for (const name of [
        '--brand-accent', '--brand-accent-fg', '--brand-accent-contrast',
        '--brand-accent-soft', '--brand-accent-line', '--focus-ring-color',
      ]) root.style.removeProperty(name);
      return;
    }
    const digits = match[1].length === 3
      ? match[1].split('').map(char => `${char}${char}`).join('')
      : match[1];
    const hex = `#${digits}`;
    const red = parseInt(digits.slice(0, 2), 16);
    const green = parseInt(digits.slice(2, 4), 16);
    const blue = parseInt(digits.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    const channels = `${red}, ${green}, ${blue}`;
    root.style.setProperty('--brand-accent', hex);
    root.style.setProperty('--brand-accent-fg', luminance >= 150 ? '#1a1a1a' : '#ffffff');
    root.style.setProperty('--brand-accent-contrast', luminance >= 150 ? '#1a1a1a' : '#ffffff');
    root.style.setProperty('--brand-accent-soft', `rgba(${channels}, 0.10)`);
    root.style.setProperty('--brand-accent-line', `rgba(${channels}, 0.28)`);
    root.style.setProperty('--focus-ring-color', `rgba(${channels}, 0.35)`);
  }, [activeWorkspace?.accent_color]);

  const value = useMemo<ScopeContextValue>(
    () => ({
      scope,
      workspaces,
      workspacesLoading: workspacesQuery.isLoading,
      setScope,
      activeWorkspace,
      isPersonal: activeWorkspace?.kind === 'personal',
    }),
    [scope, workspaces, workspacesQuery.isLoading, setScope, activeWorkspace]
  );

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error('useScope must be used within ScopeProvider');
  return ctx;
}

export function useScopeOptional(): ScopeContextValue | null {
  return useContext(ScopeCtx);
}

/** Filter helper for any list of resources carrying ``workspace_id``.
 *  Falls back to the parent App's workspace_id (single-parent rule).
 */
export function workspaceIdOf(item: {
  workspace_id?: string | null;
  space?: { workspace_id?: string | null };
}): string | null {
  return (
    item.workspace_id || item.space?.workspace_id || null
  );
}

export function filterByScope<
  T extends {
    workspace_id?: string | null;
    space?: { workspace_id?: string | null };
  },
>(items: T[], scope: Scope | null): T[] {
  if (!scope) return items;
  return items.filter(it => workspaceIdOf(it) === scope.workspaceId);
}
