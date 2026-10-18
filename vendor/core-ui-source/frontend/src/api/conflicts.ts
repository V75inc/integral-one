/**
 * Phase 8 Plan 08-02 — frontend API client for /api/conflicts.
 *
 * Mirrors backend/app/models/nodes.py:617-638 Conflict shape +
 * backend/app/api/conflicts.py resolve endpoint.
 *
 * IMPORTANT: the resolution Literal follows the BACKEND set
 * (`kept_local` | `applied_external` | `merged`) per Phase 8 Research
 * Pitfall 3 — the ROADMAP misnomer set (acc[ept|] / merge_[custom]) is
 * NOT used here. The Vitest negative-case asserts no misnomer ever leaves
 * the frontend (T-08-02-T02 mitigation).
 *
 * Allowed backend resolution strings:
 *   - `kept_local`        — Conflict marked resolved; Entry NOT modified.
 *   - `applied_external`  — Entry overwritten with external_snapshot.
 *   - `merged`            — Conflict marked resolved; caller handled merge.
 */
import api from './client';

export type ConflictResolution = 'kept_local' | 'applied_external' | 'merged';

export interface ConflictResponse {
  id: string;
  connector_id: string;
  entry_id: string;
  local_snapshot: Record<string, unknown>;
  external_snapshot: Record<string, unknown>;
  detected_at: string | null;
  resolved_at: string | null;
  resolution: string;
  resolved_by: string | null;
  status: 'open' | 'resolved' | string;
}

export interface ConflictListResponse {
  conflicts: ConflictResponse[];
}

export interface ConflictResolveResponse {
  conflict_id: string;
  status: 'resolved';
  resolution: ConflictResolution;
}

export interface ListConflictsParams {
  connector_id?: string;
  status?: 'open' | 'resolved';
}

export const conflictsApi = {
  async list(params?: ListConflictsParams): Promise<ConflictListResponse> {
    const { data } = await api.get<ConflictListResponse>('/conflicts', {
      params,
    });
    return data;
  },
  async get(id: string): Promise<ConflictResponse> {
    const { data } = await api.get<{ conflict: ConflictResponse }>(
      `/conflicts/${id}`,
    );
    return data.conflict;
  },
  async resolve(
    id: string,
    resolution: ConflictResolution,
  ): Promise<ConflictResolveResponse> {
    const { data } = await api.post<ConflictResolveResponse>(
      `/conflicts/${id}/resolve`,
      { resolution },
    );
    return data;
  },
};
