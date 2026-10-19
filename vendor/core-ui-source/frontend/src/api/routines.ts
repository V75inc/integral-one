/**
 * RoutineTask management client — Background Tasks page + Inbox.
 *
 * Mirrors `backend/app/schemas/agentive/routines.py` and:
 *
 *   GET    /api/agentive/routines
 *   GET    /api/agentive/routines/:id
 *   GET    /api/agentive/routines/:id/activity
 *   PATCH  /api/agentive/routines/:id
 *   POST   /api/agentive/routines/:id/cancel
 *   DELETE /api/agentive/routines/:id
 */

import api from './client';

export type RoutineStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type RoutineUpdateStatus = 'active' | 'paused';
export type LastRunStatus = 'success' | 'error' | 'skipped' | 'stopped';

export interface RoutineResponse {
  id: string;
  instruction: string;
  cron: string;
  timezone: string;
  status: RoutineStatus | string;
  write_scope: Array<
    { resource_type?: string; resource_id?: string } & Record<string, string>
  >;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: LastRunStatus | string | null;
  last_run_error: string | null;
  consecutive_failures: number;
  max_runs: number | null;
  run_count: number;
  thread_id: string;
  workspace_id: string;
  created_at: string | null;
  updated_at: string | null;
  /** True when this process has an in-flight origin=routine_task turn. */
  running?: boolean;
}

export interface RoutineListResponse {
  routines: RoutineResponse[];
  total: number;
}

export interface RoutineUpdateRequest {
  status?: RoutineUpdateStatus;
  instruction?: string;
  cron?: string;
  timezone?: string;
  max_runs?: number | null;
  clear_max_runs?: boolean;
}

export interface RoutineCancelResponse {
  id: string;
  status: 'cancelled';
}

export interface RoutineDeleteResponse {
  id: string;
  deleted: true;
}

export interface RoutineActivityLink {
  kind: string;
  id: string;
  label: string;
  href: string;
}

export interface RoutineActivityEvent {
  id: string;
  kind: string;
  ts: string | null;
  action: string | null;
  status: string | null;
  summary: string;
  reason: string | null;
  message_id: string | null;
  role: string | null;
  links: RoutineActivityLink[];
}

export interface RoutineActivityResponse {
  routine_id: string;
  thread_id: string;
  events: RoutineActivityEvent[];
  write_scope_links: RoutineActivityLink[];
}

export interface ListRoutinesParams {
  status?: RoutineStatus;
}

export async function listRoutines(
  params: ListRoutinesParams = {},
): Promise<RoutineListResponse> {
  const res = await api.get('/agentive/routines', { params });
  return res.data as RoutineListResponse;
}

export async function getRoutine(id: string): Promise<RoutineResponse> {
  const res = await api.get(`/agentive/routines/${encodeURIComponent(id)}`);
  return res.data as RoutineResponse;
}

export async function getRoutineActivity(
  id: string,
  limit = 40,
): Promise<RoutineActivityResponse> {
  const res = await api.get(
    `/agentive/routines/${encodeURIComponent(id)}/activity`,
    { params: { limit } },
  );
  return res.data as RoutineActivityResponse;
}

export async function updateRoutine(
  id: string,
  body: RoutineUpdateRequest,
): Promise<RoutineResponse> {
  const res = await api.patch(
    `/agentive/routines/${encodeURIComponent(id)}`,
    body,
  );
  return res.data as RoutineResponse;
}

export async function cancelRoutine(
  id: string,
): Promise<RoutineCancelResponse> {
  const res = await api.post(
    `/agentive/routines/${encodeURIComponent(id)}/cancel`,
  );
  return res.data as RoutineCancelResponse;
}

export async function deleteRoutine(
  id: string,
): Promise<RoutineDeleteResponse> {
  const res = await api.delete(
    `/agentive/routines/${encodeURIComponent(id)}`,
  );
  return res.data as RoutineDeleteResponse;
}
