/**
 * Phase 7 Plan 07-04 — frontend API client for the approval review surface.
 *
 * Mirrors `backend/app/schemas/approvals.py` shapes (9-field + audit
 * timestamps) and the 3 REST endpoints:
 *
 *   GET  /api/approvals             -> ApprovalListResponse
 *   POST /api/approvals/:id/approve -> ApprovalDecisionResponse
 *   POST /api/approvals/:id/reject  -> ApprovalDecisionResponse
 *
 * Hand-mirrored types — no generated code, no schema bundler. Single
 * source of truth is the backend Pydantic boundary.
 */

import api from './client';

// ── Wire types (mirror backend/app/schemas/approvals.py) ───────────────

export type ActorKind = 'human' | 'agent' | 'connector' | 'system';

/** Mirrors backend PolicyAction Literal — frontend uses string for tolerance.
 *  Backend boundary still enforces the Literal at the API edge. */
export type PolicyAction = string;

export interface ApprovalResponse {
  id: string;
  actor_kind: ActorKind;
  actor_id: string;
  action: PolicyAction;
  resource_kind: string;
  resource_id: string;
  payload: Record<string, unknown>;
  policy_id: string;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  decided_at: string | null;
  decider_id: string | null;
}

export interface ApprovalListResponse {
  approvals: ApprovalResponse[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ApprovalDecisionResponse {
  approval_id: string;
  status: 'approved' | 'rejected';
  result: Record<string, unknown> | null;
}

export interface ListApprovalsParams {
  policy_id?: string;
  actor_kind?: ActorKind;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  scope?: string;
}

// ── Endpoints ────────────────────────────────────────────────

export async function listApprovals(
  params: ListApprovalsParams = {},
): Promise<ApprovalListResponse> {
  const res = await api.get('/approvals', { params });
  return res.data as ApprovalListResponse;
}

export async function approveApproval(
  id: string,
): Promise<ApprovalDecisionResponse> {
  const res = await api.post(`/approvals/${id}/approve`);
  return res.data as ApprovalDecisionResponse;
}

export async function rejectApproval(
  id: string,
  reason?: string,
): Promise<ApprovalDecisionResponse> {
  const res = await api.post(`/approvals/${id}/reject`, {
    reason: reason ?? null,
  });
  return res.data as ApprovalDecisionResponse;
}
