import api from './client';

export type SkillSource = 'core' | 'app' | 'workspace';

export interface SkillSummary {
  id: string;
  source: SkillSource;
  read_only: boolean;
  key: string;
  name: string;
  description: string;
  kind: string;
  app_id?: string;
  app_slug?: string;
  namespaced_name?: string;
  origin?: string;
  enabled: boolean;
  customized: boolean;
  stale_default: boolean;
  private?: boolean;
  trust_tier?: string;
  tools_required: string[];
  customized_at?: string | null;
  customized_by?: string | null;
}

export interface SkillComplianceWarning {
  code: string;
  message: string;
}

export interface SkillDetail extends SkillSummary {
  resolved_body: string;
  domain_body?: string;
  bundle_default_body?: string;
  prompt_template_ref?: string | null;
  handler_ref?: string | null;
  warnings?: SkillComplianceWarning[];
}

export interface SkillListResponse {
  core: SkillSummary[];
  apps: SkillSummary[];
  workspace: SkillSummary[];
  total: number;
}

export interface ToolCatalogueEntry {
  name: string;
  friendly_label: string;
  description: string;
  param_summary: string;
}

export interface EffectiveSkillEntry {
  id: string;
  key: string;
  name: string;
  description: string;
  source: SkillSource;
  app_id?: string | null;
  app_name?: string | null;
  state: 'available' | 'offer_first' | 'paused' | 'unavailable';
  reason?: string | null;
  tools_required: string[];
}

export interface EffectiveSkillContext {
  workspace_id: string;
  focused_app_id?: string | null;
  apps: Array<{ id: string; name: string }>;
  skills: EffectiveSkillEntry[];
  tools: Array<{ name: string; description: string; source: 'core' | 'workspace' }>;
}

export interface SkillCreateBody {
  key: string;
  name: string;
  description?: string;
  body_override: string;
  tools_required?: string[];
}

export interface SkillUpdateBody {
  name?: string;
  description?: string;
  body_override?: string;
  tools_required?: string[];
  enabled?: boolean;
}

export const skillsApi = {
  async list(): Promise<SkillListResponse> {
    const res = await api.get('/agentive/skills');
    return res.data;
  },

  async get(id: string): Promise<SkillDetail> {
    const res = await api.get(`/agentive/skills/${encodeURIComponent(id)}`);
    return res.data;
  },

  async create(body: SkillCreateBody): Promise<SkillDetail> {
    const res = await api.post('/agentive/skills', body);
    return res.data;
  },

  async update(id: string, body: SkillUpdateBody): Promise<SkillDetail> {
    const res = await api.patch(`/agentive/skills/${encodeURIComponent(id)}`, body);
    return res.data;
  },

  async reset(id: string): Promise<SkillDetail> {
    const res = await api.post(`/agentive/skills/${encodeURIComponent(id)}/reset`);
    return res.data;
  },

  async remove(id: string): Promise<{ ok: boolean; id: string }> {
    const res = await api.delete(`/agentive/skills/${encodeURIComponent(id)}`);
    return res.data;
  },

  async toolCatalogue(): Promise<{ tools: ToolCatalogueEntry[]; total: number }> {
    const res = await api.get('/agentive/skills/tool-catalogue');
    return res.data;
  },

  async effective(focusedAppId?: string | null): Promise<EffectiveSkillContext> {
    const res = await api.get('/agentive/skills/effective', {
      params: focusedAppId ? { focused_app_id: focusedAppId } : {},
    });
    return res.data;
  },
};
