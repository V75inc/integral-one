import type { ApprovalResponse } from '../../api/approvals';

const RESOURCE_ROUTES: Record<string, string> = {
  app: '/apps',
  track: '/tracks',
  entry: '/feed?entry=',
};

function words(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, char => char.toUpperCase());
}

function valueLabel(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (!Array.isArray(value)) return null;

  const values = value
    .map(valueLabel)
    .filter((item): item is string => Boolean(item));
  return values.length > 0 ? values.join(', ') : null;
}

export function approvalSummary(approval: ApprovalResponse): string {
  const target = approval.resource_id
    ? `${words(approval.resource_kind)} ${approval.resource_id}`
    : words(approval.resource_kind || 'requested change');
  return `${words(approval.action)} for ${target}`;
}

export function approvalChanges(
  approval: ApprovalResponse,
): Array<{ label: string; value: string }> {
  return Object.entries(approval.payload)
    .filter(([key, value]) => !key.startsWith('_') && valueLabel(value) !== null)
    .slice(0, 6)
    .map(([key, value]) => ({ label: words(key), value: valueLabel(value)! }));
}

export function approvalResourceHref(approval: ApprovalResponse): string | null {
  if (!approval.resource_id) return null;

  const route = RESOURCE_ROUTES[approval.resource_kind];
  if (!route) return null;

  return approval.resource_kind === 'entry'
    ? `${route}${encodeURIComponent(approval.resource_id)}`
    : `${route}/${encodeURIComponent(approval.resource_id)}`;
}
