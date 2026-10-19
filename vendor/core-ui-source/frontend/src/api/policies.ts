/**
 * Phase 8 Plan 08-01 — frontend API client for /api/policies.
 *
 * Mirrors `backend/app/schemas/policy.py` PolicyCreate / PolicyUpdate /
 * PolicyResponse shapes (Phase 3 Plan 03-03). Hand-mirrored per
 * `approvals.ts` idiom — single source of truth is the backend
 * Pydantic boundary.
 *
 * Mutation surfaces:
 *   GET    /api/policies            -> PolicyResponse[]
 *   GET    /api/policies/{id}       -> PolicyResponse
 *   POST   /api/policies            -> PolicyResponse (201)
 *   PATCH  /api/policies/{id}       -> PolicyResponse
 *   DELETE /api/policies/{id}       -> 204
 *
 * NOTE: `created_by` is INTENTIONALLY absent from PolicyCreate per backend
 * T-03-03-T01 spoofing mitigation — the backend derives the principal from
 * the authenticated JWT. The frontend MUST NEVER include `created_by` in any
 * request body; `subject_kind` / `subject_id` are absent from PolicyUpdate
 * per backend policies.py L277-279 (re-targeting requires delete + recreate).
 */
import api from './client';

// ── Wire types (mirror backend/app/schemas/policy.py) ──────────────────

export type ActorKind = 'human' | 'agent' | 'connector' | 'system';

export interface PolicyResponse {
  id: string;
  subject_kind: ActorKind;
  subject_id: string;
  scope: string;
  actions: string[];
  entry_types: string[];
  tags: string[];
  requires_human_approval: boolean;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

/**
 * POST /api/policies body — mirrors backend PolicyCreate.
 *
 * `subject_id` is the only required field (default `subject_kind='agent'`,
 * default `scope='*'`, default empty lists/false booleans). `created_by` is
 * intentionally absent — backend resolve_principal_id derives it.
 */
export interface PolicyCreate {
  subject_kind?: ActorKind;
  subject_id: string;
  scope?: string;
  actions?: string[];
  entry_types?: string[];
  tags?: string[];
  requires_human_approval?: boolean;
  is_active?: boolean;
}

/**
 * PATCH /api/policies/{id} body — mirrors backend PolicyUpdate.
 *
 * `subject_kind` / `subject_id` / `created_by` are intentionally absent
 * (re-targeting requires delete + recreate).
 */
export interface PolicyUpdate {
  scope?: string;
  actions?: string[];
  entry_types?: string[];
  tags?: string[];
  requires_human_approval?: boolean;
  is_active?: boolean;
}

export interface ListPoliciesParams {
  subject_kind?: ActorKind;
  subject_id?: string;
}

export interface ExplainActionRequest {
  subject_kind?: ActorKind;
  subject_id: string;
  action: string;
  resource_kind: string;
  resource_id: string;
  resource_scope: string;
  entry_type?: string | null;
  tags?: string[];
  operation_key?: string | null;
  app_id?: string | null;
}

export interface ExplainActionResponse {
  allowed: boolean;
  reason: string;
  matched_policy_id: string | null;
  policy_chain: string[];
  approval_id: string | null;
  operation_key: string | null;
  access_snapshot: Record<string, unknown> | null;
}

export const policiesApi = {
  async list(params?: ListPoliciesParams): Promise<PolicyResponse[]> {
    const { data } = await api.get<PolicyResponse[]>('/policies', { params });
    return data;
  },
  async get(id: string): Promise<PolicyResponse> {
    const { data } = await api.get<PolicyResponse>(`/policies/${id}`);
    return data;
  },
  async create(body: PolicyCreate): Promise<PolicyResponse> {
    const { data } = await api.post<PolicyResponse>('/policies', body);
    return data;
  },
  async patch(id: string, body: PolicyUpdate): Promise<PolicyResponse> {
    const { data } = await api.patch<PolicyResponse>(`/policies/${id}`, body);
    return data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/policies/${id}`);
  },
  async explain(body: ExplainActionRequest): Promise<ExplainActionResponse> {
    const { data } = await api.post<ExplainActionResponse>('/policies/explain', body);
    return data;
  },
};
