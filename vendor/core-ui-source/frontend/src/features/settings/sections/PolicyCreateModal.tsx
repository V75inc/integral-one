/**
 * Phase 8 Plan 08-01 — Policy create modal.
 *
 * Mirrors backend/app/api/policies.py POST /policies + the PolicyCreate
 * body in backend/app/schemas/policy.py. `created_by` is intentionally
 * absent — backend derives from authenticated principal (T-08-01-S01).
 *
 * Migrated to the FormDialog template + Field/Input primitives (Phase 6,
 * see `.planning/ui-templating/MIGRATION_LOG.md`). ~30 lines of footer
 * + Modal wiring deleted; hand-rolled `<select>` styling kept locally
 * pending the `<Select>` primitive (Phase 3-B follow-up).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  policiesApi,
  type ActorKind,
  type PolicyCreate,
  type PolicyResponse,
} from '../../../api/policies';
import { useToast } from '../../../context/ToastContext';
import { SettingsField, TextInput, ToggleRow } from '../components/Field';
import { FormDialog } from '../../../templates';

const ACTOR_KINDS: ActorKind[] = ['human', 'agent', 'connector', 'system'];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (created: PolicyResponse) => void;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

export function PolicyCreateModal({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [subjectKind, setSubjectKind] = useState<ActorKind>('agent');
  const [subjectId, setSubjectId] = useState('');
  const [scope, setScope] = useState('*');
  const [actions, setActions] = useState('');
  const [entryTypes, setEntryTypes] = useState('');
  const [tags, setTags] = useState('');
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const reset = () => {
    setSubjectKind('agent');
    setSubjectId('');
    setScope('*');
    setActions('');
    setEntryTypes('');
    setTags('');
    setRequiresHumanApproval(false);
    setIsActive(true);
  };

  const mut = useMutation({
    mutationFn: (body: PolicyCreate) => policiesApi.create(body),
    onSuccess: created => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.showToast('Policy created', 'success');
      reset();
      onCreated?.(created);
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to create policy', 'error');
    },
  });

  const submit = () => {
    if (!subjectId.trim()) {
      toast.showToast('subject_id is required', 'error');
      return;
    }
    mut.mutate({
      subject_kind: subjectKind,
      subject_id: subjectId.trim(),
      scope: scope.trim() || '*',
      actions: splitCsv(actions),
      entry_types: splitCsv(entryTypes),
      tags: splitCsv(tags),
      requires_human_approval: requiresHumanApproval,
      is_active: isActive,
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="New policy"
      onSubmit={submit}
      submitLabel="Create"
      submitDisabled={!subjectId.trim()}
      submitLoading={mut.isPending}
    >
      <SettingsField label="Subject kind">
        <select
          value={subjectKind}
          onChange={e => setSubjectKind(e.target.value as ActorKind)}
          className="
            w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
            bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]
          "
        >
          {ACTOR_KINDS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </SettingsField>

      <SettingsField
        label="Subject ID"
        hint="ID of the user, agent, or connector this policy applies to."
      >
        <TextInput
          value={subjectId}
          onChange={setSubjectId}
          placeholder="e.g. agt-1"
          monospace
        />
      </SettingsField>

      <SettingsField
        label="Scope"
        hint="Where the policy applies. Use * for everything, or workspace:<id> / user:<id> to limit it."
      >
        <TextInput value={scope} onChange={setScope} placeholder="*" monospace />
      </SettingsField>

      <SettingsField
        label="Actions"
        hint="Comma-separated actions this policy governs (e.g. entry.create, entry.update). Leave blank to cover every action."
      >
        <TextInput value={actions} onChange={setActions} placeholder="entry.create, entry.update" monospace />
      </SettingsField>

      <SettingsField
        label="Entry types"
        hint="Optional. Comma-separated entry type keys to limit the policy to."
      >
        <TextInput value={entryTypes} onChange={setEntryTypes} placeholder="post, task" monospace />
      </SettingsField>

      <SettingsField
        label="Tags"
        hint="Optional. Comma-separated tag IDs to limit the policy to."
      >
        <TextInput value={tags} onChange={setTags} placeholder="" monospace />
      </SettingsField>

      <ToggleRow
        checked={requiresHumanApproval}
        onChange={setRequiresHumanApproval}
        label="Requires human approval"
        hint="When on, agent writes wait for a human to approve them."
      />

      <ToggleRow
        checked={isActive}
        onChange={setIsActive}
        label="Active"
        hint="Inactive policies are saved but not enforced."
      />
    </FormDialog>
  );
}
