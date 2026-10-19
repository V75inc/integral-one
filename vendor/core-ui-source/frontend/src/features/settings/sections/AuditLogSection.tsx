/**
 * F1 Phase One — Workspace Audit Log settings section.
 *
 * Consumes GET /api/audit-log with forensic filters (action, resource,
 * actor_kind, scope). Highlights policy.deny / failure rows.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { fetchAuditLog, type AuditLogEvent } from '../../../api/auditLog';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SettingsSection } from '../components/Field';
import { Input, Select, Surface, Text } from '../../../ui';

function parseHashFilters(hash: string): {
  action: string;
  resource_id: string;
  resource_type: string;
  actor_kind: string;
  scope: string;
} {
  // Supports `#audit-log?action=policy.deny&resource_id=...`
  const qIdx = hash.indexOf('?');
  const qs = qIdx >= 0 ? hash.slice(qIdx + 1) : '';
  const params = new URLSearchParams(qs);
  return {
    action: params.get('action') || '',
    resource_id: params.get('resource_id') || '',
    resource_type: params.get('resource_type') || '',
    actor_kind: params.get('actor_kind') || '',
    scope: params.get('scope') || '',
  };
}

function isFailureRow(ev: AuditLogEvent): boolean {
  const action = (ev.action || '').toLowerCase();
  if (action === 'policy.deny') return true;
  if (action.includes('fail') || action.includes('error')) return true;
  const details = ev.details || {};
  return Boolean(details.failed_action || details.decision_reason);
}

export function AuditLogSection() {
  const location = useLocation();
  const fromHash = useMemo(
    () => parseHashFilters(location.hash || ''),
    [location.hash],
  );

  const [action, setAction] = useState(fromHash.action);
  const [resourceId, setResourceId] = useState(fromHash.resource_id);
  const [resourceType, setResourceType] = useState(fromHash.resource_type);
  const [actorKind, setActorKind] = useState(fromHash.actor_kind);
  const [scope, setScope] = useState(fromHash.scope);

  useEffect(() => {
    setAction(fromHash.action);
    setResourceId(fromHash.resource_id);
    setResourceType(fromHash.resource_type);
    setActorKind(fromHash.actor_kind);
    setScope(fromHash.scope);
  }, [fromHash]);

  const query = useQuery({
    queryKey: [
      'audit-log',
      action,
      resourceId,
      resourceType,
      actorKind,
      scope,
    ],
    queryFn: () =>
      fetchAuditLog({
        action: action || undefined,
        resource_id: resourceId || undefined,
        resource_type: resourceType || undefined,
        actor_kind: actorKind || undefined,
        scope: scope || undefined,
        limit: 50,
      }),
  });

  const events = query.data?.events ?? [];

  return (
    <SettingsSection
      title="Audit log"
      description="Workspace ChangeEvents you are permitted to see. Use filters to diagnose policy denials and failed operations without database access."
    >
      <div className="flex flex-col gap-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Action
            </Text>
            <Input
              size="sm"
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="policy.deny"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Actor kind
            </Text>
            <Select
              size="sm"
              value={actorKind}
              onChange={e => setActorKind(e.target.value)}
            >
              <option value="">Any</option>
              <option value="human">human</option>
              <option value="agent">agent</option>
              <option value="connector">connector</option>
              <option value="system">system</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Resource id
            </Text>
            <Input
              size="sm"
              monospace
              value={resourceId}
              onChange={e => setResourceId(e.target.value)}
              placeholder="n.Entry...."
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Resource type
            </Text>
            <Input
              size="sm"
              value={resourceType}
              onChange={e => setResourceType(e.target.value)}
              placeholder="Entry"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <Text variant="label" tone="muted">
              Scope
            </Text>
            <Input
              size="sm"
              monospace
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="app:... or track:..."
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setAction('policy.deny');
            }}
          >
            Show denials
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAction('');
              setResourceId('');
              setResourceType('');
              setActorKind('');
              setScope('');
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="No ChangeEvents match these filters (or none are visible to you)."
        />
      ) : (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {events.map(ev => {
            const fail = isFailureRow(ev);
            const details = ev.details || {};
            return (
              <li key={ev.id || `${ev.ts}-${ev.action}-${ev.resource_id}`}>
                <Surface
                  tone={fail ? 'panel-2' : 'panel'}
                  border={fail ? 'default' : 'subtle'}
                  radius="input"
                  padding="sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Text variant="body" weight="medium">
                      {ev.action || '(unknown action)'}
                    </Text>
                    <Text variant="meta" tone="muted" className="break-all">
                      {ev.ts || ''}
                    </Text>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer"><Text variant="meta" tone="muted">Technical details</Text></summary>
                  <Text variant="meta" tone="muted" as="div" className="break-all">
                    {ev.actor_kind}:{ev.actor_id} · {ev.resource_type}/
                    {ev.resource_id} · {ev.scope}
                  </Text>
                  </details>
                  {Boolean(
                    details.decision_reason ||
                      details.failed_action ||
                      details.matched_policy_id ||
                      details.staging_token,
                  ) && (
                    <Text variant="meta" as="div" className="mt-1 break-all">
                      {details.failed_action
                        ? `failed_action=${String(details.failed_action)} `
                        : ''}
                      {details.decision_reason
                        ? `reason=${String(details.decision_reason)} `
                        : ''}
                      {details.matched_policy_id
                        ? `policy=${String(details.matched_policy_id)} `
                        : ''}
                      {details.staging_token
                        ? `staging=${String(details.staging_token)}`
                        : ''}
                    </Text>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
