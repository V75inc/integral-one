/**
 * Soft stale-tab detection: compare the SPA's baked asset version to the
 * API's ``/api/meta/build`` payload. On mismatch, auto-reload once; if that
 * already happened this tab session, surface a Reload bar instead.
 *
 * Mount inside SystemNotificationsProvider (see App.tsx).
 */

import { useEffect } from 'react';

import { getApiBaseURL } from '../../config';
import {
  CLIENT_WEB_ASSET_VERSION,
  autoReloadOnceForStaleBuild,
  hasAutoReloadedForStaleBuild,
} from '../../lib/buildVersion';
import { getSystemNotificationsApi } from './SystemNotificationsContext';

const BUILD_NOTIFY_ID = 'system:stale-build';
const PROBE_MIN_INTERVAL_MS = 60_000;

let lastProbeAt = 0;

async function probeBuildVersion(): Promise<void> {
  const now = Date.now();
  if (now - lastProbeAt < PROBE_MIN_INTERVAL_MS) return;
  lastProbeAt = now;

  try {
    const res = await fetch(`${getApiBaseURL()}/meta/build`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // Never attach auth — this route is public and we do not want a
      // 401 refresh race while recovering a stale tab.
    });
    if (!res.ok) return;
    const body = (await res.json()) as { asset_version?: string };
    const server = (body.asset_version || '').trim();
    if (!server || server === CLIENT_WEB_ASSET_VERSION) return;

    if (!hasAutoReloadedForStaleBuild()) {
      autoReloadOnceForStaleBuild();
      return;
    }

    const api = getSystemNotificationsApi();
    if (!api) return;
    api.notify({
      id: BUILD_NOTIFY_ID,
      type: 'warning',
      title: 'A new version of Integral is available',
      body: 'Reload to finish updating.',
      dismissible: true,
      actions: [{ label: 'Reload', onClick: () => window.location.reload() }],
    });
  } catch {
    /* offline / API down — leave the session alone */
  }
}

export function useBuildVersionWatch(): void {
  useEffect(() => {
    void probeBuildVersion();
    const onFocus = () => {
      void probeBuildVersion();
    };
    const onVisibility = () => {
      if (!document.hidden) void probeBuildVersion();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
