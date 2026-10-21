/**
 * apiErrorNotifier — translates axios/fetch failures into user-friendly
 * system notifications. Called from the axios response interceptor and
 * from per-page error handlers that previously rendered their own inline
 * "Could not load X" banner.
 *
 * Layering: lives in `src/lib/` so API modules (`api/client.ts`) can import
 * without depending on `components/`. Re-exported from
 * `components/system/apiErrorNotifier.ts` for back-compat.
 */

import type { AxiosError } from 'axios';
import { getSystemNotificationsApi } from '../components/system/SystemNotificationsContext';

export const API_ERROR_ID = 'system:api-error';

interface NotifyApiFailureOptions {
  /** Short context label, e.g. "Loading your feed". */
  context?: string;
  /** Optional retry handler — adds a "Retry" inline action. */
  onRetry?: () => void | Promise<void>;
  /** Override the auto-derived error code. */
  errorCode?: string;
}

function classify(err: unknown, contextLabel?: string): {
  title: string;
  body: string;
  severity: 'error' | 'warning';
  skip: boolean;
} {
  const ax = err as AxiosError | undefined;
  const status = ax?.response?.status;
  const codeFromResp = (ax?.response?.data as { error_code?: string } | undefined)?.error_code;
  const ctx = contextLabel ? ` (${contextLabel.toLowerCase()})` : '';

  if (ax?.code === 'ERR_CANCELED' || status === 401 || status === 403) {
    return { title: '', body: '', severity: 'warning', skip: true };
  }

  if (ax?.code === 'ECONNABORTED' || ax?.code === 'ETIMEDOUT') {
    const isRead = ['get', 'head', 'options'].includes(ax.config?.method?.toLowerCase() ?? 'get');
    return {
      title: `Integral took too long to respond${ctx}`,
      body: isRead
        ? 'Wait a moment, then refresh to check for updates.'
        : 'The change may still complete. Check the records or Background Tasks before submitting it again.',
      severity: 'warning',
      skip: false,
    };
  }

  if (!ax?.response) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { title: '', body: '', severity: 'error', skip: true };
    }
    return {
      title: `Can't reach Integral${ctx}`,
      body: 'Check your connection and try again.',
      severity: 'error',
      skip: false,
    };
  }

  if (status === 408) {
    return {
      title: `Slow connection${ctx}`,
      body: 'Try again when your connection improves.',
      severity: 'warning',
      skip: false,
    };
  }
  if (status === 429) {
    return {
      title: 'Too many requests',
      body: 'Wait a moment, then try again.',
      severity: 'warning',
      skip: false,
    };
  }
  if (status && status >= 500) {
    return {
      title: 'Integral is having trouble',
      body: 'Try again in a moment.',
      severity: 'error',
      skip: false,
    };
  }
  if (status && status >= 400) {
    const respMsg =
      (ax?.response?.data as { message?: string; detail?: string } | undefined)?.message ||
      (ax?.response?.data as { detail?: string } | undefined)?.detail;
    return {
      title: respMsg || `Request failed${ctx}`,
      body: `${status}${codeFromResp ? ` · ${codeFromResp}` : ''}`,
      severity: 'warning',
      skip: false,
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  return {
    title: `Something went wrong${ctx}`,
    body: msg.slice(0, 100),
    severity: 'error',
    skip: false,
  };
}

export function notifyApiFailure(err: unknown, opts: NotifyApiFailureOptions = {}): void {
  const api = getSystemNotificationsApi();
  if (!api) return;
  const { title, body, severity, skip } = classify(err, opts.context);
  if (skip) return;

  const ax = err as AxiosError | undefined;
  const uncertainWrite = (ax?.code === 'ECONNABORTED' || ax?.code === 'ETIMEDOUT') &&
    !['get', 'head', 'options'].includes(ax.config?.method?.toLowerCase() ?? 'get');
  const actions = opts.onRetry && !uncertainWrite
    ? [{ label: 'Retry', onClick: opts.onRetry }]
    : undefined;

  api.notify({
    id: API_ERROR_ID,
    type: severity,
    title,
    body,
    actions,
    dismissible: true,
  });
}

export function clearApiFailure(): void {
  const api = getSystemNotificationsApi();
  if (!api) return;
  api.dismiss(API_ERROR_ID);
}
