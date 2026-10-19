import { PageMeta } from '../../../components/ui';
/**
 * Phase 8 Plan 08-01 Task 2 — Policies panel (SET-01).
 *
 * Mirrors backend/app/api/policies.py + app/schemas/policy.py — the
 * backend is the single source of truth (Pitfall 8 mitigation). Lists
 * every Policy in the tenant, supports create / edit / toggle
 * requires_human_approval / delete with confirm.
 *
 * AGENTIVE_ENABLED=off behaviour (A3): the panel still loads with a
 * warning banner above the list. The "+ New policy" button is disabled
 * (NOT hidden — admins must still be able to read; existing toggle /
 * edit / delete remain functional so admins can remove a policy even
 * when the runtime layer is off).
 *
 * F1: also hosts a dry-run Explain action panel over POST /policies/explain.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import {
  policiesApi,
  type ExplainActionResponse,
  type PolicyResponse,
} from '../../../api/policies';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { SettingsSection, ToggleRow } from '../components/Field';
import { Input, Surface, Text } from '../../../ui';
import { PolicyCreateModal } from './PolicyCreateModal';
import { PolicyEditModal } from './PolicyEditModal';

const POLICIES_QUERY_KEY = ['policies', 'list'] as const;

export function PoliciesSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PolicyResponse | null>(null);

  const [explainAction, setExplainAction] = useState('entry.create');
  const [explainResourceKind, setExplainResourceKind] = useState('entry');
  const [explainResourceId, setExplainResourceId] = useState('');
  const [explainScope, setExplainScope] = useState('');
  const [explainResult, setExplainResult] =
    useState<ExplainActionResponse | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);

  const list = useQuery({
    queryKey: POLICIES_QUERY_KEY,
    queryFn: () => policiesApi.list(),
  });

  const togglePatch = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      policiesApi.patch(id, { requires_human_approval: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.showToast('Policy updated', 'success');
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to update policy', 'error');
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => policiesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.showToast('Policy deleted', 'success');
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to delete policy', 'error');
    },
  });

  const handleDelete = async (p: PolicyResponse) => {
    const ok = await confirm({
      title: 'Delete this policy?',
      message: `Subject ${p.subject_kind}:${p.subject_id || '*'} — scope ${p.scope}. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    delMut.mutate(p.id);
  };

  const runExplain = async () => {
    const subjectId = user?.user_id || user?.id || '';
    if (!subjectId || !explainResourceId.trim() || !explainScope.trim()) {
      toast.showToast('Resource id and scope are required', 'error');
      return;
    }
    setExplainBusy(true);
    try {
      const result = await policiesApi.explain({
        subject_kind: 'human',
        subject_id: subjectId,
        action: explainAction.trim() || 'entry.create',
        resource_kind: explainResourceKind.trim() || 'entry',
        resource_id: explainResourceId.trim(),
        resource_scope: explainScope.trim(),
      });
      setExplainResult(result);
    } catch (err) {
      toast.showToast((err as Error)?.message || 'Explain failed', 'error');
      setExplainResult(null);
    } finally {
      setExplainBusy(false);
    }
  };

  const policies = list.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          Policies
        </Text>
        <PageMeta as="p">
          Define who can do what across the workspace. Each rule controls how
          a person, agent, or connector can access a specific resource. Integral
          checks every action against this list before allowing it.
        </PageMeta>
      </div>

      <SettingsSection
        title="Explain an action"
        description="Dry-run the policy engine for your principal against a resource — shows allow/deny, reason, and policy chain without writing audit events."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Action
            </Text>
            <Input
              size="sm"
              value={explainAction}
              onChange={e => setExplainAction(e.target.value)}
              placeholder="entry.create"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Resource kind
            </Text>
            <Input
              size="sm"
              value={explainResourceKind}
              onChange={e => setExplainResourceKind(e.target.value)}
              placeholder="entry"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Resource id
            </Text>
            <Input
              size="sm"
              monospace
              value={explainResourceId}
              onChange={e => setExplainResourceId(e.target.value)}
              placeholder="n.Entry...."
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="label" tone="muted">
              Scope
            </Text>
            <Input
              size="sm"
              monospace
              value={explainScope}
              onChange={e => setExplainScope(e.target.value)}
              placeholder="track:..."
            />
          </label>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void runExplain()}
          disabled={explainBusy}
        >
          {explainBusy ? 'Explaining…' : 'Explain'}
        </Button>
        {explainResult ? (
          <div className="mt-3" data-testid="policy-explain-result">
            <Surface
              tone="panel-2"
              border="subtle"
              radius="input"
              padding="sm"
            >
              <Text variant="body" weight="medium" as="div">
                {explainResult.allowed ? 'Allowed' : 'Denied'} —{' '}
                {explainResult.reason}
              </Text>
              {explainResult.matched_policy_id ? (
                <Text variant="meta" tone="muted" as="div">
                  matched_policy={explainResult.matched_policy_id}
                </Text>
              ) : null}
              {explainResult.policy_chain.length > 0 ? (
                <Text variant="meta" tone="muted" as="div">
                  chain: {explainResult.policy_chain.join(' → ')}
                </Text>
              ) : null}
            </Surface>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="All policies"
        description="Toggle approval requirements inline. Click Edit to change scope or actions."
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
            aria-label="New policy"
          >
            New policy
          </Button>
        }
      >
        {list.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : list.isError ? (
          <p className="text-sm text-[var(--danger-fg)]">
            Failed to load policies:{' '}
            {(list.error as Error | undefined)?.message ?? 'unknown error'}
          </p>
        ) : policies.length === 0 ? (
          <EmptyState
            title="No policies yet."
            description="Until you add a policy, agents inherit your default access."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {policies.map(p => (
              <li
                key={p.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
              >
                <div className="flex-1">
                  <ToggleRow
                    checked={p.requires_human_approval}
                    onChange={value => togglePatch.mutate({ id: p.id, value })}
                    label={`${p.subject_kind}:${p.subject_id || '*'} → ${p.scope}`}
                    hint={
                      p.actions.length > 0
                        ? `Actions: ${p.actions.join(', ')}`
                        : 'Actions: (all)'
                    }
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:flex-col sm:items-stretch">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    icon={<Pencil size={12} />}
                    onClick={() => setEditing(p)}
                    aria-label={`Edit policy ${p.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    icon={<Trash2 size={12} />}
                    onClick={() => handleDelete(p)}
                    aria-label={`Delete policy ${p.id}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <PolicyCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <PolicyEditModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        policy={editing}
      />
    </div>
  );
}
