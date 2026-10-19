import apiClient from './client';

export interface AdminOverview {
  total_users: number;
  active_users: number;
  inactive_users: number;
  platform_admins: number;
  personal_workspaces: number;
  organization_workspaces: number;
  total_apps: number;
  total_tracks: number;
}

export interface AdminUserListItem {
  id: string;
  user_id?: string | null;
  email: string;
  display_name: string;
  is_active: boolean;
  is_platform_admin: boolean;
  email_verified: boolean;
  created_at?: string | null;
  last_accessed?: string | null;
}

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_previous: boolean;
  has_next: boolean;
}

export interface AdminUserDetail {
  id: string;
  user_id?: string | null;
  email: string;
  display_name: string;
  avatar_url?: string;
  is_active: boolean;
  is_platform_admin: boolean;
  roles: string[];
  email_verified: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed?: string | null;
  org_memberships: Array<{ workspace_id: string; name: string; role: string }>;
  personal_workspaces: Array<{
    workspace_id: string;
    name: string;
    app_count: number;
    track_count: number;
  }>;
}

export interface AdminDeletionPreview {
  can_delete: boolean;
  can_force_delete: boolean;
  email: string;
  blockers: Array<{ code: string; message: string }>;
  personal_workspaces: AdminUserDetail['personal_workspaces'];
  org_memberships: AdminUserDetail['org_memberships'];
  impact: string[];
  target_user_id: string;
  target_display_name: string;
}

export interface AdminOwnerSummary {
  id: string;
  display_name: string;
  email: string;
}

export interface AdminWorkspaceListItem {
  id: string;
  kind: string;
  name: string;
  workspace_type: string;
  member_count: number;
  app_count: number;
  track_count: number;
  created_at?: string | null;
  owner?: AdminOwnerSummary | null;
}

export interface AdminWorkspaceListResponse {
  workspaces: AdminWorkspaceListItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_previous: boolean;
  has_next: boolean;
}

export interface AdminWorkspaceDetail {
  id: string;
  kind: string;
  name: string;
  workspace_type: string;
  description: string;
  member_count: number;
  app_count: number;
  track_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  owner?: AdminOwnerSummary | null;
}

export interface AdminResourceListItem {
  id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  created_at?: string | null;
  owner?: AdminOwnerSummary | null;
}

export interface AdminResourceDetail {
  id: string;
  resource_type: 'app' | 'track';
  name: string;
  workspace_id: string;
  workspace_name: string;
  visibility: string;
  owner_id?: string | null;
  owner?: AdminOwnerSummary | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminResourceListResponse {
  items: AdminResourceListItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_previous: boolean;
  has_next: boolean;
}

export interface AdminMemberListItem {
  id: string;
  user_id?: string | null;
  email: string;
  display_name: string;
  role: string;
}

export interface AdminMemberListResponse {
  members: AdminMemberListItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_previous: boolean;
  has_next: boolean;
}

export const adminApi = {
  async getOverview(): Promise<AdminOverview> {
    const { data } = await apiClient.get('/admin/overview');
    return data;
  },

  async listUsers(params: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    platform_admin?: boolean;
  } = {}): Promise<AdminUserListResponse> {
    const { data } = await apiClient.get('/admin/users', { params });
    return data;
  },

  async getUser(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.get(`/admin/users/${userId}`);
    return data.user;
  },

  async updateUser(
    userId: string,
    body: {
      display_name?: string;
      email_verified?: boolean;
      roles?: string[];
      password?: string;
    },
  ): Promise<AdminUserDetail> {
    const { data } = await apiClient.patch(`/admin/users/${userId}`, body);
    return data.user;
  },

  async deactivateUser(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`/admin/users/${userId}/deactivate`);
    return data.user;
  },

  async reactivateUser(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`/admin/users/${userId}/reactivate`);
    return data.user;
  },

  async promoteAdmin(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`/admin/users/${userId}/promote-admin`);
    return data.user;
  },

  async demoteAdmin(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`/admin/users/${userId}/demote-admin`);
    return data.user;
  },

  async getDeletionPreview(userId: string): Promise<AdminDeletionPreview> {
    const { data } = await apiClient.get(`/admin/users/${userId}/deletion-preview`);
    return data;
  },

  async deleteUser(userId: string, confirmEmail: string, force = false): Promise<void> {
    await apiClient.post(`/admin/users/${userId}/delete`, {
      confirm_email: confirmEmail,
      force,
    });
  },

  async sendPasswordReset(userId: string): Promise<{ message: string; email: string }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/send-password-reset`);
    return data;
  },

  async listWorkspaces(params: {
    page?: number;
    per_page?: number;
    search?: string;
    kind?: 'personal' | 'organization';
  } = {}): Promise<AdminWorkspaceListResponse> {
    const { data } = await apiClient.get('/admin/workspaces', { params });
    return data;
  },

  async getWorkspace(workspaceId: string): Promise<AdminWorkspaceDetail> {
    const { data } = await apiClient.get(`/admin/workspaces/${workspaceId}`);
    return data.workspace;
  },

  async updateWorkspace(
    workspaceId: string,
    body: { name?: string; description?: string; workspace_type?: string },
  ): Promise<AdminWorkspaceDetail> {
    const { data } = await apiClient.patch(`/admin/workspaces/${workspaceId}`, body);
    return data.workspace;
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await apiClient.delete(`/admin/workspaces/${workspaceId}`);
  },

  async listWorkspaceMembers(
    workspaceId: string,
    params: { page?: number; per_page?: number; search?: string } = {},
  ): Promise<AdminMemberListResponse> {
    const { data } = await apiClient.get(
      `/admin/workspaces/${workspaceId}/members`,
      { params },
    );
    return data;
  },

  async listApps(params: {
    page?: number;
    per_page?: number;
    search?: string;
    workspace_id?: string;
  } = {}): Promise<AdminResourceListResponse> {
    const { data } = await apiClient.get('/admin/apps', { params });
    return data;
  },

  async listTracks(params: {
    page?: number;
    per_page?: number;
    search?: string;
    workspace_id?: string;
  } = {}): Promise<AdminResourceListResponse> {
    const { data } = await apiClient.get('/admin/tracks', { params });
    return data;
  },

  async getApp(appId: string): Promise<AdminResourceDetail> {
    const { data } = await apiClient.get(`/admin/apps/${appId}`);
    return data.resource;
  },

  async getTrack(trackId: string): Promise<AdminResourceDetail> {
    const { data } = await apiClient.get(`/admin/tracks/${trackId}`);
    return data.resource;
  },
};
