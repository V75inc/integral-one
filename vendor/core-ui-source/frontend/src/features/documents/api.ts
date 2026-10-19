/**
 * Document Templates UI client (Core + document_templates bundle).
 *
 * Integral monolith exposes REST under /document-templates; commercial Core
 * routes through workspace tools declared on the bundle.
 */
import { appsApi } from '../../api/apps';
import { entriesApi } from '../../api/entries';
import { toolsApi } from '../../api/tools';
import { resolveInstalledPackageSlug } from './documentTemplatesRouting';

export type DocumentTemplateStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type DocumentVersionStatus = 'draft' | 'published' | 'superseded';

export interface DocumentFieldSpec {
  key: string;
  field_ref?: string;
  placeholder?: string;
  label: string;
  description?: string;
  category?: string;
  data_type?: string;
  module?: string;
  track_key?: string;
  track_id?: string;
  local_field_key?: string;
  context_key?: string;
  sample?: unknown;
  active?: boolean;
  source?: Record<string, unknown>;
  requires_role?: string;
}

export interface DocumentContextSpec {
  key: string;
  module?: string;
  label?: string;
  context_entry_types?: string[];
}

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  description?: string;
  module?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  module: string;
  document_type: string;
  category?: string;
  status: DocumentTemplateStatus;
  is_default?: boolean;
  current_version_id?: string;
  context_type: string;
  app_id?: string;
  track_id?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  status: DocumentVersionStatus | string;
  editor_document: Record<string, unknown>;
  token_metadata: { tokens?: Array<Record<string, unknown>> };
  required_inputs?: Array<Record<string, unknown>>;
  layout_id?: string;
  header_footer?: Record<string, unknown>;
  render_html?: string;
  checksum?: string;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentLayout {
  id: string;
  name: string;
  workspace_id?: string;
  header_html?: string;
  footer_html?: string;
  page_numbers?: boolean;
  page_size?: 'letter' | 'legal' | 'a4';
  margins?: Record<string, number>;
  logo_attachment_id?: string;
}

export interface GeneratedDocument {
  id: string;
  template_id: string;
  template_version_id: string;
  module?: string;
  context_type?: string;
  context_entry_id?: string;
  output_format?: string;
  attachment_id?: string;
  checksum?: string;
  generated_at?: string;
  status?: string;
}

async function callTool<T = Record<string, unknown>>(
  toolKey: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { output } = await toolsApi.call(toolKey, input);
  return output as T;
}

async function requireDocumentTemplatesAppId(): Promise<string> {
  const apps = await appsApi.list();
  const app = apps.find(
    a => resolveInstalledPackageSlug(a) === 'document_templates',
  );
  if (!app?.id) {
    throw new Error(
      'Install the Document Templates app in this workspace to manage templates.',
    );
  }
  return app.id;
}

async function trackIdForManifestKey(key: string): Promise<string> {
  const appId = await requireDocumentTemplatesAppId();
  const tracks = await appsApi.listTracks(appId);
  const match = tracks.find(t => String(t.template_id || '').trim() === key);
  if (!match?.id) {
    throw new Error(`Document Templates track "${key}" was not found.`);
  }
  return match.id;
}

function mapTemplate(row: Record<string, unknown> | null | undefined): DocumentTemplate {
  const r = row || {};
  return {
    id: String(r.id || ''),
    name: String(r.name || ''),
    module: String(r.module || r.consumer_module || ''),
    document_type: String(r.document_type || r.document_type_code || ''),
    status: (String(r.status || 'draft') as DocumentTemplateStatus) || 'draft',
    is_default: Boolean(r.is_default),
    current_version_id: String(r.current_version_id || ''),
    context_type: String(r.context_type || ''),
  };
}

function mapVersion(row: Record<string, unknown> | null | undefined): DocumentTemplateVersion {
  const r = row || {};
  const st = String(r.status || 'draft');
  const normStatus =
    st === 'published' ? 'published' : st === 'superseded' ? 'superseded' : 'draft';
  return {
    id: String(r.id || ''),
    template_id: String(r.template_id || ''),
    version_number: Number(r.version_number || 0),
    status: normStatus,
    editor_document: (r.editor_document as Record<string, unknown>) || {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    token_metadata: (r.token_metadata as DocumentTemplateVersion['token_metadata']) || {
      tokens: [],
    },
    required_inputs: (r.required_inputs as Array<Record<string, unknown>>) || [],
    layout_id: String(r.layout_id || ''),
    header_footer:
      r.header_footer && typeof r.header_footer === 'object'
        ? (r.header_footer as Record<string, unknown>)
        : {},
    checksum: String(r.checksum || ''),
    render_html: String(r.render_html || ''),
  };
}

async function resolveContextTypeFromTrackId(
  appId: string,
  trackId: string,
): Promise<string | undefined> {
  if (!trackId) return undefined;
  const tracks = await appsApi.listTracks(appId);
  const track = tracks.find(t => t.id === trackId);
  if (!track) return undefined;
  const key = String(track.template_id || '').trim();
  if (key) return key;
  return String(track.title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export const documentsApi = {
  listDocumentTypes: async (params?: { module?: string }) => {
    const data = await callTool<{ document_types?: Array<Record<string, unknown>> }>(
      'document_templates_list_document_types',
      {},
    );
    let rows = (data.document_types || []).map(dt => ({
      id: String(dt.id || ''),
      code: String(dt.code || ''),
      name: String(dt.name || dt.code || ''),
      description: String(dt.description || ''),
      module: String(dt.module || ''),
    }));
    if (params?.module) {
      const mod = params.module.toLowerCase();
      rows = rows.filter(r => !r.module || r.module.toLowerCase() === mod);
    }
    return { document_types: rows, total: rows.length };
  },

  createDocumentType: async (body: {
    code: string;
    name?: string;
    description?: string;
    module?: string;
  }) => {
    const trackId = await trackIdForManifestKey('document_types');
    const entry = await entriesApi.create({
      track_id: trackId,
      title: (body.name || body.code).trim(),
      type: 'document_type',
      custom_fields: {
        code: body.code.trim(),
        description: body.description?.trim() || '',
        consumer_module: body.module || 'hr_app',
      },
    });
    return {
      id: entry.id,
      code: body.code,
      name: body.name || body.code,
      description: body.description,
      module: body.module,
    } as DocumentType;
  },

  updateDocumentType: async (
    _typeId: string,
    _body: Partial<{ name: string; description: string; module: string }>,
  ) => {
    throw new Error('Update document type from the Document Types track for now.');
  },

  deleteDocumentType: async (typeId: string) => {
    await entriesApi.delete(typeId);
    return { ok: true, id: typeId };
  },

  listTemplates: async (params?: {
    module?: string;
    context?: string;
    document_type?: string;
    status?: string;
  }) => {
    const data = await callTool<{ templates?: Array<Record<string, unknown>> }>(
      'document_templates_list_active_templates',
      {
        consumer_module: params?.module,
        document_type: params?.document_type,
        context_type: params?.context,
        status: params?.status,
        all_statuses: true,
      },
    );
    const templates = (data.templates || []).map(mapTemplate);
    return { templates, total: templates.length };
  },

  createTemplate: async (body: {
    name: string;
    module?: string;
    document_type?: string;
    context_type?: string;
    category?: string;
    app_id?: string;
    track_id?: string;
    is_default?: boolean;
  }) => {
    const data = await callTool<{
      template?: Record<string, unknown>;
      draft_version?: Record<string, unknown>;
    }>('document_templates_create_template', {
      name: body.name,
      consumer_module: body.module,
      document_type_code: body.document_type,
      context_type: body.context_type || 'employee',
    });
    return mapTemplate(data.template);
  },

  getTemplate: async (templateId: string) => {
    const data = await callTool<{
      template?: Record<string, unknown>;
      draft_version?: Record<string, unknown>;
      current_version?: Record<string, unknown>;
    }>('document_templates_get_editor_state', { template_id: templateId });
    return {
      template: mapTemplate(data.template),
      current_version: data.current_version
        ? mapVersion(data.current_version)
        : null,
      draft_version: data.draft_version ? mapVersion(data.draft_version) : null,
    };
  },

  updateTemplate: async (
    templateId: string,
    body: Partial<{
      name: string;
      module: string;
      document_type: string;
      context_type: string;
      category: string;
      app_id: string;
      track_id: string;
      status: DocumentTemplateStatus;
      is_default: boolean;
    }>,
  ) => {
    const payload: Record<string, unknown> = { template_id: templateId };
    if (body.name !== undefined) payload.name = body.name;
    if (body.document_type !== undefined) {
      payload.document_type_code = body.document_type;
    }
    if (body.module !== undefined) payload.consumer_module = body.module;
    if (body.context_type !== undefined) payload.context_type = body.context_type;
    const data = await callTool<{ template?: Record<string, unknown> }>(
      'document_templates_update_template',
      payload,
    );
    return mapTemplate(data.template);
  },

  duplicateTemplate: async (_templateId: string) => {
    throw new Error('Duplicate template is not available on this server yet.');
  },

  archiveTemplate: async (templateId: string) => {
    const data = await callTool<{ template?: Record<string, unknown> }>(
      'document_templates_archive_template',
      { template_id: templateId },
    );
    return mapTemplate(data.template);
  },

  deleteTemplate: async (templateId: string) => {
    await documentsApi.archiveTemplate(templateId);
    return { ok: true, id: templateId };
  },

  listVersions: async (templateId: string) => {
    const data = await callTool<{
      versions?: Array<Record<string, unknown>>;
      draft_version?: Record<string, unknown>;
      current_version?: Record<string, unknown>;
    }>('document_templates_get_editor_state', { template_id: templateId });
    const raw = data.versions?.length
      ? data.versions
      : [data.draft_version, data.current_version].filter(Boolean);
    const versions = raw.map(row => mapVersion(row as Record<string, unknown>));
    return { versions, total: versions.length };
  },

  createVersionDraft: async (templateId: string) => {
    const data = await callTool<{ version?: Record<string, unknown> }>(
      'document_templates_ensure_draft_version',
      { template_id: templateId },
    );
    return mapVersion(data.version);
  },

  getVersion: async (_versionId: string) => {
    throw new Error('Open the template editor to view a version.');
  },

  updateVersion: async (
    versionId: string,
    body: Partial<{
      editor_document: Record<string, unknown>;
      token_metadata: Record<string, unknown>;
      required_inputs: Array<Record<string, unknown>>;
      layout_id: string;
      header_footer: Record<string, unknown>;
      render_html: string;
    }>,
  ) => {
    const data = await callTool<{ version?: Record<string, unknown> }>(
      'document_templates_save_version_draft',
      {
        version_id: versionId,
        editor_document: body.editor_document,
        token_metadata: body.token_metadata,
        required_inputs: body.required_inputs,
      },
    );
    return mapVersion(data.version);
  },

  publishVersion: async (versionId: string) => {
    const data = await callTool<{ version?: Record<string, unknown> }>(
      'document_templates_publish_version',
      { version_id: versionId },
    );
    return mapVersion(data.version);
  },

  restoreVersion: async (_versionId: string) => {
    throw new Error('Restore version is not available on this server yet.');
  },

  listFields: async (params?: {
    module?: string;
    context?: string;
    track_id?: string;
    q?: string;
  }) => {
    let context_type = params?.context;
    if (params?.track_id && params?.module) {
      const apps = await appsApi.list();
      const mod = String(params.module || '').toLowerCase();
      const app = apps.find(a => {
        const slug = resolveInstalledPackageSlug(a).toLowerCase();
        return slug === mod || a.id === params.module;
      });
      if (app?.id) {
        context_type =
          (await resolveContextTypeFromTrackId(app.id, params.track_id)) ||
          context_type;
      }
    }
    const data = await callTool<{
      fields?: DocumentFieldSpec[];
      tracks?: Array<{ track_key?: string; title?: string }>;
      context_type?: string;
    }>('document_templates_list_merge_fields', {
      consumer_module: params?.module,
      context_type,
      q: params?.q,
    });
    return {
      fields: data.fields || [],
      contexts: [] as DocumentContextSpec[],
      total: data.fields?.length || 0,
    };
  },

  rebuildFields: async () => ({ ok: true, modules: 0, fields: 0 }),

  preview: async (_body: Record<string, unknown>) => ({
    html: '<p>Preview is not available in this build. Publish and generate a document from HR to verify output.</p>',
    warnings: [] as string[],
    formatted: {} as Record<string, string>,
    values: {} as Record<string, unknown>,
    template_id: '',
    template_version_id: '',
    mode: 'placeholder',
  }),

  generate: async (_body: Record<string, unknown>): Promise<GeneratedDocument> => {
    throw new Error('Generate document is not wired on Core yet.');
  },

  listGenerated: async (_params?: {
    context_entry_id?: string;
    template_id?: string;
  }) => ({ documents: [] as GeneratedDocument[], total: 0 }),

  downloadUrl: (documentId: string) => `/documents/generated/${documentId}/download`,

  download: async (_documentId: string) => new Blob(),

  listLayouts: async () => {
    try {
      const trackId = await trackIdForManifestKey('layouts');
      const entries = await entriesApi.list({ track_id: trackId, limit: 200 });
      const layouts: DocumentLayout[] = entries.map(e => {
        const cf = e.custom_fields || {};
        return {
          id: e.id,
          name: e.title || e.id,
          page_size: (cf.page_size as DocumentLayout['page_size']) || 'letter',
          page_numbers: cf.page_numbers !== false,
          margins:
            cf.margins && typeof cf.margins === 'object'
              ? (cf.margins as Record<string, number>)
              : undefined,
          header_html: String(cf.header_html || ''),
          footer_html: String(cf.footer_html || ''),
        };
      });
      return { layouts, total: layouts.length };
    } catch {
      return { layouts: [], total: 0 };
    }
  },

  createLayout: async (body: {
    name: string;
    header_html?: string;
    footer_html?: string;
    page_size?: string;
    margins?: Record<string, number>;
    page_numbers?: boolean;
  }) => {
    const trackId = await trackIdForManifestKey('layouts');
    const entry = await entriesApi.create({
      track_id: trackId,
      title: body.name,
      type: 'layout',
      custom_fields: {
        header_html: body.header_html || '',
        footer_html: body.footer_html || '',
        page_size: body.page_size || 'letter',
        margins: body.margins,
        page_numbers: body.page_numbers !== false,
      },
    });
    return { id: entry.id, name: body.name } as DocumentLayout;
  },

  updateLayout: async (
    layoutId: string,
    body: Partial<{
      name: string;
      header_html: string;
      footer_html: string;
      page_size: string;
      margins: Record<string, number>;
      page_numbers: boolean;
    }>,
  ) => {
    await entriesApi.update(layoutId, {
      title: body.name,
      custom_fields: {
        header_html: body.header_html,
        footer_html: body.footer_html,
        page_size: body.page_size,
        margins: body.margins,
        page_numbers: body.page_numbers,
      },
    });
    return { id: layoutId, name: body.name || '' } as DocumentLayout;
  },
};
