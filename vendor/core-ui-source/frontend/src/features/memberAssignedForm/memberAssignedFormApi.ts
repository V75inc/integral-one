import apiClient from '../../api/client';
import { normalizeAttachment } from '../../api/attachments';
import type {
  PublicOnboardingPolicy,
  PublicSharedEntry,
  PublicTrackPayload,
} from '../../api/sharing';

function apiRoot(): string {
  const base = apiClient.defaults.baseURL || '/api';
  return String(base).replace(/\/$/, '');
}

/** Workspace member assigned-entry wizard (substrate: `/me/assigned-form`). */
export interface MemberAssignedFormContext extends PublicTrackPayload {
  entry: PublicSharedEntry;
  locked: boolean;
  workspace_id?: string;
}

function qs(entryId?: string): string {
  const id = entryId?.trim();
  return id ? `?entry=${encodeURIComponent(id)}` : '';
}

export const memberAssignedFormApi = {
  async load(entryId?: string): Promise<MemberAssignedFormContext> {
    const res = await apiClient.get(`/me/assigned-form${qs(entryId)}`);
    const data = res.data as MemberAssignedFormContext & { message?: string };
    return {
      track: data.track,
      entry_types: data.entry_types || [],
      views: [],
      public_permissions: {
        read_entries: false,
        create_entries: false,
        update_entries: !data.locked,
      },
      public_share_extensions: data.public_share_extensions,
      entry: data.entry,
      locked: Boolean(data.locked),
      workspace_id: data.workspace_id,
    };
  },

  async updateForm(
    body: {
      title?: string;
      body?: string;
      custom_fields?: Record<string, unknown>;
      expected_record_revision?: number;
      expected_schema_revision?: number;
    },
    entryId?: string,
  ): Promise<{ entry: PublicSharedEntry }> {
    const res = await apiClient.patch(`/me/assigned-form${qs(entryId)}`, body);
    return res.data as { entry: PublicSharedEntry };
  },

  async listPolicyDocuments(): Promise<{
    policies: PublicOnboardingPolicy[];
    extensions?: Record<string, string>;
  }> {
    const res = await apiClient.get('/me/assigned-form/policies');
    return res.data;
  },

  getPolicyDocumentUrl(policyEntryId: string): string {
    return `${apiRoot()}/me/assigned-form/policies/${encodeURIComponent(policyEntryId)}/document`;
  },

  getContractDocumentUrl(): string {
    return `${apiRoot()}/me/assigned-form/contract`;
  },

  async fetchContractBlob(
    cacheBust?: string | number,
    entryId?: string,
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (entryId?.trim()) {
      params.set('entry', entryId.trim());
    }
    if (cacheBust != null && cacheBust !== '') {
      params.set('v', String(cacheBust));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const resp = await apiClient.get(`/me/assigned-form/contract${suffix}`, {
      responseType: 'blob',
    });
    return resp.data as Blob;
  },

  async generateContract(
    options?: { force?: boolean; entryId?: string },
  ): Promise<{
    contract_status?: string;
    reused?: boolean;
    update_available?: boolean;
  }> {
    const params = new URLSearchParams();
    if (options?.force === true) {
      params.set('force', '1');
    }
    if (options?.entryId?.trim()) {
      params.set('entry', options.entryId.trim());
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.post(
      `/me/assigned-form/contract/generate${suffix}`,
    );
    return res.data;
  },

  async decideContract(
    body: {
      action: 'accept' | 'reject';
      signature_png?: string;
      reason?: string;
    },
    entryId?: string,
  ): Promise<unknown> {
    const res = await apiClient.post(
      `/me/assigned-form/contract/decision${qs(entryId)}`,
      body,
    );
    return res.data;
  },

  async uploadAttachment(
    file: File,
    options?: { fieldKey?: string; entryId?: string },
  ): Promise<{
    id: string;
    fieldValue?: string;
    filename?: string;
    mime_type?: string;
  }> {
    const form = new FormData();
    form.append('file', file);
    const params = new URLSearchParams();
    const fieldKey = options?.fieldKey?.trim();
    if (fieldKey) params.set('field_key', fieldKey);
    if (options?.entryId?.trim()) params.set('entry', options.entryId.trim());
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.post(`/me/assigned-form/attachments${q}`, form);
    const data = res.data as {
      attachment?: unknown;
      field_value?: string;
    };
    const att = normalizeAttachment(
      data?.attachment != null ? data.attachment : data,
    );
    const fieldValue = String(data?.field_value || '').trim();
    return {
      id: String(att.id || fieldValue || ''),
      fieldValue: fieldValue || undefined,
      filename: att.filename || file.name,
      mime_type: att.mime_type,
    };
  },
};
