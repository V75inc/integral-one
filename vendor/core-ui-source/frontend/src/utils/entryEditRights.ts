import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tracksApi } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Entry, Track, User } from '../types';
import { isSamePrincipal } from './index';

const ENTRY_CRUD_ROLES = new Set(['owner', 'admin', 'editor']);
const TRACK_CONFIG_VIEW_ROLES = new Set(['owner', 'admin', 'editor']);
const COMMENT_ROLES = new Set(['owner', 'admin', 'editor', 'commenter']);

export type TrackCollaboratorRole =
  | 'owner'
  | 'admin'
  | 'editor'
  | 'commenter'
  | 'viewer'
  | null;

function normalizeRole(raw: unknown): TrackCollaboratorRole {
  const role = String(raw || '').toLowerCase();
  if (
    role === 'owner' ||
    role === 'admin' ||
    role === 'editor' ||
    role === 'commenter' ||
    role === 'viewer'
  ) {
    return role;
  }
  return null;
}

/**
 * Resolve the caller's effective collaborator role on a track.
 *
 * Prefer ``track.caller_role`` when present (backend ``resolve_role`` —
 * includes org staff + App cascade). Fall back to owner / collaborators
 * list for older payloads that omit it.
 */
export function resolveTrackRoleForUser(
  user: Pick<User, 'id' | 'user_id'> | null | undefined,
  track: Track | null | undefined,
): TrackCollaboratorRole {
  if (!user || !track) return null;

  const fromCaller = normalizeRole(track.caller_role);
  if (fromCaller) return fromCaller;

  if (isSamePrincipal(user, track.owner_id)) return 'owner';
  const collab = (track.collaborators || []).find(c => {
    if (!isSamePrincipal(user, c.id) && !isSamePrincipal(user, c.user_id)) {
      return false;
    }
    // Excluded inherited rows must not grant FE permissions.
    const row = c as User & { effective_access?: boolean; excluded?: boolean };
    if (row.effective_access === false || row.excluded === true) return false;
    return true;
  });
  return normalizeRole(collab?.role);
}

/** owner | admin | editor — mirrors backend ``can_edit_track``. */
export function canCreateEntryForRole(
  role: TrackCollaboratorRole,
): boolean {
  return !!role && ENTRY_CRUD_ROLES.has(role);
}

/** owner | admin — mirrors backend ``can_admin_track``. */
export function canAdminTrackForRole(role: TrackCollaboratorRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** owner | admin | editor — read-only config browse for editors. */
export function canViewTrackConfigForRole(
  role: TrackCollaboratorRole,
): boolean {
  return !!role && TRACK_CONFIG_VIEW_ROLES.has(role);
}

/** owner | admin | editor — collaborators panel visibility. */
export function canViewCollaboratorsForRole(
  role: TrackCollaboratorRole,
): boolean {
  return !!role && TRACK_CONFIG_VIEW_ROLES.has(role);
}

/** owner | admin — add/remove/change collaborator roles (not ownership transfer). */
export function canManageCollaboratorsForRole(
  role: TrackCollaboratorRole,
): boolean {
  return role === 'owner' || role === 'admin';
}

/** owner | admin | editor | commenter — mirrors backend comment gate. */
export function canCommentForRole(role: TrackCollaboratorRole): boolean {
  return !!role && COMMENT_ROLES.has(role);
}

export interface TrackPermissions {
  role: TrackCollaboratorRole;
  canCreateEntry: boolean;
  canAdminTrack: boolean;
  canViewTrackConfig: boolean;
  canViewCollaborators: boolean;
  canManageCollaborators: boolean;
  canComment: boolean;
}

export function resolveTrackPermissions(
  user: Pick<User, 'id' | 'user_id'> | null | undefined,
  track: Track | null | undefined,
): TrackPermissions {
  const role = resolveTrackRoleForUser(user, track);
  return {
    role,
    canCreateEntry: canCreateEntryForRole(role),
    canAdminTrack: canAdminTrackForRole(role),
    canViewTrackConfig: canViewTrackConfigForRole(role),
    canViewCollaborators: canViewCollaboratorsForRole(role),
    canManageCollaborators: canManageCollaboratorsForRole(role),
    canComment: canCommentForRole(role),
  };
}

/** Track-level permission bundle; refetches collaborators so role changes propagate. */
export function useTrackPermissions(
  track: Track | null | undefined,
): TrackPermissions {
  const { user } = useAuth();
  const trackId = track?.id;
  const { data: live } = useQuery({
    queryKey: ['track', trackId, 'permissions'],
    queryFn: async () => {
      const resp = await tracksApi.getCollaboratorsDetailed(trackId!);
      return {
        collaborators: resp.collaborators as User[],
        caller_role: resp.caller_role ?? null,
      };
    },
    enabled: Boolean(trackId),
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const trackForPermissions = useMemo(() => {
    if (!track) return null;
    if (!live) return track;
    return {
      ...track,
      collaborators: live.collaborators,
      caller_role: normalizeRole(live.caller_role) ?? track.caller_role,
    };
  }, [track, live]);

  return useMemo(
    () => resolveTrackPermissions(user, trackForPermissions),
    [user, trackForPermissions],
  );
}

/** Fetch fresh collaborator list merged onto a track for permission checks. */
export async function fetchTrackWithCollaborators(trackId: string): Promise<Track> {
  const [track, collabResp] = await Promise.all([
    tracksApi.get(trackId),
    tracksApi.getCollaboratorsDetailed(trackId),
  ]);
  return {
    ...track,
    collaborators: collabResp.collaborators as User[],
    collaborator_effective_total: collabResp.effective_total,
    collaborator_inherited_truncated: collabResp.inherited_truncated,
    collaborator_visibility_grant: collabResp.visibility_grant,
    caller_role: normalizeRole(collabResp.caller_role),
  };
}

/** Mirrors backend ``can_edit_entry`` — track editors may CRUD any entry;
 *  commenters may edit only their own entries. */
export function canEditEntry(
  user: Pick<User, 'id' | 'user_id'> | null | undefined,
  entry: Pick<Entry, 'author_id'>,
  track: Track | null | undefined,
): boolean {
  const role = resolveTrackRoleForUser(user, track);
  if (role && ENTRY_CRUD_ROLES.has(role)) return true;
  if (role === 'commenter') return isSamePrincipal(user, entry.author_id);
  return isSamePrincipal(user, entry.author_id);
}

export interface UseCanEditEntryOptions {
  track?: Track | null;
  /** When set, skips track fetch and returns this value directly. */
  explicitCanEdit?: boolean;
}

/** Resolve whether the signed-in user may edit an entry (CRUD + attachments). */
export function useCanEditEntry(
  entry: Pick<Entry, 'author_id' | 'track_id'>,
  options?: UseCanEditEntryOptions,
): boolean {
  const { user } = useAuth();
  const trackId = entry.track_id || '';
  const shouldFetch =
    options?.explicitCanEdit === undefined && !options?.track && !!trackId;

  const { data: fetchedTrack } = useQuery({
    queryKey: ['track', trackId, 'edit-rights'],
    // Must include collaborators + caller_role — bare GET /tracks/{id} has
    // neither, and sharing this key with EntryDetail (which uses
    // fetchTrackWithCollaborators) would otherwise poison canComment/canEdit.
    queryFn: () => fetchTrackWithCollaborators(trackId),
    enabled: shouldFetch,
    staleTime: 60_000,
  });

  const track = options?.track ?? fetchedTrack ?? null;

  return useMemo(() => {
    if (options?.explicitCanEdit !== undefined) return options.explicitCanEdit;
    return canEditEntry(user, entry, track);
  }, [user, entry, track, options?.explicitCanEdit]);
}
