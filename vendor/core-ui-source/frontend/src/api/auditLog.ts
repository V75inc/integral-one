/**
 * auditLog.ts — F1 forensic consumer of GET /api/audit-log.
 */
import api from './client';

export interface AuditLogEvent {
  id?: string;
  ts?: string;
  actor_kind?: string;
  actor_id?: string;
  actor_capability?: string | null;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  scope?: string;
  details?: Record<string, unknown> | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogPage {
  events: AuditLogEvent[];
  next_cursor: string | null;
  has_more: boolean;
  total?: number;
}

export async function fetchAuditLog(params: {
  scope?: string;
  actor_kind?: string;
  action?: string;
  resource_id?: string;
  resource_type?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<AuditLogPage> {
  const query: Record<string, string | number> = {};
  if (params.scope) query.scope = params.scope;
  if (params.actor_kind) query.actor_kind = params.actor_kind;
  if (params.action) query.action = params.action;
  if (params.resource_id) query.resource_id = params.resource_id;
  if (params.resource_type) query.resource_type = params.resource_type;
  if (params.cursor) query.cursor = params.cursor;
  if (params.limit !== undefined) query.limit = params.limit;

  const { data } = await api.get<{
    events?: AuditLogEvent[];
    next_cursor?: string | null;
    has_more?: boolean;
    total?: number;
  }>('/audit-log', { params: query });

  return {
    events: Array.isArray(data?.events) ? data.events : [],
    next_cursor: data?.next_cursor ?? null,
    has_more: Boolean(data?.has_more),
    total: typeof data?.total === 'number' ? data.total : undefined,
  };
}

/** Deep-link into Settings → Audit log with query filters. */
export function auditLogSettingsHref(filters: {
  action?: string;
  resource_id?: string;
  resource_type?: string;
  actor_kind?: string;
  scope?: string;
}): string {
  const q = new URLSearchParams();
  if (filters.action) q.set('action', filters.action);
  if (filters.resource_id) q.set('resource_id', filters.resource_id);
  if (filters.resource_type) q.set('resource_type', filters.resource_type);
  if (filters.actor_kind) q.set('actor_kind', filters.actor_kind);
  if (filters.scope) q.set('scope', filters.scope);
  const qs = q.toString();
  return qs ? `/settings#audit-log?${qs}` : '/settings#audit-log';
}
