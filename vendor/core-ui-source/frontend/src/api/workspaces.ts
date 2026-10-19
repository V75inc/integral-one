import apiClient from './client';
import { unwrapResource } from './helpers';

/** Stored workspace kind. ``"organization"`` is the internal discriminator for
 *  a collaborative (multi-member) workspace; the user-facing TERM is
 *  "Collaborative". */
export type WorkspaceKind = 'personal' | 'organization' | 'collaborative';

/** UI-facing workspace category. `workspace_type="personal"` provisions a
 *  single-user workspace; `workspace_type="collaborative"` provisions a
 *  multi-member workspace (members + invitations + storage quota). The two
 *  canonical categories the create wizard surfaces. */
export const SUGGESTED_WORKSPACE_TYPES: readonly {
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
}[] = [
  {
    value: 'collaborative',
    label: 'Collaborative',
    description: 'A shared workspace — invite members and work together.',
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'Just for you — a private workspace only you can access.',
  },
];

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  workspace_type?: string;
  name: string;
  owner_user_id?: string;
  description?: string;
  accent_color?: string;
  /** Free-form pasted URL OR (when ``avatar_attachment_id`` is set)
   *  a stable ``/api/workspaces/{id}/avatar?size=128&v={updated_at}``
   *  path the server writes after a successful upload — so every consumer
   *  keyed on ``avatar_url`` keeps working without code change. */
  avatar_url?: string;
  /** Phase 9 extension — workspace avatar upload pipeline (mirrors
   *  ``User.avatar_attachment_id``). */
  avatar_attachment_id?: string;
  storage_bytes_used?: number;
  storage_quota_bytes?: number;
  created_at?: string;
  updated_at?: string;
  your_role?: 'owner' | 'admin' | 'member' | 'guest';
  /** Caller-specific creation rights (from ``IS_MEMBER_OF`` edge flags). */
  can_create_apps?: boolean;
  can_create_tracks?: boolean;
}

/** True only when this is the viewer's own Personal workspace. The stored
 * kind describes the workspace, not who is currently viewing it: a Personal
 * workspace can also be shared with an invited guest. */
export function isOwnedPersonalWorkspace(
  workspace?: Pick<Workspace, 'kind' | 'your_role'> | null,
): boolean {
  return workspace?.kind === 'personal' && workspace.your_role === 'owner';
}

/** A viewer-facing label that does not confuse a shared Personal workspace
 * with the viewer's own private workspace. */
export function workspaceAccessLabel(
  workspace?: Pick<Workspace, 'kind' | 'your_role'> | null,
): string {
  if (isOwnedPersonalWorkspace(workspace)) return 'Personal';
  if (workspace?.your_role === 'guest' || workspace?.kind === 'personal') {
    return 'Invited';
  }
  if (workspace?.your_role === 'owner') return 'Owner';
  if (workspace?.your_role === 'admin') return 'Admin';
  return 'Member';
}

/** Explicit membership role for org workspace chrome (Guest / Member / Admin / Owner). */
export function workspaceMembershipRoleLabel(
  workspace?: Pick<Workspace, 'your_role'> | null,
): string {
  const role = workspace?.your_role;
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'guest') return 'Guest';
  return 'Member';
}

/** Summary of app-bundle provisioning during workspace create (Manage-Apps
 *  semantics): ``installed`` = active now, ``awaiting_settings`` = paused until
 *  finalized in Manage apps, ``failed`` = e.g. unmet hard dependency. */
export interface WorkspaceProvisioningSummary {
  installed: number;
  awaiting_settings: number;
  skipped: number;
  failed: number;
  /** Hard app dependencies auto-pulled into the install set (not explicitly
   *  selected by the user). Included in ``installed`` when they activate. */
  auto_dependencies: number;
  /** Safe per-App denial identity; raw install exceptions are not returned. */
  failures?: { library_cp_id: string; name: string; error_code: string }[];
}

export interface WorkspaceMember {
  id: string;
  display_name: string;
  email?: string;
  user_id?: string;
  role?: string;
  can_create_apps?: boolean;
  can_create_tracks?: boolean;
  /** Phase 9 Plan 09-01 (AVT-02) — Avatar variant resolution. */
  avatar_attachment_id?: string;
  /** Cache-bust token for avatar URLs. */
  updated_at?: string;
}

export interface WorkspaceStorageUsage {
  workspace_id: string;
  bytes_used: number;
  quota_bytes: number;
  percent: number;
  is_unlimited: boolean;
  is_soft_warning: boolean;
  enforcement_enabled: boolean;
  soft_warn_threshold: number;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_user_id?: string | null;
  invited_by_user_id: string;
  role: string;
  can_create_apps?: boolean;
  can_create_tracks?: boolean;
  status: string;
  message?: string;
  created_at?: string;
  expires_at?: string;
  consumed_at?: string;
}

export const workspacesApi = {
  list: async (): Promise<Workspace[]> => {
    const { data } = await apiClient.get('/workspaces');
    const items = (data as { workspaces?: Workspace[] })?.workspaces;
    if (!Array.isArray(items)) throw new Error('Invalid workspace list response');
    return items;
  },
  get: async (id: string): Promise<Workspace> => {
    const { data } = await apiClient.get(`/workspaces/${id}`);
    return unwrapResource<Workspace>(data, 'workspace');
  },
  create: async (body: {
    name: string;
    description?: string;
    accent_color?: string;
    avatar_url?: string;
    workspace_type?: string;
    /** Legacy single-bundle seed. Prefer ``operational_model_slugs``. */
    operational_model_slug?: string;
    /** Multi-select: seed the workspace from one or more scope=workspace
     *  operational-model bundles (provisioned in order on the backend). */
    operational_model_slugs?: string[];
    /** Multi-select app-scope library packages (same set the Manage Apps
     *  dialog offers) — each installed as an App in the new workspace. */
    library_operational_model_ids?: string[];
  }): Promise<Workspace & { provisioning?: WorkspaceProvisioningSummary }> => {
    const { data } = await apiClient.post('/workspaces', body);
    const ws = unwrapResource<Workspace>(data, 'workspace');
    const provisioning = (
      data as { provisioning?: WorkspaceProvisioningSummary }
    )?.provisioning;
    return provisioning ? Object.assign(ws, { provisioning }) : ws;
  },
  update: async (
    id: string,
    body: {
      name?: string;
      description?: string;
      accent_color?: string;
      avatar_url?: string;
    },
  ): Promise<Workspace> => {
    const { data } = await apiClient.patch(`/workspaces/${id}`, body);
    return unwrapResource<Workspace>(data, 'workspace');
  },
  delete: (id: string) => apiClient.delete(`/workspaces/${id}`),

  /** Phase 9 extension — workspace avatar upload pipeline (mirrors
   *  ``usersApi.uploadAvatar``). Multipart POST of a square PNG/JPEG/WebP
   *  image. Backend resizes to 32/64/128/256 PNG variants, sets the
   *  canonical 128px variant on ``Workspace.avatar_attachment_id``, and
   *  emits a single ``workspace.update`` ChangeEvent. Permission: caller
   *  must be the workspace owner OR an admin member. */
  uploadAvatar: async (
    id: string,
    file: File,
  ): Promise<{
    avatar_attachment_id: string;
    updated_at: string;
    variants: { size: number; attachment_id: string }[];
  }> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post(
      `/workspaces/${encodeURIComponent(id)}/avatar`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data as {
      avatar_attachment_id: string;
      updated_at: string;
      variants: { size: number; attachment_id: string }[];
    };
  },

  listMembers: async (id: string): Promise<WorkspaceMember[]> => {
    const { data } = await apiClient.get(`/workspaces/${id}/members`);
    const items = (data as { members?: WorkspaceMember[] })?.members;
    return Array.isArray(items) ? items : [];
  },
  addMember: (
    id: string,
    body: {
      member_user_id: string;
      role?: 'admin' | 'member' | 'guest';
      can_create_apps?: boolean;
      can_create_tracks?: boolean;
    },
  ) =>
    apiClient.post(`/workspaces/${id}/members`, {
      member_user_id: body.member_user_id,
      role: body.role || 'member',
      can_create_apps: body.can_create_apps ?? false,
      can_create_tracks: body.can_create_tracks ?? false,
    }),
  patchMember: (
    id: string,
    memberUserId: string,
    body: {
      role?: 'admin' | 'member' | 'guest';
      can_create_apps?: boolean;
      can_create_tracks?: boolean;
    },
  ) => apiClient.patch(`/workspaces/${id}/members/${memberUserId}`, body),
  removeMember: (id: string, memberUserId: string) =>
    apiClient.delete(`/workspaces/${id}/members/${memberUserId}`),
  leave: (id: string) => apiClient.delete(`/workspaces/${id}/membership`),

  listApps: async (id: string) => {
    const { data } = await apiClient.get(`/workspaces/${id}/apps`);
    return data as { apps: unknown[]; total: number };
  },
  /**
   * Phase 36 — persist the display order of Apps inside a Workspace.
   * Writes each App's `position` field; subsequent `appsApi.list` returns
   * them in the same order when the X-Integral-Scope header pins the
   * workspace.
   */
  reorderApps: (id: string, appIds: string[]) =>
    apiClient.patch(`/workspaces/${id}/apps/order`, { app_ids: appIds }),
  listTracks: async (id: string) => {
    const { data } = await apiClient.get(`/workspaces/${id}/tracks`);
    return data as { tracks: unknown[]; total: number };
  },

  listInvitations: async (id: string): Promise<WorkspaceInvitation[]> => {
    const { data } = await apiClient.get(`/workspaces/${id}/invitations`);
    const items = (data as { invitations?: WorkspaceInvitation[] })?.invitations;
    return Array.isArray(items) ? items : [];
  },
  createInvitation: async (
    id: string,
    body: {
      email: string;
      role?: 'admin' | 'member' | 'guest';
      can_create_apps?: boolean;
      can_create_tracks?: boolean;
      message?: string;
    },
  ) => {
    const { data } = await apiClient.post(
      `/workspaces/${id}/invitations`,
      body,
    );
    return data as {
      invitation: WorkspaceInvitation;
      acceptance_url: string;
    };
  },
  revokeInvitation: (id: string, invitationId: string) =>
    apiClient.delete(`/workspaces/${id}/invitations/${invitationId}`),

  getStorageUsage: async (id: string): Promise<WorkspaceStorageUsage> => {
    const { data } = await apiClient.get(`/workspaces/${id}/storage-usage`);
    const raw = (data as { usage?: WorkspaceStorageUsage })?.usage;
    if (!raw) {
      throw new Error('Storage usage response was empty');
    }
    return raw;
  },
  recalculateStorageUsage: async (
    id: string,
  ): Promise<WorkspaceStorageUsage> => {
    const { data } = await apiClient.post(
      `/workspaces/${id}/storage-usage/recalculate`,
    );
    const raw = (data as { usage?: WorkspaceStorageUsage })?.usage;
    if (!raw) {
      throw new Error('Storage usage recalc response was empty');
    }
    return raw;
  },
};

/**
 * Workspace-scope operational-model bundle summary (Phase D4/E1).
 *
 * Returned by ``GET /api/library/workspace-models`` — the filtered library
 * listing the workspace-creation picker (E2) uses to offer strict-init
 * templates. See ``backend/app/api/workspaces.py::list_workspace_operational_models``.
 */
export interface WorkspaceOperationalModelSummary {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version?: string;
}

/**
 * List library bundles authored at ``scope: workspace``. Used by the
 * WorkspaceSwitcher "create workspace" modal to offer pre-seeded templates.
 */
export async function listWorkspaceOperationalModels(): Promise<WorkspaceOperationalModelSummary[]> {
  const r = await apiClient.get<{ operational_models: WorkspaceOperationalModelSummary[] }>(
    '/library/workspace-models',
  );
  return r.data.operational_models ?? [];
}

/**
 * Parameters for creating a workspace, optionally seeded from a library
 * template bundle. ``operationalModelSlug`` maps to the backend's ``operational_model_slug``
 * field, which triggers strict-init provisioning from the named bundle.
 */
export interface CreateWorkspaceParams {
  name: string;
  kind: WorkspaceKind;
  operationalModelSlug?: string;
  description?: string;
  accent_color?: string;
  avatar_url?: string;
}

/** Map UI ``WorkspaceKind`` to the backend ``workspace_type`` field. */
function workspaceTypeForKind(kind: WorkspaceKind): string {
  return kind === 'personal' ? 'personal' : 'company';
}

/**
 * Create a workspace, optionally seeded from a workspace-scope library
 * bundle. When ``operationalModelSlug`` is provided the backend strict-init
 * provisions apps / tracks / operational models described by the bundle.
 *
 * The picker uses ``kind`` in the UI; POST body sends ``workspace_type``
 * so the backend can infer ``kind`` (same contract as ``workspacesApi.create``).
 */
export async function createWorkspaceFromOperationalModel(
  params: CreateWorkspaceParams,
): Promise<Workspace> {
  return workspacesApi.create({
    name: params.name,
    workspace_type: workspaceTypeForKind(params.kind),
    ...(params.operationalModelSlug ? { operational_model_slug: params.operationalModelSlug } : {}),
    ...(params.description ? { description: params.description } : {}),
    ...(params.accent_color ? { accent_color: params.accent_color } : {}),
    ...(params.avatar_url ? { avatar_url: params.avatar_url } : {}),
  });
}
