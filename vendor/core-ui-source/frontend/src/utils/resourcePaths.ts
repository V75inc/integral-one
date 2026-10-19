/** Frontend routes for Integral resources (aligned with App.tsx). */

import type { Notification } from '../types';

export function trackPath(trackId: string): string {
  return `/tracks/${encodeURIComponent(trackId)}`;
}

export function appPath(appId: string): string {
  return `/apps/${encodeURIComponent(appId)}`;
}

export function workspacePath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

/** Canonical entry deep-link — opens the entry on its parent track. */
export function entryPath(entryId: string, trackId: string): string {
  const base = trackPath(trackId);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}entry=${encodeURIComponent(entryId)}`;
}

/** Full-page entry route (EntryPage.tsx) — entry types opted in via
 *  `form_schema.open_as_page: true` navigate here instead of opening the
 *  entry-in-a-track-modal via `entryPath`. */
export function entryPagePath(entryId: string): string {
  return `/entries/${encodeURIComponent(entryId)}`;
}

export type ResourceKind = 'app' | 'track' | 'entry' | 'workspace';

export function resourcePath(
  kind: ResourceKind,
  id: string,
  opts?: { trackId?: string | null },
): string | null {
  if (!id) return null;
  if (kind === 'app') return appPath(id);
  if (kind === 'track') return trackPath(id);
  if (kind === 'workspace') return workspacePath(id);
  if (kind === 'entry') {
    const trackId = opts?.trackId?.trim();
    return trackId ? entryPath(id, trackId) : null;
  }
  return null;
}

/** Resolve the in-app route for a notification row click. */
export function resolveNotificationHref(n: Notification): string | null {
  const direct = n.action_url?.trim();
  if (direct) {
    // Legacy persisted URLs used `/entries/{id}` — no matching route exists.
    const legacyEntry = direct.match(/^\/entries\/([^/?#]+)/);
    if (legacyEntry) {
      const payload = notificationPayload(n);
      const trackId = String(payload?.track_id ?? '').trim();
      if (trackId) return entryPath(legacyEntry[1], trackId);
    }
    return direct;
  }

  const payload = notificationPayload(n);
  if (!payload) return null;

  const entryId = String(payload.entry_id ?? '').trim();
  const trackId = String(payload.track_id ?? '').trim();
  if (entryId && trackId) return entryPath(entryId, trackId);

  const resourceType = String(payload.resource_type ?? '').trim();
  const resourceId = String(payload.resource_id ?? '').trim();
  if (resourceType && resourceId) {
    return resourcePath(resourceType as ResourceKind, resourceId, {
      trackId: trackId || null,
    });
  }

  if (n.type === 'agent_pending_write') return '/approvals';

  if (n.type === 'invitation') {
    const invitationId = String(payload?.invitation_id ?? '').trim();
    if (invitationId) {
      return `/invitations/received/${encodeURIComponent(invitationId)}`;
    }
  }

  return null;
}

function notificationPayload(
  n: Notification,
): Record<string, unknown> | null {
  const meta = n.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const nested = meta.payload;
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }
  return meta as Record<string, unknown>;
}
