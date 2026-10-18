import { useEffect, useState } from 'react';
import { getInitials, getAvatarColor } from '../../utils';
import apiClient from '../../api/client';

export type AvatarRingVariant = 'default' | 'social' | 'none';

interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Legacy free-form URL (Phase 1 — pasted avatars). Used as a fallback
   *  when ``attachmentId`` is not supplied. */
  url?: string;
  /** Phase 9 Plan 09-01 (AVT-02) — opaque Attachment id; when paired with
   *  ``userId`` the component resolves a backend variant URL via the new
   *  ``GET /api/users/{userId}/avatar?size=N`` endpoint and prefers it
   *  over the legacy ``url`` prop. */
  attachmentId?: string;
  /** Owning user's id — required alongside ``attachmentId`` to build the
   *  backend variant URL. */
  userId?: string;
  /** Cache-bust ``?v=`` value (typically ``user.updated_at``); a change
   *  here flushes the browser image cache without changing the
   *  attachment-id. */
  version?: string | number;
  /**
   * `social` — bright blue ring with a gap (ring offset) like Facebook / Instagram headers.
   * `default` — subtle white ring on initials / photo edge.
   */
  ringVariant?: AvatarRingVariant;
  /** Optional explicit identity color for non-photo avatars. */
  accentColor?: string | null;
  /** Optional foreground paired with accentColor for readable initials. */
  accentTextColor?: string | null;
  className?: string;
}

// Avatar variant pixel size keyed off the visual size token. md / lg both
// resolve to 128 — the 256 variant is reserved for hi-DPI cases not yet
// exercised by the current consumer surface inventory.
const _SIZE_TO_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  xs: 32,
  sm: 64,
  md: 128,
  lg: 128,
  xl: 256,
};

/**
 * Fetch an avatar variant via apiClient (carries auth header) and return
 * a blob: object URL the <img> tag can render. The native <img> request
 * does NOT send the Authorization header on its own, so the backend's
 * auth=True route 401s when we set its URL directly.
 */
function useAuthedAvatarUrl(apiPath: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!apiPath) {
      setBlobUrl(undefined);
      return;
    }
    let cancelled = false;
    let created: string | undefined;
    apiClient
      .get(apiPath, { responseType: 'blob' })
      .then(r => {
        if (cancelled) return;
        created = URL.createObjectURL(r.data as Blob);
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
  }, [apiPath]);
  return blobUrl;
}

export function Avatar({
  name,
  size = 'md',
  url,
  attachmentId,
  userId,
  version,
  ringVariant = 'default',
  accentColor,
  accentTextColor,
  className = '',
}: AvatarProps) {
  const sz = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    // xl matches the editorial header column on workspace
    // detail (display H1 + meta strap-line) so the avatar reads as a
    // first-class identity slot, not a thumbnail.
    xl: 'w-[88px] h-[88px] text-2xl',
  }[size];

  // Phase 9 Plan 09-01 (AVT-02). When ``attachmentId`` + ``userId`` are
  // supplied, build the canonical backend variant URL — attachmentId-
  // derived wins over the legacy ``url`` fallback. The backend route is
  // auth-gated; we fetch via apiClient (carries the Authorization header)
  // and render the response as a blob: URL inside <img>.
  //
  // The same auth path also covers workspace logos served at
  // ``/api/workspaces/{id}/avatar?size=N``: any ``url`` that starts with
  // ``/api/`` is treated as a same-origin auth-gated route and proxied
  // through apiClient. External / pasted URLs render directly.
  let apiPath: string | undefined;
  if (attachmentId && userId) {
    const pixelSize = _SIZE_TO_PX[size];
    const versionTok =
      version !== undefined && version !== null && `${version}` !== ''
        ? `&v=${encodeURIComponent(String(version))}`
        : '';
    apiPath = `/users/${encodeURIComponent(userId)}/avatar?size=${pixelSize}${versionTok}`;
  } else if (url && url.startsWith('/api/')) {
    // Strip the ``/api`` prefix because apiClient already has it baked
    // into its baseURL.
    apiPath = url.slice('/api'.length);
  }
  const authedBlobUrl = useAuthedAvatarUrl(apiPath);
  const effectiveUrl = authedBlobUrl ?? (apiPath ? undefined : url);

  const inner = effectiveUrl ? (
    <img
      src={effectiveUrl}
      alt={name}
      className={`${sz} rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${sz} ${accentColor ? '' : getAvatarColor(
        name
      )} rounded-full flex items-center justify-center font-semibold text-[var(--brand-accent-contrast)]`}
      style={accentColor ? {
        backgroundColor: accentColor,
        ...(accentTextColor ? { color: accentTextColor } : {}),
      } : undefined}
    >
      {getInitials(name)}
    </div>
  );

  if (ringVariant === 'social') {
    const offset = size === 'xs' ? 'ring-offset-1' : 'ring-offset-2';
    return (
      <div
        className={`shrink-0 rounded-full ring-2 ring-[var(--brand-accent)] ${offset} ring-offset-[var(--panel)] ${className}`}
      >
        {inner}
      </div>
    );
  }

  if (ringVariant === 'none') {
    return <div className={`shrink-0 ${className}`}>{inner}</div>;
  }

  if (effectiveUrl) {
    return (
      <img
        src={effectiveUrl}
        alt={name}
        className={`${sz} rounded-full object-cover ring-2 ring-white shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sz} ${accentColor ? '' : getAvatarColor(
        name
      )} rounded-full flex items-center justify-center font-semibold text-[var(--brand-accent-contrast)] ring-2 ring-white shrink-0 ${className}`}
      style={accentColor ? {
        backgroundColor: accentColor,
        ...(accentTextColor ? { color: accentTextColor } : {}),
      } : undefined}
    >
      {getInitials(name)}
    </div>
  );
}
