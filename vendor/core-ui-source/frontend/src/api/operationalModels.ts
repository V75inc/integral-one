import apiClient from './client';
import { unwrapResource } from './helpers';
import type { OperationalModelNode } from '../types';

export interface PackagePreviewItem {
  package_name: string;
  package_description?: string | null;
  entry_type_count: number;
  view_count: number;
  tag_count: number;
  validation_errors: string[];
}

export interface ImportPreviewResponse {
  packages: PackagePreviewItem[];
  archive_type: 'single' | 'archive';
}

export interface PackageRescanResponse {
  added: Array<Record<string, unknown>>;
  updated: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
  reconciled_removed: Array<Record<string, unknown>>;
}

export const operationalModelsApi = {
  rescanPackages: () =>
    apiClient
      .post<PackageRescanResponse>('/admin/packages/rescan', {})
      .then(r => r.data),
  list: async (): Promise<OperationalModelNode[]> => {
    const { data } = await apiClient.get('/operational-models');
    const list = (data as { operational_models?: OperationalModelNode[] })?.operational_models;
    return Array.isArray(list) ? list : [];
  },
  get: (id: string) =>
    apiClient
      .get(`/operational-models/${id}`)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  getAttachedForTrack: (trackId: string) =>
    apiClient
      .get(`/tracks/${trackId}/operational-model`)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  getAttachedForApp: (appId: string) =>
    apiClient
      .get(`/apps/${appId}/operational-model`)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  patchAttachedForTrack: (
    trackId: string,
    body: {
      entry_types?: Array<{ name: string; icon?: string; form_schema?: Record<string, unknown> }>;
      tags?: Array<{ name: string; color?: string }>;
      views?: Array<{ name: string; type?: string; config?: Record<string, unknown>; is_default?: boolean }>;
    }
  ) =>
    apiClient
      .patch(`/tracks/${trackId}/operational-model`, body)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  patchAttachedForApp: (
    appId: string,
    body: Record<string, unknown>
  ) =>
    apiClient
      .patch(`/apps/${appId}/operational-model`, body)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  mergeLibraryIntoTrack: (trackId: string, libraryOperationalModelId: string) =>
    apiClient
      .post(`/tracks/${trackId}/operational-model/merge-library`, {
        library_operational_model_id: libraryOperationalModelId
      })
      .then(r => r.data),

  mergeLibraryIntoApp: (appId: string, libraryOperationalModelId: string) =>
    apiClient
      .post(`/apps/${appId}/operational-model/merge-library`, {
        library_operational_model_id: libraryOperationalModelId
      })
      .then(r => r.data),

  // In-place customization: entry types
  addEntryTypeToTrackProfile: (trackId: string, params: {
    name: string;
    icon?: string;
    form_schema?: Record<string, unknown>;
  }) =>
    apiClient
      .post(`/tracks/${trackId}/operational-model/entry-types`, params)
      .then(r => r.data),

  removeEntryTypeFromTrackProfile: (trackId: string, entryTypeId: string) =>
    apiClient
      .delete(`/tracks/${trackId}/operational-model/entry-types/${entryTypeId}`)
      .then(r => r.data),

  // In-place customization: views
  addViewToTrackProfile: (trackId: string, params: {
    name: string;
    view_type?: string;
    type?: string;
    config?: Record<string, unknown>;
    is_default?: boolean;
  }) =>
    apiClient
      .post(`/tracks/${trackId}/operational-model/views`, params)
      .then(r => r.data),

  removeViewFromTrackProfile: (trackId: string, viewId: string) =>
    apiClient
      .delete(`/tracks/${trackId}/operational-model/views/${viewId}`)
      .then(r => r.data),

  // Detach and revert
  detachLibraryFromTrackProfile: (trackId: string) =>
    apiClient
      .post(`/tracks/${trackId}/operational-model/detach-library`)
      .then(r => r.data),

  revertTrackProfileCustomizations: (trackId: string) =>
    apiClient
      .post(`/tracks/${trackId}/operational-model/revert-customizations`)
      .then(r => r.data),

  // Derive library Operational Model
  deriveFromTrack: (trackId: string, params?: {
    name?: string;
    description?: string;
    version?: string;
    workspace_id?: string;
  }) =>
    apiClient
      .post(`/operational-models/from-track/${trackId}`, params || {})
      .then(r => r.data),

  deriveFromApp: (appId: string, params?: {
    name?: string;
    description?: string;
    version?: string;
    workspace_id?: string;
  }) =>
    apiClient
      .post(`/operational-models/from-app/${appId}`, params || {})
      .then(r => r.data),

  importPreview: (file: File, workspaceId: string): Promise<ImportPreviewResponse> => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post(`/operational-models/import?preview=true&workspace_id=${encodeURIComponent(workspaceId)}`, form, {
        headers: { 'X-Integral-Scope': `ws:${workspaceId}` }
      })
      .then(r => r.data as ImportPreviewResponse);
  },

  importPublish: (file: File, workspaceId: string): Promise<{ published?: number; operational_model?: OperationalModelNode }> => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post(`/operational-models/import?workspace_id=${encodeURIComponent(workspaceId)}`, form, {
        headers: { 'X-Integral-Scope': `ws:${workspaceId}` }
      })
      .then(r => r.data as { published?: number; operational_model?: OperationalModelNode });
  },

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/operational-models/${id}`).then(() => undefined)
};
