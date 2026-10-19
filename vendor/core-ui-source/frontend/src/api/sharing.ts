import apiClient from './client';
import type { InvitationGrantReceipt } from '../types';

// Shape of a row inside an access snapshot bucket.
export interface AccessRow {
  user_id: string;
  role: string;
  source?: string;
  source_type?: string;
  source_id?: string;
  excluded?: boolean;
  effective?: boolean;
}

export interface AccessSnapshot {
  resource_type: 'app' | 'track' | 'entry';
  resource_id: string;
  direct: AccessRow[];
  inherited: AccessRow[];
  excluded: { user_id: string; reason?: string | null }[];
  links: ShareLinkSummary[];
}

export interface ShareLinkSummary {
  id: string;
  role: string;
  created_at: string | null;
  created_by: string;
  expires_at: string | null;
  redemptions: number;
}

export interface MintShareLinkResult {
  share_link: {
    id: string;
    resource_type: string;
    resource_id: string;
    role: string;
    created_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    redemptions: number;
  };
  token: string;
}

export interface SharedWithMeBucket {
  workspace: {
    id: string;
    name: string;
    kind: string;
    accent_color: string;
  };
  apps: Array<{ id: string; name: string; role: string }>;
  tracks: Array<{ id: string; title: string; role: string }>;
  entries: Array<{
    id: string;
    title: string;
    role: string;
    track_id: string;
  }>;
}

export interface MyInvitation {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  email: string;
  invited_by_user_id: string;
  role: string;
  target_resource_type: string | null;
  target_resource_id: string | null;
  target_resource_role: string | null;
  status: string;
  message: string;
  created_at: string | null;
  expires_at: string | null;
}

export interface PublicEntryTypeFormSchema {
  base_fields?: Record<string, Record<string, unknown>>;
  fields?: Array<Record<string, unknown>>;
}

export interface PublicEntryType {
  id: string;
  name?: string;
  key?: string;
  fields?: Array<Record<string, unknown>>;
  form_schema?: PublicEntryTypeFormSchema;
}

export interface PublicViewConfig {
  id: string;
  name?: string;
  view_type?: string;
  type?: string;
  hidden?: boolean;
  config?: Record<string, unknown>;
  entry_type_keys?: string[];
  default_entry_type_key?: string;
  is_default?: boolean;
}

export interface PublicSharedEntry {
  id: string;
  title?: string;
  body?: string;
  type_id?: string;
  custom_fields?: Record<string, unknown>;
  record_revision?: number;
  schema_revision?: number;
  [key: string]: unknown;
}

export interface PublicOnboardingPolicy {
  id: string;
  title: string;
  description?: string;
  required_for_onboarding?: boolean;
  active?: boolean;
  sort_order?: number;
  document_attachment_id?: string | null;
  document_filename?: string | null;
  document_mime_type?: string | null;
}

export interface PublicTrackPayload {
  track: {
    id: string;
    title: string;
    purpose: string;
    icon: string;
    accent_color: string;
    operational_model_defaults?: { default_entry_type?: string };
    content_profile_defaults?: { default_entry_type?: string };
  };
  workspace?: {
    id: string;
    name: string;
    accent_color?: string;
    avatar_url?: string;
  } | null;
  public_permissions: Record<string, boolean>;
  public_share_extensions?: Record<string, string>;
  views: PublicViewConfig[];
  entry_types: PublicEntryType[];
}

type ResourceType = 'app' | 'track' | 'entry';

export const sharingApi = {
  async removeExclusion(
    rt: ResourceType,
    id: string,
    userIdToRestore: string
  ): Promise<void> {
    await apiClient.delete(`/${rt}s/${id}/exclusions/${userIdToRestore}`);
  },

  async revokeLink(shareLinkId: string): Promise<void> {
    await apiClient.delete(`/shares/${shareLinkId}`);
  },

  async listMyInvitations(): Promise<MyInvitation[]> {
    const res = await apiClient.get('/me/invitations');
    return res.data?.invitations || [];
  },

  async acceptMyInvitation(
    invitationId: string,
  ): Promise<{ invitation: MyInvitation; role: string | null; grant_receipt?: InvitationGrantReceipt; workspace?: { id: string; name: string } }> {
    const res = await apiClient.post(`/me/invitations/${invitationId}/accept`);
    return res.data;
  },

  async declineMyInvitation(invitationId: string): Promise<{ invitation: MyInvitation }> {
    const res = await apiClient.post(`/me/invitations/${invitationId}/decline`);
    return res.data;
  },

  // Public track sharing settings (authenticated)
  async getPublicTrackSettings(trackId: string): Promise<{
    enabled: boolean;
    token: string | null;
    public_permissions: Record<string, boolean>;
    /**
     * Where `public_permissions` came from. `manifest` means the App that
     * provisioned this track declared them — the toggles arrive pre-set to the
     * app author's intent rather than the generic defaults.
     */
    permissions_source?: 'link' | 'manifest' | 'default';
  }> {
    const res = await apiClient.get(`/tracks/${trackId}/public-share`);
    return res.data;
  },

  // Returns the same shape as getPublicTrackSettings, including
  // `permissions_source`, so a caller can refresh state from either.
  async updatePublicTrackSettings(
    trackId: string,
    enabled: boolean,
    publicPermissions: Record<string, boolean>
  ): Promise<{
    enabled: boolean;
    token: string | null;
    public_permissions: Record<string, boolean>;
  }> {
    const res = await apiClient.post(`/tracks/${trackId}/public-share`, {
      enabled,
      public_permissions: publicPermissions,
    });
    return res.data;
  },
};

function getApiBase(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.VITE_BACKEND_URL || '';
  if (base) return base.replace(/\/$/, '');
  return '';
}

export const publicSharingApi = {
  async getPublicTrack(token: string): Promise<PublicTrackPayload> {
    const resp = await fetch(`${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}`);
    if (resp.status !== 200) throw new Error('Shared track not found or unavailable');
    return resp.json();
  },

  async getPublicTrackEntry(
    token: string,
    entryId: string,
  ): Promise<{ entry: PublicSharedEntry }> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${encodeURIComponent(entryId)}`,
    );
    if (resp.status !== 200) throw new Error('Failed to load onboarding form');
    return resp.json();
  },

  async getPublicTrackEntries(token: string, q?: string, cursor?: string): Promise<{
    entries: PublicSharedEntry[];
    next_cursor: string | null;
    has_more: boolean;
    total?: number;
  }> {
    let url = `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries?limit=50`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error('Failed to load shared entries');
    return resp.json();
  },

  async getPublicTrackRelationOptions(
    token: string,
    entryTypeId: string,
    fieldKey: string
  ): Promise<{
    targets: Array<{ id: string; title: string; track_title?: string }>;
  }> {
    const url =
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/relation-options` +
      `?entry_type_id=${encodeURIComponent(entryTypeId)}&field_key=${encodeURIComponent(fieldKey)}`;
    const resp = await fetch(url);
    if (resp.status !== 200) return { targets: [] };
    return resp.json();
  },

  async createPublicEntry(
    token: string,
    body: { title: string; type_id: string; body?: string; custom_fields?: Record<string, unknown> }
  ): Promise<PublicSharedEntry> {
    const resp = await fetch(`${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || errData.detail || 'Failed to submit entry');
    }
    return resp.json();
  },

  async updatePublicEntry(
    token: string,
    entryId: string,
    body: {
      title?: string;
      body?: string;
      custom_fields?: Record<string, unknown>;
      expected_record_revision?: number;
      expected_schema_revision?: number;
    }
  ): Promise<PublicSharedEntry> {
    const resp = await fetch(`${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      const detail = (errData as { detail?: unknown }).detail;
      const message = (errData as { message?: unknown }).message;
      const detailText =
        typeof detail === 'string'
          ? detail
          : typeof message === 'string'
            ? message
            : '';
      throw new Error(detailText || 'Failed to update entry');
    }
    return resp.json();
  },

  async listOnboardingPolicies(token: string): Promise<{
    policies: PublicOnboardingPolicy[];
    extensions?: Record<string, string>;
  }> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/onboarding-policies`,
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(
        (errData as { message?: string }).message ||
          (errData as { detail?: string }).detail ||
          'Failed to load onboarding policies',
      );
    }
    return resp.json();
  },

  getOnboardingPolicyDocumentUrl(token: string, policyEntryId: string): string {
    return `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/onboarding-policies/${encodeURIComponent(policyEntryId)}/document`;
  },

  async listPublicEntryAttachments(
    token: string,
    entryId: string,
  ): Promise<{ attachments: Array<{ id: string; filename?: string }> }> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${encodeURIComponent(entryId)}/attachments`,
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(
        (errData as { message?: string }).message ||
          (errData as { detail?: string }).detail ||
          'Failed to list attachments',
      );
    }
    return resp.json();
  },

  async uploadPublicEntryAttachment(
    token: string,
    entryId: string,
    file: File,
    options?: { fieldKey?: string },
  ): Promise<{ id: string; filename?: string; mime_type?: string }> {
    const form = new FormData();
    form.append('file', file);
    const fieldKey = options?.fieldKey?.trim();
    const qs = fieldKey ? `?field_key=${encodeURIComponent(fieldKey)}` : '';
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${encodeURIComponent(entryId)}/attachments${qs}`,
      { method: 'POST', body: form },
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(
        (errData as { message?: string }).message ||
          (errData as { detail?: string }).detail ||
          'Failed to upload file',
      );
    }
    const data = await resp.json();
    const attachment = (data as { attachment?: Record<string, unknown> }).attachment || data;
    return {
      id: String(attachment.id || ''),
      filename: attachment.filename as string | undefined,
      mime_type: attachment.mime_type as string | undefined,
    };
  },

  async getPublicComments(token: string, entryId: string): Promise<{ comments: any[]; total: number }> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${entryId}/comments`
    );
    if (resp.status !== 200) throw new Error('Failed to load comments');
    return resp.json();
  },

  async createPublicComment(token: string, entryId: string, text: string): Promise<any> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${entryId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || errData.detail || 'Failed to post comment');
    }
    return resp.json();
  },

  async addPublicReaction(token: string, entryId: string, emoji: string): Promise<any> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${entryId}/reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      }
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || errData.detail || 'Failed to add reaction');
    }
    return resp.json();
  },

  async removePublicReaction(token: string, entryId: string, emoji: string): Promise<any> {
    const resp = await fetch(
      `${getApiBase()}/api/public-share/track/${encodeURIComponent(token)}/entries/${entryId}/reactions/${encodeURIComponent(emoji)}`,
      {
        method: 'DELETE',
      }
    );
    if (resp.status !== 200) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || errData.detail || 'Failed to remove reaction');
    }
    return resp.json();
  },
};
