import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { getApiBaseURL } from '../config';
import { normalizeDeepStrings } from '../utils/textEncoding';
import {
  getAccessToken,
  getRefreshToken,
  isRefreshInFlight,
  markActivity,
  redirectToLogin,
  refreshAccessToken,
} from './session';
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
  // until a full reload. Chat streams use fetch, not this client.
  timeout: 30_000,
});

// Active workspace scope is published into a module-level slot by the
// ScopeContext provider on every change. The request interceptor reads
// from this slot and sets ``X-Integral-Scope`` so the backend (and
// notably the agent tool dispatcher) can constrain operations to the
// caller's active workspace without each call site re-stating it.
let _activeScopeHeader: string | null = null;
export function setActiveScopeHeader(value: string | null): void {
  _activeScopeHeader = value;
}
// Live source of truth for the active workspace scope header (``ws:<id>``),
// kept in sync by ScopeContext. Non-axios callers (e.g. the chat SSE stream,
// which bypasses this client) should read it here rather than re-deriving from
// localStorage — that slot is only written on an explicit switch and is null on
// a fresh boot, which would silently fall the agent back to the personal
// workspace even when the user is in an org workspace.
export function getActiveScopeHeader(): string | null {
  return _activeScopeHeader;
}

apiClient.interceptors.request.use(config => {
  // User-driven API traffic counts as activity — the session refresh
  // scheduler relies on this to decide whether to keep the session
  // alive when the next refresh window arrives.
  markActivity();
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

function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname.includes('/login') ||
    pathname.includes('/signup') ||
    pathname.includes('/forgot-password') ||
    pathname.includes('/reset-password') ||
    pathname.includes('/verify-email') ||
    pathname.startsWith('/invitations/') ||
    pathname.startsWith('/portfolio/shared/') ||
    pathname.startsWith('/public/tracks/')
  );
}

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
    if (shouldNormalizeResponseData(r.data)) {
      r.data = normalizeDeepStrings(r.data);
    }
    // Successful response — clear any active "can't reach Integral" banner.
    clearApiFailure();
    return r;
  },
  async (err: AxiosError) => {
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
    const onPublicSurface =
      typeof window !== 'undefined' && isPublicAuthPath(window.location.pathname);

    // Unauthenticated visitors on public surfaces (invite links, auth pages)
    // must never be bounced to /login by background 401s (e.g. stale
    // operational-model-substrate calls from a prior bundle).
    if (onPublicSurface && !getRefreshToken()) {
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
    if (!getRefreshToken()) {
      redirectToLogin();
      return Promise.reject(err);
    }

    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      // refreshAccessToken already cleared tokens + dispatched logout
      // on 4xx; soft-land on login with an explicit reason.
      redirectToLogin();
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

export default apiClient;
