/**
 * Phase 8 Plan 08-01 — Policy edit modal.
 *
 * Mirrors backend/app/api/policies.py PATCH /policies/{id} + the
 * PolicyUpdate body in backend/app/schemas/policy.py. subject_kind /
 * subject_id are absent from PolicyUpdate (re-targeting requires
 * delete + recreate per backend policies.py L277-279).
 *
 * Migrated to the FormDialog template (Phase 6).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  policiesApi,
  type PolicyResponse,
  type PolicyUpdate,
} from '../../../api/policies';
import { useToast } from '../../../context/ToastContext';
import { SettingsField, TextInput, ToggleRow } from '../components/Field';
import { FormDialog } from '../../../templates';

interface Props {
  open: boolean;
  onClose: () => void;
  policy: PolicyResponse | null;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

export function PolicyEditModal({ open, onClose, policy }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [scope, setScope] = useState('*');
  const [actions, setActions] = useState('');
  const [entryTypes, setEntryTypes] = useState('');
  const [tags, setTags] = useState('');
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Re-seed local state whenever a new policy is passed in.
  useEffect(() => {
    if (!policy) return;
    setScope(policy.scope);
    setActions(policy.actions.join(', '));
    setEntryTypes(policy.entry_types.join(', '));
    setTags(policy.tags.join(', '));
    setRequiresHumanApproval(policy.requires_human_approval);
    setIsActive(policy.is_active);
  }, [policy]);

  const mut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PolicyUpdate }) =>
      policiesApi.patch(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.showToast('Policy updated', 'success');
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to update policy', 'error');
    },
  });

  if (!policy) return null;

  const submit = () => {
    mut.mutate({
      id: policy.id,
      body: {
        scope: scope.trim() || '*',
        actions: splitCsv(actions),
        entry_types: splitCsv(entryTypes),
        tags: splitCsv(tags),
        requires_human_approval: requiresHumanApproval,
        is_active: isActive,
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Edit policy — ${policy.subject_kind}:${policy.subject_id || '*'}`}
      onSubmit={submit}
      submitLabel="Save"
      submitLoading={mut.isPending}
    >
      <SettingsField
        label="Scope"
        hint="Where the policy applies. Use * for everything, or workspace:<id> / user:<id> to limit it."
      >
        <TextInput value={scope} onChange={setScope} monospace />
      </SettingsField>

      <SettingsField
        label="Actions"
        hint="Comma-separated actions this policy governs. Leave blank to cover every action."
      >
        <TextInput value={actions} onChange={setActions} monospace />
      </SettingsField>

      <SettingsField
        label="Entry types"
        hint="Optional. Comma-separated entry type keys to limit the policy to."
      >
        <TextInput value={entryTypes} onChange={setEntryTypes} monospace />
      </SettingsField>

      <SettingsField
        label="Tags"
        hint="Optional. Comma-separated tag IDs to limit the policy to."
      >
        <TextInput value={tags} onChange={setTags} monospace />
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
