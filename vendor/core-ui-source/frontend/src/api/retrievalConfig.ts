/**
 * Phase 8 Plan 08-04 — frontend API client for GET /api/retrieval/config.
 *
 * Mirrors backend/app/schemas/retrieval_config.py RetrievalConfigResponse —
 * the backend Pydantic boundary is the single source of truth (Pitfall 8
 * mitigation). The endpoint is READ-ONLY in v1.1 per Plan 08-04 locked
 * decision A1 — there is NO PATCH route, NO mutation client method.
 *
 * Backend reuses ``policy_engine.evaluate(action='audit_log.read', ...)``
 * per A7 — zero new PolicyAction members. The frontend doesn't care about
 * the policy gate; on deny the call surfaces a normal 403 envelope.
 *
 * Single-disclosure invariant (T-08-04-I01): RetrievalConfigResponse
 * contains EXACTLY the 4 fields the backend returns. NEVER add model
 * paths, vector dims, credentials, etc. — those are denied at the
 * backend Pydantic boundary (``extra='forbid'``) and the typed mirror
 * here enforces the same gate in the frontend.
 */
import api from './client';

export interface RetrievalConfigResponse {
  embedding_model_eager_load: boolean;
  retrieve_k_default: number;
  retrieve_top_n_default: number;
  embedding_store_backend: string;
}

export const retrievalConfigApi = {
  async get(): Promise<RetrievalConfigResponse> {
    const { data } = await api.get<RetrievalConfigResponse>(
      '/retrieval/config',
    );
    return data;
  },
};
