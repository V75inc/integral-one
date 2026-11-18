import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { beginInteraction, finishInteraction, type Interaction } from '../lib/performance';
import { clearAllSingleFlights, configureSingleFlightContext, dedupeConcurrentGets } from './singleFlight';
import { isDeferrableStartupGet, waitForStartupWindow } from './startupGate';
import { getApiBaseURL } from '../config';
import { normalizeDeepStrings } from '../utils/textEncoding';
import {
  getAccessToken,
  getRefreshToken,
  isRefreshInFlight,
  checkSessionDeadline,
  redirectToLogin,
  refreshAccessToken,
  pauseForSessionRenewal,
} from './session';
import { isPublicAuthPath } from './sessionRoutes';
import { isHostManagedSession } from './sessionRuntime';
import { LocalWorkspaceReconnectingError } from './localSessionError';
import { isSessionPaused } from './sessionRecovery';
import {
  clearApiFailure,
  notifyApiFailure,
} from '../lib/apiErrorNotifier';

/** JSON-like payloads only — Blobs/binary must not go through normalizeDeepStrings. */
function shouldNormalizeResponseData(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  if (data instanceof Blob) return false;
  if (data instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(data)) return false;
  return true;
}

/** Per-request flag set by the 401-retry path so we never loop. */
interface RetryAwareConfig extends InternalAxiosRequestConfig {
  __sessionRetried?: boolean;
}

const apiClient = axios.create({
  baseURL: getApiBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  // A stalled API worker used to hold the browser's six HTTP/1.1 connections
  // until a full reload. Allow slower installations and bulk operations while
  // retaining a finite deadline. Chat streams use fetch, not this client.
  timeout: 120_000,
});

// Active workspace scope is published into a module-level slot by the
// ScopeContext provider on every change. The request interceptor reads
// from this slot and sets ``X-Integral-Scope`` so the backend (and
// notably the agent tool dispatcher) can constrain operations to the
// caller's active workspace without each call site re-stating it.
let _activeScopeHeader: string | null = null;
export function setActiveScopeHeader(value: string | null): void {
  if (_activeScopeHeader !== value) clearAllSingleFlights();
  _activeScopeHeader = value;
}
// Outer API flights execute before the axios adapter. Partition them at the
// same boundary, including credential changes received through another tab.
configureSingleFlightContext(() => JSON.stringify([getAccessToken(), _activeScopeHeader]));
// Live source of truth for the active workspace scope header (``ws:<id>``),
// kept in sync by ScopeContext. Non-axios callers (e.g. the chat SSE stream,
// which bypasses this client) should read it here rather than re-deriving from
// localStorage — that slot is only written on an explicit switch and is null on
// a fresh boot, which would silently fall the agent back to the personal
// workspace even when the user is in an org workspace.
export function getActiveScopeHeader(): string | null {
  return _activeScopeHeader;
}

const requestTimings = new WeakMap<object, Interaction>();

apiClient.interceptors.request.use(async config => {
  // Background panels wait out the first moments of a page load (see startupGate.ts).
  if (import.meta.env?.MODE !== 'test' && isDeferrableStartupGet(config.method, config.url)) {
    await waitForStartupWindow();
  }
  const timing = beginInteraction();
  if (timing) {
    const parent = config.headers.traceparent;
    if (typeof parent === 'string' && /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/.test(parent)) {
      timing.traceparent = parent;
      timing.traceId = parent.split('-')[1];
    } else {
      config.headers.traceparent = timing.traceparent;
    }
    requestTimings.set(config, timing);
  }
  await checkSessionDeadline();
  if (isHostManagedSession() && !getAccessToken()) throw new LocalWorkspaceReconnectingError();
  if (isSessionPaused()) throw new axios.CanceledError('Session renewal required');
  // Only real input events count as activity; polling must not keep a
  // session alive after the user walks away.
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Inject workspace scope on every outbound call.
  // Callers that must NOT send the scope header (e.g. GET /users/me/scope,
  // which IS the authority and must not be influenced by stale localStorage)
  // set ``X-Integral-Scope: ''`` in their per-request headers as a suppression
  // sentinel. We delete the sentinel here so nothing is sent, and skip the
  // normal injection. Any other explicitly-set non-empty value is left alone.
  const explicitScope = (config.headers as Record<string, unknown>)['X-Integral-Scope'];
  if (explicitScope === '') {
    delete (config.headers as Record<string, unknown>)['X-Integral-Scope'];
  } else if (!explicitScope && _activeScopeHeader) {
    config.headers['X-Integral-Scope'] = _activeScopeHeader;
  }
  // Default instance header is application/json; FormData must omit Content-Type so the
  // runtime sets multipart boundary. Parallel requests can otherwise keep JSON and get 422
  // "Field required" for file while another upload in the same batch succeeds.
  if (config.data instanceof FormData && config.headers) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
      delete (config.headers as Record<string, unknown>)['content-type'];
    }
  }
  return config;
});

/**
 * Per-request opt-out: set `config.__suppressSystemNotify = true` if a
 * specific call should NOT raise a system bar on failure (e.g. probes,
 * background polling that handles errors inline). Default: every non-401
 * failure raises a system notification.
 */
interface NotifyAwareConfig extends InternalAxiosRequestConfig {
  __suppressSystemNotify?: boolean;
}

/** Routes whose 4xx responses should never raise a system notification.
 *  These either have their own UI (login forms, signup validation, search
 *  with empty results that 404) or are probe-style requests. */
const SUPPRESS_NOTIFY_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/agentive/status',
  '/operational-model-substrate',
  '/invitations/',
];

function shouldSuppressNotify(config: NotifyAwareConfig | undefined): boolean {
  if (!config) return true;
  if (config.__suppressSystemNotify) return true;
  const url = config.url ?? '';
  return SUPPRESS_NOTIFY_PATHS.some((p) => url.includes(p));
}

apiClient.interceptors.response.use(
  (r: AxiosResponse) => {
    const requestTiming = requestTimings.get(r.config);
    finishInteraction(requestTiming, 'http.response');
    const normalization = requestTiming ? { ...requestTiming, started: performance.now() } : undefined;
    if (shouldNormalizeResponseData(r.data)) {
      r.data = normalizeDeepStrings(r.data);
    }
    finishInteraction(normalization, 'http.normalization');
    // A successful write may change what listings return; drop shared requests.
    const method = (r.config?.method || 'get').toLowerCase();
    // POST /auth/ws-ticket only mints a socket ticket; it changes no listing.
    const url = String(r.config?.url || '');
    if (method !== 'get' && method !== 'head' && !url.endsWith('/auth/ws-ticket') && !url.endsWith('/entry-lookup')) {
      clearAllSingleFlights();
      const payload = r.data?.data ?? r.data;
      // Only the authenticated operation response can classify a POST read.
      // Older servers and all other mutation routes invalidate conservatively.
      const confirmedRead = /(?:^|\/)extensions\/[^/?]+\/operations\/[^/?]+$/.test(url)
        && payload?.operation_class === 'read';
      if (!confirmedRead) window.dispatchEvent(new Event('integral:records-changed'));
    }
    // Successful response — clear any active "can't reach Integral" banner.
    clearApiFailure();
    return r;
  },
  async (err: AxiosError) => {
    if (err.config) finishInteraction(requestTimings.get(err.config), axios.isCancel(err) ? 'http.cancelled' : 'http.error');
    if (axios.isCancel(err) || isSessionPaused()) return Promise.reject(err);
    // A deadline only stops waiting in the browser; it cannot roll back work
    // already accepted by the server. Never replay a timed-out mutation.
    if ((err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') &&
        !['get', 'head', 'options'].includes(err.config?.method?.toLowerCase() ?? 'get')) {
      err.message = 'Integral took too long to respond. The change may still complete. Check the records or Background Tasks before submitting it again.';
    }
    if (err.response && shouldNormalizeResponseData(err.response.data)) {
      err.response.data = normalizeDeepStrings(err.response.data);
    }

    // Surface failures (network/5xx/4xx) through the system bar, except
    // for routes that own their own error UI. Skip while a token refresh is
    // in flight — parallel 401/transient failures would flash "Something went
    // wrong" over a recovery the user never needs to see.
    const cfg = err.config as NotifyAwareConfig | undefined;
    if (!shouldSuppressNotify(cfg) && !isRefreshInFlight()) {
      notifyApiFailure(err);
    }

    if (err.response?.status !== 401) {
      return Promise.reject(err);
    }

    const config = err.config as RetryAwareConfig | undefined;
    const requestUrl = config?.url ?? '';
    // Credential failures belong to their form, never the previous account's refresh.
    if (/\/auth\/(login|signup|forgot-password|reset-password|activate-account)(?:$|\?)/.test(requestUrl)) return Promise.reject(err);
    const onPublicSurface =
      typeof window !== 'undefined' && isPublicAuthPath(window.location.pathname);

    // Unauthenticated visitors on public surfaces (invite links, auth pages)
    // must never be bounced to /login by background 401s (e.g. stale
    // operational-model-substrate calls from a prior bundle).
    if (onPublicSurface && !getRefreshToken() && !isHostManagedSession()) {
      return Promise.reject(err);
    }

    // /auth/refresh itself 401'd, or we've already retried this exact
    // request once. Either way, give up and bounce to /login.
    if (
      !config ||
      config.__sessionRetried ||
      requestUrl.includes('/auth/refresh')
    ) {
      redirectToLogin();
      return Promise.reject(err);
    }

    // No refresh token stored — nothing to try. Same as before: clear
    // and bounce.
    if (!getRefreshToken() && !isHostManagedSession()) {
      redirectToLogin();
      return Promise.reject(err);
    }

    const newAccessToken = await refreshAccessToken();
    if (isSessionPaused()) return Promise.reject(err);
    if (!newAccessToken) {
      // A temporary outage must not destroy a renewable session. An
      // authoritative rejection already upgraded the prompt to sign-in.
      if (!isSessionPaused()) pauseForSessionRenewal();
      return Promise.reject(err);
    }

    config.__sessionRetried = true;
    if (config.headers && typeof (config.headers as { set?: unknown }).set === 'function') {
      (config.headers as { set: (k: string, v: string) => void }).set(
        'Authorization',
        `Bearer ${newAccessToken}`,
      );
    } else {
      (config.headers as unknown as Record<string, string>) = {
        ...((config.headers as unknown as Record<string, string>) ?? {}),
        Authorization: `Bearer ${newAccessToken}`,
      };
    }
    return apiClient.request(config);
  },
);

// Navigation reads are fetched again by several components a few seconds apart as a page
// builds up. Reuse them briefly; any write clears them (above) and so does every live
// graph-change event, so a change made elsewhere still shows up immediately.
const REUSABLE_NAVIGATION_GETS: RegExp[] = [
  /^\/apps(\?|$)/,
  /^\/apps\/[^/?]+(\?|$)/,
  /^\/apps\/[^/?]+\/(dashboards|collaborators|operational-model|operational-model\/track-templates|action-bindings|tracks|home)(\?|$)/,
  /^\/tracks(\?|$)/,
  /^\/workspaces(\/[^/?]+)?(\?|$)/,
  /^\/workspaces\/[^/?]+\/agent-preference(\?|$)/,
  /^\/chat\/providers\/[^/?]+\/agents(\?|$)/,
];
dedupeConcurrentGets(apiClient, {
  reuseMs: 10_000,
  reusable: path => REUSABLE_NAVIGATION_GETS.some(re => re.test(path)),
});
if (typeof window !== 'undefined') {
  window.addEventListener('integral:graph-changed', clearAllSingleFlights);
  window.addEventListener('integral:agent-events-reconnected', clearAllSingleFlights);
}

export default apiClient;
