import apiClient from './client';
import { unwrapResource } from './helpers';
import type { OperationalModelNode, App, Track } from '../types';

export interface BatchInstallEntry {
  library_cp_id: string;
  app_id?: string | null;
  name?: string | null;
  status?: string | null;
  reason?: string | null;
  error?: string | null;
  error_code?: string | null;
  details?: Record<string, unknown> | null;
  install_token?: string | null;
  settings_schema?: Record<string, unknown> | null;
}

export interface BatchInstallResponse {
  installed: BatchInstallEntry[];
  skipped: BatchInstallEntry[];
  failed: BatchInstallEntry[];
  order?: string[];
}

export interface UninstallBlockingDependent {
  app_id: string;
  app_name?: string;
  dep_key?: string;
}

export interface UninstallBlockingReference {
  source_app_id: string;
  source_app_name?: string;
  source_entry_id?: string;
  source_track_id?: string;
  relation_field_key?: string;
}

export interface UninstallPreflightResponse {
  app_id: string;
  can_uninstall: boolean;
  blocking_dependents: UninstallBlockingDependent[];
  blocking_references: UninstallBlockingReference[];
  entry_count: number;
  requires_data_confirmation: boolean;
}

/** Accepted durable lifecycle operation. Completion is observed asynchronously. */
export interface LifecycleWorkResponse {
  status: 'queued';
  work_item_id: string;
}

/** Legacy synchronous lifecycle response retained for older server versions. */
export interface CompletedUninstallResponse {
  status: 'uninstalled';
  app_id: string;
}

export type UninstallResponse = LifecycleWorkResponse | CompletedUninstallResponse;

export type FinalizeInstallResponse =
  | LifecycleWorkResponse
  | {
      status: 'active';
      app_id: string;
      installed_at?: string;
    };

export interface AppSettingsResponse {
  app_id: string;
  settings: Record<string, unknown>;
  settings_schema: Record<string, unknown>;
  lifecycle_state?: string;
}

export const appsApi = {
  list: async (): Promise<App[]> => {
    const { data } = await apiClient.get('/apps');
    const apps = (data as { apps?: App[] })?.apps;
    return Array.isArray(apps) ? apps : [];
  },
  create: (body: {
    name: string;
    description?: string;
    workspace_id?: string;
    visibility?: string;
    library_operational_model_id?: string;
    accent_color?: string;
    icon?: string;
    include_seed_data?: boolean;
  }) =>
    apiClient
      .post('/apps', body)
      .then(r => unwrapResource<App>(r.data, 'app')),
  get: (id: string) =>
    apiClient
      .get(`/apps/${id}`)
      .then(r => unwrapResource<App>(r.data, 'app')),
  update: (
    id: string,
    body: {
      name?: string;
      description?: string;
      workspace_id?: string | null;
      visibility?: string;
      accent_color?: string;
      icon?: string;
    }
  ) =>
    apiClient
      .put(`/apps/${id}`, body)
      .then(r => unwrapResource<App>(r.data, 'app')),
  updateFromLibrary: (appId: string) =>
    apiClient
      .post<LifecycleWorkResponse>(`/apps/${appId}/update-from-library`, {})
      .then(r => r.data),
  delete: (id: string) => apiClient.delete(`/apps/${id}`),
  listTracks: async (appId: string): Promise<Track[]> => {
    const { data } = await apiClient.get(`/apps/${appId}/tracks`);
    const tracks = (data as { tracks?: Track[] })?.tracks;
    return Array.isArray(tracks) ? tracks : [];
  },
  addTrack: (appId: string, track_id: string) =>
    apiClient.post(`/apps/${appId}/tracks`, { track_id }),
  removeTrack: (appId: string, trackId: string) =>
    apiClient.delete(`/apps/${appId}/tracks/${trackId}`),
  /**
   * Phase 34 — persist the display order of Tracks under an App.
   * Backend writes the new positions onto the App-CONTAINS-Track edges
   * so subsequent `listTracks` calls return them in the same order.
   */
  reorderTracks: (appId: string, trackIds: string[]) =>
    apiClient.patch(`/apps/${appId}/tracks/order`, { track_ids: trackIds }),
  listCollaborators: async (appId: string) => {
    return (await appsApi.getCollaboratorsDetailed(appId)).collaborators;
  },
  getCollaboratorsDetailed: async (appId: string): Promise<{
    collaborators: unknown[];
    total?: number;
    effective_total?: number;
    caller_role?: string | null;
    directory_visible?: boolean;
  }> => {
    const { data } = await apiClient.get(`/apps/${appId}/collaborators`);
    return {
      ...data,
      collaborators: Array.isArray(data?.collaborators) ? data.collaborators : [],
    };
  },
  addCollaborator: (
    appId: string,
    body: { collaborator_user_id: string; role?: string }
  ) =>
    apiClient.post(`/apps/${appId}/collaborators`, {
      collaborator_user_id: body.collaborator_user_id,
      role: body.role || 'editor',
    }),
  removeCollaborator: (appId: string, userId: string) =>
    apiClient.delete(`/apps/${appId}/collaborators/${userId}`),
  /** Update an existing direct collaborator's role on an App. Owner-only.
   *  Accepts ``admin | editor | commenter | viewer``. */
  updateCollaboratorRole: (
    appId: string,
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) =>
    apiClient.patch(`/apps/${appId}/collaborators/${userId}`, { role }),

  transferOwnership: (appId: string, new_owner_user_id: string) =>
    apiClient
      .post(`/apps/${appId}/transfer-ownership`, {
        new_owner_user_id,
      })
      .then(r => r.data as { proposal_id: string; status: string; revision: number }),

  getOperationalModel: (appId: string) =>
    apiClient
      .get(`/apps/${appId}/operational-model`)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  patchOperationalModel: (
    appId: string,
    body: {
      name?: string;
      description?: string;
      version?: string;
      manifest?: Record<string, unknown>;
    }
  ) =>
    apiClient
      .patch(`/apps/${appId}/operational-model`, body)
      .then(r => unwrapResource<OperationalModelNode>(r.data, 'operational_model')),

  mergeLibraryIntoApp: (appId: string, library_operational_model_id: string) =>
    apiClient.post(`/apps/${appId}/operational-model/merge-library`, {
      library_operational_model_id,
    }),

  /**
   * Phase 32 — batch install N library bundles in topological dep order.
   * Each item's `name` + `description` default to the bundle manifest's
   * `package.name` + `package.description` when omitted.
   */
  batchInstall: async (
    items: Array<{
      library_cp_id: string;
      name?: string;
      description?: string;
      settings?: Record<string, unknown>;
      include_seed_data?: boolean;
    }>,
    options?: { include_seed_data?: boolean },
  ): Promise<BatchInstallResponse> => {
    const globalIncludeSeeds = options?.include_seed_data;
    const payload = {
      items: items.map(item => ({
        ...item,
        include_seed_data:
          item.include_seed_data ?? globalIncludeSeeds ?? true,
      })),
    };
    // Installing several schemas, hooks and seed records can exceed the
    // ordinary read deadline. A timeout is an unknown write outcome, never
    // an instruction to replay this request automatically.
    const { data } = await apiClient.post('/apps/batch-install', payload, {
      timeout: 120_000,
    });
    return data as BatchInstallResponse;
  },

  listTrackTemplates: async (appId: string): Promise<OperationalModelNode[]> => {
    const { data } = await apiClient.get(
      `/apps/${appId}/operational-model/track-templates`
    );
    const list = (data as { track_templates?: OperationalModelNode[] })
      ?.track_templates;
    return Array.isArray(list) ? list : [];
  },

  createTrackTemplate: (
    appId: string,
    body: { name: string; description?: string }
  ) =>
    apiClient
      .post(`/apps/${appId}/operational-model/track-templates`, body)
      .then(r =>
        unwrapResource<OperationalModelNode>(r.data, 'track_template')
      ),

  deleteTrackTemplate: (appId: string, templateId: string) =>
    apiClient.delete(
      `/apps/${appId}/operational-model/track-templates/${templateId}`
    ),

  applyTrackTemplateToTrack: (
    appId: string,
    templateId: string,
    track_id: string
  ) =>
    apiClient.post(
      `/apps/${appId}/operational-model/track-templates/${templateId}/apply-to-track`,
      { track_id }
    ),

  uninstallPreflight: (appId: string) =>
    apiClient
      .get<UninstallPreflightResponse>(`/apps/${appId}/uninstall-preflight`)
      .then(r => r.data),

  uninstall: (appId: string) =>
    apiClient
      .post<UninstallResponse>(
        `/apps/${appId}/uninstall`,
        // uninstall_app_endpoint has archive as a typed param, which
        // jvspatial's @endpoint turns into an auto-generated request-body
        // model — a bodyless POST fails validation with "Field required".
        {},
      )
      .then(r => r.data),

  finalizeInstall: (
    appId: string,
    body: { install_token: string; settings: Record<string, unknown> },
  ) =>
    apiClient
      .post<FinalizeInstallResponse>(`/apps/${appId}/install/settings`, body)
      .then(r => r.data),

  getAppSettings: (appId: string) =>
    apiClient
      .get<AppSettingsResponse>(`/apps/${appId}/settings`)
      .then(r => r.data),

  updateAppSettings: (appId: string, settings: Record<string, unknown>) =>
    apiClient
      .patch<AppSettingsResponse>(`/apps/${appId}/settings`, { settings })
      .then(r => r.data),
};
