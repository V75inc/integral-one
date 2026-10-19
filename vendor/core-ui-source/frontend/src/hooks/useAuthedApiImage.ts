import { useEffect, useState } from 'react';

import apiClient from '../api/client';

/**
 * Fetch an auth-gated API image path via apiClient (carries Bearer token)
 * and return a blob: URL suitable for <img src>. Revokes on unmount.
 *
 * ``apiPath`` is relative to apiClient baseURL (no ``/api`` prefix).
 * When ``fallbackPath`` is set, a failed primary fetch retries there
 * (e.g. thumb → download).
 */
export function useAuthedApiImage(
  apiPath: string | undefined,
  fallbackPath?: string
): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!apiPath) {
      setBlobUrl(undefined);
      return;
    }
    let cancelled = false;
    let created: string | undefined;

    const fetchPath = (path: string) =>
      apiClient.get(path, { responseType: 'blob' }).then(r => r.data as Blob);

    fetchPath(apiPath)
      .catch(() => (fallbackPath ? fetchPath(fallbackPath) : Promise.reject()))
      .then(blob => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      })
      .catch(() => {
        if (cancelled) return;
        setBlobUrl(undefined);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [apiPath, fallbackPath]);

  return blobUrl;
}

/** Strip ``/api`` prefix for apiClient-relative paths. */
export function apiPathFromDisplayUrl(url: string): string | undefined {
  if (!url.startsWith('/api/')) return undefined;
  return url.slice('/api'.length);
}

/** Download fallback when the primary path is a thumb endpoint. */
export function downloadFallbackFromThumbPath(
  apiPath: string | undefined
): string | undefined {
  if (!apiPath?.endsWith('/thumb')) return undefined;
  return apiPath.replace(/\/thumb$/, '/download');
}
