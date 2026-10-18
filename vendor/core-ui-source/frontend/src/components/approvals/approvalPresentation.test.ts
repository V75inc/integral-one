import { describe, expect, it } from 'vitest';
import { approvalChanges, approvalResourceHref, approvalSummary } from './approvalPresentation';

const approval = {
  id: 'approval-1',
  actor_kind: 'agent' as const,
  actor_id: 'resident',
  action: 'entry.create',
  resource_kind: 'entry',
  resource_id: 'entry-1',
  payload: {
    title: 'Inspect vehicle',
    priority: 'high',
    _internal: 'hidden',
    nested: { raw: true },
  },
  policy_id: 'policy-1',
  created_at: '2026-09-22T00:00:00Z',
  expires_at: '2026-09-23T00:00:00Z',
  status: 'pending' as const,
  decided_at: null,
  decider_id: null,
};

describe('approval presentation', () => {
  it('renders a semantic change summary without opaque fields', () => {
    expect(approvalSummary(approval)).toBe('Entry create for Entry entry-1');
    expect(approvalChanges(approval)).toEqual([
      { label: 'Title', value: 'Inspect vehicle' },
      { label: 'Priority', value: 'high' },
    ]);
  });

  it('links a reviewable affected resource through its ordinary surface', () => {
    expect(approvalResourceHref(approval)).toBe('/feed?entry=entry-1');
  });
});
