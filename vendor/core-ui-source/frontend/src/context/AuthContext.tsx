import { useLocation } from 'react-router-dom';
import { isPublicAuthPath } from '../api/sessionRoutes';
import { getHostSession } from '../host/session';
import '../hooks/useDeployment';
import { loadSessionPolicy } from '../api/sessionPolicy';
import { isHostManagedSession } from '../api/sessionRuntime';
import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { SessionRenewalDialog } from '../components/system/SessionRenewalDialog';
import { enableSessionRecovery, finishSessionRecovery, getSessionRecovery, isSessionPaused, subscribeSessionRecovery } from '../api/sessionRecovery';
import { useQueryClient } from '@tanstack/react-query';
import { resetThreadSessions } from '../features/ai-chat/threadSessionStore';
import { authApi } from '../api';
import {
  clearTokens,
  getAccessToken,
  getSessionGeneration,
  installActivityListeners,
  redirectToLogin,
  refreshAccessToken,
  scheduleProactiveRefresh,
  setTokens,
} from '../api/session';
import { userTimezoneApi } from '../api/userTimezone';
import { browserTimezone } from '../utils/userTimezone';
import type { User } from '../types';

interface AuthCtx {
  user: User | null; token: string | null; loading: boolean;
  login(email: string, password: string): Promise<void>;
  signup(
    email: string,
    password: string,
    display_name: string,
    workspaceName?: string
  ): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileVerified, setProfileVerified] = useState(false);
  const [uiSessionEpoch, setUiSessionEpoch] = useState(0);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const publicPage = isPublicAuthPath(pathname);
  const recovery = useSyncExternalStore(subscribeSessionRecovery, getSessionRecovery);

  // Only a verified private-page session can retain the workspace behind an
  // inactivity lock. Cached profiles and public routes never enable recovery.
  useLayoutEffect(() => {
    enableSessionRecovery(profileVerified && !publicPage && !isHostManagedSession() ? user?.id ?? null : null);
    if (profileVerified && !publicPage) scheduleProactiveRefresh();
    return () => { enableSessionRecovery(null); };
  }, [user?.id, profileVerified, publicPage]);

  useEffect(() => {
    let active = true;
    installActivityListeners();

    const onLogout = () => {
      setUiSessionEpoch(epoch => epoch + 1);
      enableSessionRecovery(null);
      setToken(null);
      setUser(null);
      setProfileVerified(false);
      // 401 interceptor path — wipe every cached query so the next
      // signed-in user doesn't inherit the previous user's
      // workspaces / scope / notifications / etc.
      queryClient.clear();
      resetThreadSessions();
    };
    window.addEventListener('integral:logout', onLogout);
    const onTokensUpdated = () => {
      const current = getAccessToken();
      setToken(current);
      // Also completes cold-start hydration after a temporarily unavailable host recovers.
      if (current && isHostManagedSession()) {
        const generation = getSessionGeneration();
        void authApi.me().then(u => {
          if (!active || generation !== getSessionGeneration()) return;
          setUser(u);
          setProfileVerified(true);
          localStorage.setItem('t75_user', JSON.stringify(u));
        }).catch(() => { /* The host lifecycle owns reconnection and recovery. */ });
      }
    };
    window.addEventListener('integral:tokens-updated', onTokensUpdated);
    // An explicit sign-out/account change in another tab must also retire
    // this tab's retained page and invalidate pending renewal responses.
    const onStorage = (event: StorageEvent) => {
      if (event.key === 't75_token' || event.key === 't75_token_expires_at') {
        onTokensUpdated();
        scheduleProactiveRefresh();
        return;
      }
      if (event.key !== 't75_user') return;
      if (!event.newValue) {
        clearTokens();
        onLogout();
      } else if (event.oldValue) {
        try {
          if (JSON.parse(event.oldValue).id !== JSON.parse(event.newValue).id) {
            onLogout();
            window.location.reload();
          }
        } catch { /* Corrupt storage is handled by normal auth hydration. */ }
      }
    };
    window.addEventListener('storage', onStorage);

    let cleanupHydration = () => {};
    const begin = async () => {
      await loadSessionPolicy();
      if (!active) return;
      const hostSession = getHostSession();
      if (hostSession && isHostManagedSession()) {
        try {
          await refreshAccessToken();
          if (!active) return;
        } catch {
          if (active) setLoading(false);
          return;
        }
      }
      const t = getAccessToken();
      if (!t || !active) { setLoading(false); return; }
      setToken(t);
      const cached = localStorage.getItem('t75_user');
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch {
          // Corrupt cached user JSON — fall through to the network fetch below.
        }
      }
      // Kick off the proactive-refresh timer using whatever TTL was
      // captured at issuance (session.ts persists it to localStorage).
      scheduleProactiveRefresh();
      // Only an authoritative rejection (401/403) means the session is gone.
      // Anything else — offline, a 5xx, a dropped connection — used to log the
      // user out too, which threw a signed-in user to /login every time the
      // backend hiccupped. Keep the cached user and retry once we are back
      // online or on the next interaction.
      let retryArmed = false;
      const retryEvents = ['online', 'focus', 'pointerdown', 'keydown'] as const;
      let retry: () => void = () => {};
      const disarmRetry = () => {
        if (!retryArmed) return;
        retryArmed = false;
        for (const ev of retryEvents) window.removeEventListener(ev, retry);
      };
      const armRetry = () => {
        if (retryArmed) return;
        retryArmed = true;
        for (const ev of retryEvents) window.addEventListener(ev, retry);
      };
      const hydrate = () => {
        const generation = getSessionGeneration();
        return authApi.me()
          .then(u => {
            if (!active || generation !== getSessionGeneration() || isSessionPaused() || !getAccessToken()) return;
            disarmRetry();
            setUser(u);
            setProfileVerified(true);
            localStorage.setItem('t75_user', JSON.stringify(u));
          })
          .catch((err: unknown) => {
            if (!active || generation !== getSessionGeneration() || isSessionPaused()) return;
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 401) {
              if (isHostManagedSession()) { armRetry(); return; }
              disarmRetry();
              // Soft-land on login — do not leave a half-auth shell that
              // flashes "Something went wrong" over a dead session.
              // 403 is permission, not expiry — leave that to the caller.
              redirectToLogin();
              setToken(null);
              setUser(null);
              setProfileVerified(false);
              return;
            }
            if (!getAccessToken()) {
              // The interceptor already tore the session down (refresh 4xx).
              disarmRetry();
              return;
            }
            armRetry();
          })
          .finally(() => { if (active) setLoading(false); });
      };
      retry = () => {
        disarmRetry();
        void hydrate();
      };
      void hydrate();

      cleanupHydration = disarmRetry;
    };
    void begin();
    return () => {
      active = false;
      window.removeEventListener('integral:logout', onLogout);
      window.removeEventListener('integral:tokens-updated', onTokensUpdated);
      window.removeEventListener('storage', onStorage);
      cleanupHydration();
    };
    // queryClient from useQueryClient is a stable reference — empty
    // dep array is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infer only after the authoritative profile arrives. The server's conditional
  // write preserves manual choices and another device's earlier inference.
  useEffect(() => {
    if (loading || !profileVerified || !user || user.timezone) return;
    let active = true;
    const accountId = user.id;
    void userTimezoneApi.set(browserTimezone(), true).then(result => {
      if (!active) return;
      setUser(current => {
        if (!current || current.id !== accountId) return current;
        const updated = { ...current, timezone: result.timezone };
        localStorage.setItem('t75_user', JSON.stringify(updated));
        return updated;
      });
    }).catch(() => {
      // Detection is optional; settings offers an explicit retry/save.
    });
    return () => { active = false; };
  }, [loading, profileVerified, user?.id, user?.timezone]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokens(res);
    setToken(res.access_token);
    const u = await authApi.me();
    setProfileVerified(true);
    setUser(u); localStorage.setItem('t75_user', JSON.stringify(u));
  }, []);

  const signup = useCallback(
    async (
      email: string,
      password: string,
      display_name: string,
      workspaceName?: string
    ) => {
      const res = await authApi.signup(
        email,
        password,
        display_name,
        workspaceName
      );
      if (!res.access_token) throw new Error('Signup did not return a token');
      setTokens(res);
      setToken(res.access_token);
      const u = await authApi.me();
      setProfileVerified(true);
      setUser(u);
      localStorage.setItem('t75_user', JSON.stringify(u));
    },
    []
  );

  const logout = useCallback(async () => {
    // Retire local authority immediately, including while the idle lock is open.
    // Revocation uses the captured token so a late response cannot affect a new login.
    const accessToken = localStorage.getItem('t75_token');
    setUiSessionEpoch(epoch => epoch + 1);
    clearTokens();
    enableSessionRecovery(null);
    setToken(null);
    setUser(null);
    setProfileVerified(false);
    queryClient.clear();
    resetThreadSessions();
    await Promise.allSettled([
      Promise.resolve().then(() => getHostSession()?.signOut?.()),
      Promise.resolve().then(() => accessToken ? authApi.logout(accessToken) : undefined),
    ]);
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const u = await authApi.me();
    setProfileVerified(true);
    setUser(u); localStorage.setItem('t75_user', JSON.stringify(u));
  }, []);

  // Memoized because this is the root-most context in the app: every render of
  // AuthProvider used to mint a fresh object literal, which invalidates all 36
  // useAuth() consumers even when nothing about the session changed.
  //
  // The knock-on effect was worse than the re-renders. AgentiveContext derives
  // its `refresh` callback from `user`, and its polling effect depends on that
  // callback — so a new context value tore down and re-established the
  // /agentive/status interval, firing an extra request off-cadence each time.
  //
  // Safe to memoize: login/signup/logout/refreshUser are all useCallback-stable,
  // so the identity only changes when the session state genuinely does.
  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout, refreshUser }),
    [user, token, loading, login, signup, logout, refreshUser],
  );

  return <Ctx.Provider value={value}>
    {/* Session-owned providers and portals must not outlive their principal.
        Keep this key stable across token renewal and profile edits. */}
    <React.Fragment key={`${uiSessionEpoch}:${user?.id ?? 'signed-out'}`}>{children}</React.Fragment>
    {!isHostManagedSession() && !publicPage && profileVerified && recovery && user && <SessionRenewalDialog mode={recovery} user={user}
      onSignOut={() => { void logout(); }}
      onResume={(tokens, verifiedUser) => {
        setTokens(tokens);
        setToken(tokens.access_token);
        setUser(verifiedUser);
        setProfileVerified(true);
        localStorage.setItem('t75_user', JSON.stringify(verifiedUser));
        finishSessionRecovery();
        scheduleProactiveRefresh();
        // Re-read server state; never resume/replay a failed mutation or chat turn.
        void queryClient.invalidateQueries();
      }} />}
  </Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

/** Same as ``useAuth`` but returns ``null`` when no provider is present. Use
 *  this for components that may render in isolation (e.g. Vitest unit tests)
 *  but still want to personalize when an AuthProvider is mounted. */
export function useAuthOptional(): AuthCtx | null {
  return useContext(Ctx);
}

// Silence unused-import linter when refreshAccessToken is referenced
// indirectly via the axios interceptor — keep it imported so the
// module loads alongside AuthContext (ensures session.ts initializes
// before any other consumer touches it).
void refreshAccessToken;
