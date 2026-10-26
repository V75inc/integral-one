/**
 * Session lifecycle: token storage, sliding refresh, activity tracking.
 *
 * Lives outside React because the axios interceptor calls into it from
 * non-component code and would deadlock against React state. The
 * AuthContext subscribes to recovery state for in-place renewal and to
 * `integral:logout` for explicit sign-out.
 *
 * Behavior summary:
 *   - Deployment metadata supplies idle, activity and renewal timing.
 *   - Proactive refresh runs only with recent human activity, bounded by
 *     the issued access TTL; optional idle lock pauses earlier.
 *   - Recently active pages attempt silent renewal at expiry. A
 *     rejected refresh requires credentials; temporary outages retry while
 *     the access token remains valid, then return to sign-in.
 *   - 401 reactive retry: a single retry per request, gated on a
 *     `__sessionRetried` flag on the axios config.
 *
 * Activity counts as: mousedown, keydown, touchstart, scroll, wheel,
 * and click. Tab visibility checks deadlines without recording activity. Raw `mousemove` is excluded so
 * pointer drift / cats on keyboards do not keep sessions alive.
 */

import axios, { AxiosError } from 'axios';
import { getApiBaseURL } from '../config';
import { enableSessionRecovery, isSessionPaused, requestSessionRecovery } from './sessionRecovery';
import { getSessionPolicy } from './sessionPolicy';
import { isPublicAuthPath } from './sessionRoutes';
import { getHostSession } from '../host/session';
import { isHostManagedSession } from './sessionRuntime';
import { setSessionConnection } from './sessionConnection';
import { normalizeUserMe } from './helpers';

const ACCESS_TOKEN_KEY = 't75_token';
const REFRESH_TOKEN_KEY = 't75_refresh_token';
const USER_KEY = 't75_user';
const ACCESS_EXPIRES_AT_KEY = 't75_token_expires_at';
const ACCESS_TTL_MS_KEY = 't75_token_ttl_ms';
const LAST_ACTIVITY_KEY = 't75_last_activity_at';
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * User-scoped localStorage keys that must be wiped on logout / 401 so
 * the next signed-in user never inherits the previous user's state.
 *
 * Excludes device-level prefs (theme) — those persist across users on
 * the same browser by design.
 *
 * Add to this list whenever a new module persists user-bound state
 * under its own key (workspace scope, settings, preferences, etc.).
 */
const USER_SCOPED_KEYS = [
  LAST_ACTIVITY_KEY,
  'integral.scope', // ScopeContext — active workspace id
  'integral.settings.v1', // features/settings/store.ts — user prefs
];

/** Activity stamps are throttled to one write per this many ms. */
const ACTIVITY_THROTTLE_MS = 5_000;
/** Fallback access TTL when issuance metadata is unavailable. */
const DEFAULT_ACCESS_TTL_MS = 60 * 60 * 1000;
class LocalSessionIdentityError extends Error {}

export interface TokenPayload {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string | null;
  refresh_expires_in?: number | null;
}

function storedActivityAt(): number {
  if (typeof localStorage === 'undefined') return 0;
  const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 && value <= Date.now() ? value : 0;
}
let lastActivityAt = storedActivityAt() || Date.now();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let inflightRefresh: Promise<string | null> | null = null;
let sessionGeneration = 0;
let hostSessionEnabled = true;
let hostRetryTimer: ReturnType<typeof setTimeout> | null = null;
let hostRetryAt = 0;
let hostFailures = 0;

export const getSessionGeneration = (): number => sessionGeneration;
/** Most recent access-token TTL in ms, captured at issuance. */
let currentAccessTtlMs = DEFAULT_ACCESS_TTL_MS;

// ────────────────────────────────────────────────────────────────────
// Token storage
// ────────────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (isSessionPaused()) return null;
  if (isHostManagedSession() && Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY)) <= Date.now()) return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(payload: TokenPayload, { preserveActivity = false } = {}): void {
  if (!payload.access_token) return;
  if (!preserveActivity) {
    hostSessionEnabled = true;
    sessionGeneration += 1;
    lastActivityAt = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityAt));
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, payload.access_token);
  if (payload.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token);
  } else if (!preserveActivity) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  if (typeof payload.expires_in === 'number' && payload.expires_in > 0) {
    currentAccessTtlMs = payload.expires_in * 1000;
    const expiresAt = Date.now() + currentAccessTtlMs;
    localStorage.setItem(ACCESS_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    currentAccessTtlMs = getSessionPolicy().access_token_ttl_seconds * 1000;
    localStorage.setItem(ACCESS_EXPIRES_AT_KEY, String(Date.now() + currentAccessTtlMs));
  }
  localStorage.setItem(ACCESS_TTL_MS_KEY, String(currentAccessTtlMs));
  scheduleProactiveRefresh();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("integral:tokens-updated"));
}

/**
 * Wipe every localStorage key that belongs to the current signed-in
 * user — tokens, cached User, and any module-owned user-scoped state
 * (workspace scope, settings, etc. — see ``USER_SCOPED_KEYS``).
 *
 * Called on explicit logout AND on 401 refresh failure. The next
 * sign-in must start from a clean per-user slate; otherwise the new
 * user inherits the previous user's active workspace, preferences,
 * etc. (the workspace-switcher-shows-old-workspace bug).
 *
 * Device-level prefs (theme) are deliberately preserved.
 */
export function clearTokens(): void {
  sessionGeneration += 1;
  hostSessionEnabled = false;
  hostRetryAt = hostFailures = 0;
  setSessionConnection(null);
  enableSessionRecovery(null);
  lastActivityAt = Date.now();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
  localStorage.removeItem(ACCESS_TTL_MS_KEY);
  for (const key of USER_SCOPED_KEYS) {
    localStorage.removeItem(key);
  }
  cancelScheduledRefresh();
}

/** True while a refresh token exchange is in flight (single-flight). */
export function isRefreshInFlight(): boolean {
  return inflightRefresh !== null;
}

/** End the expired/rejected session; recovery is reserved for valid idle sessions. */
export function redirectToLogin(reason: 'session_expired' = 'session_expired'): void {
  if (isHostManagedSession()) {
    // A runtime/authorization failure never signs the local owner out.
    if (hostSessionEnabled) setSessionConnection('recovery');
    return;
  }
  clearTokens();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('integral:logout'));
  if (isPublicAuthPath(window.location.pathname)) return;
  const params = new URLSearchParams({ reason });
  window.location.href = `/login?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────────────
// Activity tracking
// ────────────────────────────────────────────────────────────────────

export function markActivity(): void {
  // Check first: a wake-up click must not erase an elapsed idle deadline.
  checkSessionDeadline();
  if (isHostManagedSession()) return;
  if (isSessionPaused() || !getAccessToken() || isPublicAuthPath(window.location.pathname)) return;
  const now = Date.now();
  const idleMs = getSessionPolicy().idle_timeout_seconds * 1000;
  const throttle = idleMs > 0 ? Math.min(ACTIVITY_THROTTLE_MS, idleMs / 2) : ACTIVITY_THROTTLE_MS;
  if (now - lastActivityAt > throttle) {
    lastActivityAt = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    scheduleIdleLock();
    // A previously idle tab may become active again before access expires.
    // Re-arm a skipped silent refresh so that return does not force a prompt.
    if (!refreshTimer && getRefreshToken() && getSessionPolicy().silent_refresh_activity_seconds > 0) {
      scheduleProactiveRefresh();
    }
  }
}

function activeRefreshWindowMs(): number {
  const storedTtl = Number(localStorage.getItem(ACCESS_TTL_MS_KEY));
  const ttl = Number.isFinite(storedTtl) && storedTtl > 0 ? storedTtl : currentAccessTtlMs;
  return Math.min(ttl, getSessionPolicy().silent_refresh_activity_seconds * 1000);
}

export function wasActiveWithin(windowMs: number): boolean {
  return windowMs > 0 && Date.now() - Math.max(lastActivityAt, storedActivityAt()) <= windowMs;
}

function scheduleIdleLock(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const timeoutMs = getSessionPolicy().idle_timeout_seconds * 1000;
  if (!timeoutMs || !getAccessToken() || isPublicAuthPath(window.location.pathname)) return;
  const remaining = Math.max(lastActivityAt, storedActivityAt()) + timeoutMs - Date.now();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    checkSessionDeadline();
    // Activity in another tab may have advanced the shared human timestamp.
    if (!isSessionPaused() && Math.max(lastActivityAt, storedActivityAt()) + timeoutMs > Date.now()) scheduleIdleLock();
  }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, remaining)));
}

let activityListenersInstalled = false;

export function installActivityListeners(): void {
  if (activityListenersInstalled || typeof window === 'undefined') return;
  activityListenersInstalled = true;
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  const events: (keyof WindowEventMap)[] = [
    'mousedown',
    'keydown',
    'touchstart',
    'scroll',
    'wheel',
    'click',
  ];
  events.forEach(name => window.addEventListener(name, markActivity, opts));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkSessionDeadline();
  });
  window.addEventListener('focus', () => { if (isHostManagedSession()) void checkSessionDeadline(); });
  window.addEventListener('online', () => { if (isHostManagedSession()) void retryHostSession(); });
}

// ────────────────────────────────────────────────────────────────────
// Refresh scheduling
// ────────────────────────────────────────────────────────────────────

export function cancelScheduledRefresh(): void {
  if (hostRetryTimer) clearTimeout(hostRetryTimer);
  hostRetryTimer = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

/** Only a verified, unexpired session can enter the inactivity lock. */
export function pauseForSessionRenewal(): void {
  if (isHostManagedSession()) return;
  const expiresAt = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  if (!localStorage.getItem(ACCESS_TOKEN_KEY) || isPublicAuthPath(window.location.pathname)) return;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) { redirectToLogin(); return; }
  const idleMs = getSessionPolicy().idle_timeout_seconds * 1000;
  if (idleMs <= 0 || Date.now() < Math.max(lastActivityAt, storedActivityAt()) + idleMs) return;
  if (requestSessionRecovery('renew')) {
    // Keep the expiry watchdog alive: a paused session can still expire.
    if (idleTimer) clearTimeout(idleTimer);
    if (refreshTimer) clearTimeout(refreshTimer);
    idleTimer = refreshTimer = null;
  }
}

/** Also checked before requests and on wake-up, since timers can be throttled. */
export function checkSessionDeadline(): Promise<string | null> | void {
  const expiresAt = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  if (isHostManagedSession()) {
    if (hostSessionEnabled && (!localStorage.getItem(ACCESS_TOKEN_KEY) || expiresAt <= Date.now())) return renewHostSession();
    return;
  }
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) return;
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    // Public auth pages must remain usable even with stale stored credentials.
    if (isSessionPaused() || isPublicAuthPath(window.location.pathname)) { redirectToLogin(); return; }
    const activeWindow = activeRefreshWindowMs();
    if (inflightRefresh || (getRefreshToken() && wasActiveWithin(activeWindow))) {
      const generation = sessionGeneration;
      const pending = inflightRefresh ?? exchangeRefreshToken();
      return pending.then(token => {
        if (!token && generation === sessionGeneration && localStorage.getItem(ACCESS_TOKEN_KEY)) redirectToLogin();
        return token;
      });
    }
    redirectToLogin();
    return;
  }
  if (!isSessionPaused()) pauseForSessionRenewal();
}

/**
 * Compute the seconds-from-now at which to fire the next proactive
 * refresh. Reads `t75_token_expires_at` if available; otherwise falls
 * back to the configured TTL.
 */
function computeDelaySeconds(): number {
  const rawExpiry = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  const secondsUntilExpiry = rawExpiry > 0 && Number.isFinite(rawExpiry)
    ? Math.floor((rawExpiry - Date.now()) / 1000)
    : Math.floor(currentAccessTtlMs / 1000);
  const policy = getSessionPolicy();
  // Short issued TTLs override the preferred interval so refresh never waits
  // until after the actual access deadline.
  return Math.max(0, Math.min(
    Math.max(policy.min_refresh_interval_seconds, secondsUntilExpiry - policy.refresh_lead_seconds),
    secondsUntilExpiry - 1,
  ));
}

export function scheduleProactiveRefresh(): void {
  cancelScheduledRefresh();
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) return;
  if (isHostManagedSession()) {
    if (!hostSessionEnabled) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void renewHostSession();
    }, Math.min(MAX_TIMER_DELAY_MS, Math.max(1000, hostRetryAt > Date.now() ? hostRetryAt - Date.now() : computeDelaySeconds() * 1000)));
    return;
  }
  const expiresAt = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  if (expiresAt > 0 && Number.isFinite(expiresAt)) {
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      void Promise.resolve(checkSessionDeadline()).then(() => {
        if (!isSessionPaused()) scheduleProactiveRefresh();
      });
    }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, expiresAt - Date.now())));
  }
  if (isSessionPaused()) return;
  scheduleIdleLock();
  if (!getRefreshToken()) return;
  const delayMs = computeDelaySeconds() * 1000;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    // Background polling is not human activity. Let idle access expire
    // and return to sign-in instead of refreshing indefinitely.
    checkSessionDeadline();
    if (isSessionPaused()) return;
    if (delayMs > MAX_TIMER_DELAY_MS) {
      scheduleProactiveRefresh();
      return;
    }
    if (!wasActiveWithin(activeRefreshWindowMs())) return;
    const generation = sessionGeneration;
    refreshAccessToken().then(token => {
      if (generation !== sessionGeneration || isSessionPaused() || !getAccessToken()) return;
      if (!token) {
        // A transient outage must not lock a still-valid active session.
        const expiry = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
        if (expiry > Date.now()) scheduleProactiveRefresh();
        else redirectToLogin();
      }
    });
  }, Math.min(MAX_TIMER_DELAY_MS, delayMs));
}

// ────────────────────────────────────────────────────────────────────
// Refresh call (single-flight)
// ────────────────────────────────────────────────────────────────────

/**
 * Bare axios call — bypasses `apiClient` interceptors to avoid the
 * recursion of "401 on refresh → trigger refresh → 401 → …".
 */
async function callRefreshEndpoint(refreshToken: string): Promise<TokenPayload> {
  const res = await axios.post<TokenPayload>(
    `${getApiBaseURL()}/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: getSessionPolicy().renewal_request_timeout_seconds * 1000 },
  );
  return res.data;
}

/**
 * Exchange the stored refresh token for a fresh access token. Returns
 * the new access token on success, or `null` on failure. The caller
 * should not retry; an authoritative rejection opens the sign-in prompt.
 */
function storedAccountId(): string | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null")?.id ?? null; }
  catch { return null; }
}

/** One exchange per origin when Web Locks are supported (including other tabs). */
async function withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("integral:session-refresh", {
      signal: AbortSignal.timeout(getSessionPolicy().renewal_request_timeout_seconds * 1000 + 5000),
    }, operation);
  }
  return operation();
}

function exchangeRefreshToken(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  const generation = sessionGeneration;
  const account = storedAccountId();
  const adoptRotatedToken = (): string | null => {
    if (generation !== sessionGeneration || !account || storedAccountId() !== account || isSessionPaused()) return null;
    if (getRefreshToken() === refreshToken) return null;
    const expires = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
    const token = expires > Date.now() ? getAccessToken() : null;
    if (token) {
      scheduleProactiveRefresh();
      window.dispatchEvent(new Event("integral:tokens-updated"));
    }
    return token;
  };
  inflightRefresh = (async () => {
    try {
      return await withRefreshLock(async () => {
        if (generation !== sessionGeneration) return null;
        if (getRefreshToken() !== refreshToken) return adoptRotatedToken();
        const payload = await callRefreshEndpoint(refreshToken);
        if (generation !== sessionGeneration) return null;
        if (getRefreshToken() !== refreshToken) return adoptRotatedToken();
        if (!payload?.access_token) throw new Error('Refresh response missing access_token');
        setTokens(payload, { preserveActivity: true });
        return payload.access_token;
      });
    } catch (err) {
      const shared = adoptRotatedToken();
      if (shared) return shared;
      const status = (err as AxiosError | undefined)?.response?.status;
      if (generation === sessionGeneration && getRefreshToken() === refreshToken
          && (status === 400 || status === 401 || status === 403)) redirectToLogin();
      return null;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

export function refreshAccessToken(): Promise<string | null> {
  if (isHostManagedSession()) return renewHostSession(true);
  if (inflightRefresh) return inflightRefresh;
  const renewal = checkSessionDeadline();
  if (renewal) return renewal;
  if (isSessionPaused()) return Promise.resolve(null);
  return exchangeRefreshToken();
}

/** A failed renewal retains the mounted workspace and retries with bounded backoff. */
function renewHostSession(force = false): Promise<string | null> {
  if (!hostSessionEnabled) return Promise.resolve(null);
  if (inflightRefresh) return inflightRefresh;
  if (!force && Date.now() < hostRetryAt) return Promise.resolve(null);
  const generation = sessionGeneration;
  const account = storedAccountId();
  inflightRefresh = (async () => {
    try {
      await Promise.resolve();
      const host = getHostSession();
      if (host?.identity !== 'installation_owner') throw new Error('Open the configured desktop host to reconnect.');
      const payload = await host.session();
      if (generation !== sessionGeneration || !hostSessionEnabled) return null;
      if (!payload.access_token || !Number.isFinite(payload.expires_in) || payload.expires_in! <= 0) throw new Error('Invalid local owner session.');
      const response = await axios.get(`${getApiBaseURL()}/auth/me`, {
        headers: { Authorization: `Bearer ${payload.access_token}` },
        timeout: getSessionPolicy().renewal_request_timeout_seconds * 1000,
      });
      const verified = normalizeUserMe(response.data);
      if (generation !== sessionGeneration || !hostSessionEnabled) return null;
      if (!verified.id || (account && verified.id !== account) || storedAccountId() !== account) throw new LocalSessionIdentityError('The local owner identity changed.');
      hostFailures = hostRetryAt = 0;
      setTokens(payload, { preserveActivity: true });
      setSessionConnection(null);
      return payload.access_token;
    } catch (error) {
      if (generation !== sessionGeneration || !hostSessionEnabled) return null;
      hostFailures += 1;
      setSessionConnection(error instanceof LocalSessionIdentityError || !getHostSession() ? 'recovery' : 'reconnecting');
      const delay = Math.min(30_000, 5000 * 2 ** Math.min(hostFailures - 1, 3));
      hostRetryAt = Date.now() + delay;
      if (hostRetryTimer) clearTimeout(hostRetryTimer);
      hostRetryTimer = setTimeout(() => { hostRetryTimer = null; void renewHostSession(); }, delay);
      return null;
    } finally { inflightRefresh = null; }
  })();
  return inflightRefresh;
}

export function retryHostSession(): Promise<string | null> {
  return isHostManagedSession() ? renewHostSession(true) : Promise.resolve(null);
}
