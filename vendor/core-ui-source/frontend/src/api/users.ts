import apiClient from './client';
import { toArr } from './helpers';
import type { User } from '../types';

/** Server-authoritative active workspace scope (mirrors backend
 *  ``GET /users/me/scope``). The frontend hydrates from this at boot
 *  and writes to ``PUT /users/me/scope`` on every workspace switch so
 *  the canonical state persists across devices, private-mode sessions,
 *  and DB purges. localStorage is a render-time cache only. */
export interface MyScope {
  active_workspace_id: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    kind: string;
    accent_color: string;
  }>;
}

export interface AvatarVariant {
  size: number;
  attachment_id: string;
}

export interface AvatarUploadResponse {
  avatar_attachment_id: string;
  variants: AvatarVariant[];
  updated_at: string;
}

export interface AccountDeletionBlockerResource {
  type: string;
  id: string;
  title: string;
}

export interface AccountDeletionBlocker {
  code: string;
  message: string;
  resources?: AccountDeletionBlockerResource[];
  workspace_id?: string | null;
  workspace_name?: string | null;
}

export interface AccountDeletionPreview {
  can_delete: boolean;
  email: string;
  blockers: AccountDeletionBlocker[];
  personal_workspaces: Array<{
    workspace_id: string;
    name: string;
    app_count: number;
    track_count: number;
  }>;
  org_memberships: Array<{
    workspace_id: string;
    name: string;
    role: string;
  }>;
  impact: string[];
}

export const usersApi = {
  list: async (params?: {
    page?: number;
    per_page?: number;
    search?: string;
  }): Promise<{ users: User[]; total: number }> => {
    const { data } = await apiClient.get('/users', { params });
    const users = toArr(data) as User[];
    const total =
      typeof (data as { total?: number })?.total === 'number'
        ? (data as { total: number }).total
        : users.length;
    return { users, total };
  },
  /** Phase 9 Plan 09-01 (AVT-01). Multipart upload of a square PNG/JPEG/WebP
   *  image. Backend resizes to 32/64/128/256 PNG variants, sets the
   *  canonical 128px variant on ``User.avatar_attachment_id``, and emits
   *  a single ``user.update`` ChangeEvent. */
  uploadAvatar: async (
    userId: string,
    file: File,
  ): Promise<AvatarUploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post(
      `/users/${encodeURIComponent(userId)}/avatar`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data as AvatarUploadResponse;
  },
  /** Fetch the server-authoritative active workspace + the list of
   *  workspaces the user belongs to. Call at session boot before any
   *  scope-dependent query fires.
   *
   *  We explicitly drop ``X-Integral-Scope`` from this call. The header
   *  is set from localStorage (a render-time cache), but this endpoint IS
   *  the authority — sending the cached value would let a stale localStorage
   *  entry override the server's stored preference (the backend validates
   *  membership, which always passes for the user's own Personal workspace,
   *  so it would silently confirm the wrong scope). The backend also applies
   *  ``skip_header=True`` as defence-in-depth, but stripping here keeps the
   *  intent explicit end-to-end. */
  getMyScope: async (): Promise<MyScope> => {
    const { data } = await apiClient.get('/users/me/scope', {
      headers: { 'X-Integral-Scope': '' },
    });
    return data as MyScope;
  },
  /** Persist the user's active workspace to the server. Server validates
   *  membership and refuses workspaces the user does not belong to. */
  setMyScope: async (workspaceId: string): Promise<{ active_workspace_id: string }> => {
    const { data } = await apiClient.put('/users/me/scope', {
      workspace_id: workspaceId,
    });
    return data as { active_workspace_id: string };
  },
  /** Pre-flight impact summary and blockers for self-service account deletion. */
  getAccountDeletionPreview: async (): Promise<AccountDeletionPreview> => {
    const { data } = await apiClient.get('/users/me/account-deletion-preview');
    return data as AccountDeletionPreview;
  },
  /** Permanently delete the caller's account (requires email confirmation). */
  deleteAccount: async (
    userId: string,
    confirmEmail: string,
  ): Promise<{ message: string; deleted_user_id: string }> => {
    const { data } = await apiClient.delete(`/users/${encodeURIComponent(userId)}`, {
      data: { confirm_email: confirmEmail },
    });
    return data as { message: string; deleted_user_id: string };
  },
};
