/**
 * Phase 8 Plan 08-02 — Connector edit modal.
 *
 * Mirrors backend PATCH /api/agentive/connectors/{id} + the
 * UpdateConnectorRequest body in backend/app/schemas/agentive/connectors.py.
 * `kind` / `owner` are intentionally absent (immutable — re-target via
 * delete + recreate).
 *
 * `conflict_policy` is DISPLAYED as a read-only StatusPill (per A5 — derived
 * from the SyncConnector subclass registry, NEVER editable from this form).
 *
 * Plan 08-02 Task 3 mounts ConnectorBindingsPanel below the form so the
 * operator can manage IS_CONNECTED_TO Track bindings inline.
 *
 * Migrated to FormDialog template (Phase 6).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  connectorsApi,
  type ConnectorResponse,
  type ConnectorUpdate,
} from '../../../api/connectors';
import { Input, Textarea } from '../../../ui';
import { FormDialog } from '../../../templates';
import { useToast } from '../../../context/ToastContext';
import { SettingsField, StatusPill, TextInput } from '../components/Field';
import { ConnectorBindingsPanel } from './ConnectorBindingsPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  connector: ConnectorResponse | null;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

export function ConnectorEditModal({ open, onClose, connector }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [subclassSlug, setSubclassSlug] = useState('');
  const [syncIntervalSeconds, setSyncIntervalSeconds] = useState(300);
  const [authStateJson, setAuthStateJson] = useState('{}');
  // What the textarea was prefilled with. GET returns auth_state REDACTED, and
  // PATCH replaces it wholesale, so sending back an untouched prefill would
  // overwrite live credentials with "[redacted]". Compare against this to send
  // auth_state only when the operator actually edited it. The server refuses
  // the marker too; this keeps the common case from ever reaching that error.
  const [authStatePristine, setAuthStatePristine] = useState('{}');
  const [mappingProfile, setMappingProfile] = useState('');
  const [permissions, setPermissions] = useState('');
  const [capabilities, setCapabilities] = useState('');

  useEffect(() => {
    if (!connector) return;
    setSubclassSlug(connector.subclass_slug || '');
    setSyncIntervalSeconds(connector.sync_interval_seconds);
    const prefill = JSON.stringify(connector.auth_state ?? {}, null, 2);
    setAuthStateJson(prefill);
    setAuthStatePristine(prefill);
    setMappingProfile(connector.mapping_profile || '');
    setPermissions(connector.permissions.join(', '));
    setCapabilities(connector.capabilities.join(', '));
  }, [connector]);

  const mut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConnectorUpdate }) =>
      connectorsApi.patch(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      toast.showToast('Connector updated', 'success');
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to update connector', 'error');
    },
  });

  if (!connector) return null;

  const submit = () => {
    // Parse the auth_state JSON textarea — on error, toast and abort
    // BEFORE invoking the mutation so we don't ship malformed payload.
    const authStateEdited = authStateJson !== authStatePristine;
    let parsedAuthState: Record<string, unknown> | undefined;
    if (authStateEdited) {
      try {
        const v = JSON.parse(authStateJson || '{}');
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
          throw new Error('auth_state must be a JSON object');
        }
        parsedAuthState = v as Record<string, unknown>;
      } catch (e) {
        toast.showToast(
          `auth_state parse error: ${(e as Error).message}`,
          'error',
        );
        return;
      }
    }

    mut.mutate({
      id: connector.id,
      body: {
        subclass_slug: subclassSlug.trim(),
        sync_interval_seconds: syncIntervalSeconds,
        // Omitted when untouched — the service skips None and leaves the
        // stored credentials alone.
        ...(authStateEdited ? { auth_state: parsedAuthState } : {}),
        mapping_profile: mappingProfile.trim(),
        permissions: splitCsv(permissions),
        capabilities: splitCsv(capabilities),
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Edit connector — ${connector.kind}:${connector.id}`}
      onSubmit={submit}
      submitLabel="Save"
      submitLoading={mut.isPending}
    >
      <SettingsField
        label="Subclass slug"
        hint="Registered SyncConnector slug (e.g. github_issues). Drives conflict_policy."
      >
        <TextInput
          value={subclassSlug}
          onChange={setSubclassSlug}
          placeholder="github_issues"
          monospace
        />
      </SettingsField>

      <SettingsField
        label="Conflict policy (read-only)"
        hint="Derived from the SyncConnector subclass — change subclass_slug to change this."
        inline
      >
        <StatusPill state={connector.conflict_policy ? 'ok' : 'idle'}>
          {connector.conflict_policy || 'no policy'}
        </StatusPill>
      </SettingsField>

      <SettingsField
        label="Sync interval (seconds)"
        hint="Minimum 60s — soft guardrail against accidental rate-limit DoS."
      >
        <Input
          type="number"
          min={60}
          value={syncIntervalSeconds}
          onChange={e => setSyncIntervalSeconds(parseInt(e.target.value, 10) || 60)}
          monospace
        />
      </SettingsField>

      <SettingsField
        label="auth_state (JSON)"
        hint="Bearer tokens, OAuth refresh tokens, API keys. Persisted server-side; never logged to audit-log."
      >
        <Textarea
          value={authStateJson}
          onChange={e => setAuthStateJson(e.target.value)}
          rows={6}
          size="sm"
          monospace
        />
      </SettingsField>

      <SettingsField
        label="Mapping profile (deprecated)"
        hint="Use IS_CONNECTED_TO Track bindings below instead (I-CON-02)."
      >
        <TextInput
          value={mappingProfile}
          onChange={setMappingProfile}
          monospace
        />
      </SettingsField>

      <SettingsField label="Permissions" hint="Comma-separated.">
        <TextInput value={permissions} onChange={setPermissions} monospace />
      </SettingsField>

      <SettingsField label="Capabilities" hint="Comma-separated.">
        <TextInput value={capabilities} onChange={setCapabilities} monospace />
      </SettingsField>

      {/* IS_CONNECTED_TO Track bindings panel — Task 3 (B1 closure) */}
      {connector.id && (
        <div className="mt-2 border-t border-[var(--panel-border)] pt-4">
          <ConnectorBindingsPanel connectorId={connector.id} />
        </div>
      )}
    </FormDialog>
  );
}
