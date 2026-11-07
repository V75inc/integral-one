import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { entriesApi } from '../../api';
import { extensionsApi, requireOperationOutput } from '../../api/extensions';
import { errorMessageFromAxios } from '../../api/helpers';
import { useAuthOptional } from '../../context/AuthContext';
import { useScopeOptional } from '../../context/ScopeContext';
import { randomUUID } from '../../utils/randomUUID';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Text } from '../../ui';
import { useContributionLifecycle } from './contributionLifecycle';
import type { OperationalModelFieldSpec } from '../../types';
import type {
  SeamlessFieldProps,
  SeamlessFieldRelationChoice,
} from './SeamlessField';

/** App-owned form and command; this host knows no domain fields or App slugs. */
export interface RelatedRecordConfig {
  kind: string;
  form_operation: string;
  create_operation: string;
  prefill?: Record<string, string>;
}
type FormDescription = {
  fields: OperationalModelFieldSpec[];
  defaults: Record<string, unknown>;
  name_field?: string;
  dependent_options?: Record<
    string,
    { field: string; values: Record<string, string[]> }
  >;
};

type RelatedRecordControlProps = {
  props: SeamlessFieldProps;
  config: RelatedRecordConfig;
  renderField: ComponentType<SeamlessFieldProps>;
};

export function RelatedRecordControl(props: RelatedRecordControlProps) {
  const auth = useAuthOptional();
  const scope = useScopeOptional();
  const principalId = auth?.user?.id || '';
  const workspaceId = scope?.scope?.workspaceId || '';
  const lifecycle = useContributionLifecycle();
  // A pending create/read belongs to one parent contribution, not just its
  // user and workspace. Changing that parent replaces all recovery/selection
  // state before an old response can patch the new draft.
  const sessionKey = JSON.stringify([
    principalId,
    workspaceId,
    lifecycle?.appId,
    lifecycle?.trackId,
    lifecycle?.entryId,
    lifecycle?.entryTypeKey,
    lifecycle?.mode,
    lifecycle?.placement,
    props.props.field.key,
    props.config.kind,
    props.config.form_operation,
    props.config.create_operation,
  ]);
  return (
    <RelatedRecordSession
      key={sessionKey}
      {...props}
      principalId={principalId}
      workspaceId={workspaceId}
      sessionKey={sessionKey}
    />
  );
}

function RelatedRecordSession({
  props,
  config,
  renderField: Field,
  principalId,
  workspaceId,
  sessionKey,
}: RelatedRecordControlProps & {
  principalId: string;
  workspaceId: string;
  sessionKey: string;
}) {
  const lifecycle = useContributionLifecycle();
  const latestLifecycle = useRef(lifecycle);
  useLayoutEffect(() => {
    latestLifecycle.current = lifecycle;
  }, [lifecycle]);
  const appId = lifecycle?.appId || '';
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [extraChoices, setExtraChoices] = useState<
    SeamlessFieldRelationChoice[]
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [withheld, setWithheld] = useState(false);
  const [candidates, setCandidates] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [conflicts, setConflicts] = useState<
    Array<{ key: string; label: string; current: unknown; proposed: unknown }>
  >([]);
  const active = useRef(false);
  const intent = useRef<{
    input: Record<string, unknown>;
    key: string;
    storageKey?: string;
  }>();
  const releaseIntent = () => {
    if (intent.current?.storageKey) {
      try {
        sessionStorage.removeItem(intent.current.storageKey);
      } catch {
        /* storage can be disabled */
      }
    }
    intent.current = undefined;
  };
  const clearForm = () => {
    setValues({});
    setError('');
    setCandidates([]);
    setDuplicateConfirmed(false);
  };
  const startNewRecord = () => {
    // Only a known completed outcome can be acknowledged as a separate task.
    // An uncertain write must retain its exact intent for safe replay.
    if (!withheld || busy) return;
    releaseIntent();
    setWithheld(false);
    setUncertain(false);
    setSearch('');
    clearForm();
  };
  const trigger = useRef<HTMLButtonElement | null>(null);
  const selection = useRef('');
  const operations = useQuery({
    queryKey: ['related-record-operations', principalId, workspaceId, appId],
    queryFn: () => extensionsApi.listOperations(appId),
    enabled: Boolean(appId && !props.field.readonly),
    staleTime: 0,
  });
  const form = useQuery({
    queryKey: [
      'related-record-form',
      principalId,
      workspaceId,
      appId,
      config.form_operation,
      config.kind,
    ],
    queryFn: async () => {
      const output = requireOperationOutput(
        await extensionsApi.invokeOperation(appId, config.form_operation, {
          kind: config.kind,
        })
      ).output;
      if (
        !Array.isArray(output.fields) ||
        !output.defaults ||
        typeof output.defaults !== 'object'
      )
        throw new Error('Form unavailable.');
      return output as unknown as FormDescription;
    },
    enabled: open && Boolean(appId),
  });
  const canCreate = operations.data?.operations.some(
    (op) => op.key === config.create_operation && op.allowed === true
  );
  const current = {
    ...form.data?.defaults,
    ...(form.data?.name_field && search
      ? { [form.data.name_field]: search }
      : {}),
    ...values,
  };
  const close = () => {
    if (busy || uncertain) return;
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const prefill = useCallback(
    (saved: Awaited<ReturnType<typeof entriesApi.get>>) => {
      const patch: Record<string, unknown> = {};
      const different: Array<{
        key: string;
        label: string;
        current: unknown;
        proposed: unknown;
      }> = [];
      for (const [source, target] of Object.entries(config.prefill || {})) {
        if (
          props.siblingFields?.length &&
          !props.siblingFields.some((field) => field.key === target)
        )
          continue;
        const existing = latestLifecycle.current?.customFields[target];
        const next = saved.custom_fields?.[source];
        if (
          (existing == null || existing === '') &&
          next != null &&
          next !== ''
        )
          patch[target] = next;
        else if (next != null && next !== '' && existing !== next)
          different.push({
            key: target,
            label:
              props.siblingFields?.find((field) => field.key === target)
                ?.name || humanizeEnumValue(target),
            current: existing,
            proposed: next,
          });
      }
      setConflicts(different);
      return patch;
    },
    [config.prefill, props.siblingFields]
  );
  const select = async (id: string) => {
    const saved = await entriesApi.get(id);
    if (!mounted.current) return;
    const name = saved.title || props.field.name;
    setExtraChoices((prev) => [
      ...prev.filter((choice) => choice.value !== id),
      { value: id, label: name },
    ]);
    const patch: Record<string, unknown> = { [props.field.key]: id };
    const labelKey = props.field.validation?.write_label_to;
    if (typeof labelKey === 'string') patch[labelKey] = name;
    Object.assign(patch, prefill(saved));
    selection.current = id;
    props.onChange(id);
    latestLifecycle.current?.onDraftPatch?.({ custom_fields: patch });
    setUncertain(false);
    releaseIntent();
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const save = async () => {
    if (active.current || !form.data) return;
    const missing = form.data.fields.find(
      (field) =>
        field.required &&
        (current[field.key] == null || String(current[field.key]).trim() === '')
    );
    if (!intent.current && missing) {
      setError(`Enter ${missing.name}.`);
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    let dispatched = false;
    let recorded = false;
    try {
      if (!intent.current) {
        const fields = Object.fromEntries(
          Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
        );
        const input = {
          kind: config.kind,
          fields,
          confirm_duplicate: duplicateConfirmed,
        };
        let key = `related-${randomUUID()}`;
        let storageKey: string | undefined;
        // Retain only an opaque command ID, in this tab and exact user/scope.
        // Never persist entered financial/contact values in browser storage.
        if (principalId && workspaceId && crypto.subtle) {
          const hash = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(JSON.stringify(input))
          );
          const digest = Array.from(new Uint8Array(hash), (byte) =>
            byte.toString(16).padStart(2, '0')
          ).join('');
          storageKey = `integral.related.intent:${sessionKey}:${digest}`;
          try {
            key = sessionStorage.getItem(storageKey) || key;
            sessionStorage.setItem(storageKey, key);
          } catch {
            storageKey = undefined;
          }
        }
        intent.current = { input, key, storageKey };
      }
      if (!mounted.current) return;
      dispatched = true;
      const response = await extensionsApi.invokeOperation(
        appId,
        config.create_operation,
        intent.current.input,
        intent.current.key
      );
      if (!mounted.current) return;
      if (response.output_disposition === 'withheld') {
        setWithheld(true);
        setUncertain(false);
        setError(
          'This action completed earlier, but its saved result is unavailable. Check the record list or ask an administrator before creating another record.'
        );
        return;
      }
      const output = requireOperationOutput(response).output;
      if (output.ok === false || output.error) {
        releaseIntent();
        setCandidates(
          Array.isArray(output.candidates) ? output.candidates : []
        );
        setError(String(output.message || 'Review the record details.'));
        return;
      }
      recorded = true;
      if (typeof output.entry_id !== 'string' || !output.entry_id)
        throw new Error('The saved record could not be verified.');
      await select(output.entry_id);
    } catch (cause) {
      const status = (cause as { response?: { status?: number } }).response
        ?.status;
      if (recorded && status && status < 500) {
        setWithheld(true);
        setUncertain(false);
        setError(
          'The record was saved, but it could not be opened. Check your access before creating another record.'
        );
        return;
      }
      const unknown = recorded || (dispatched && (!status || status >= 500));
      setUncertain(unknown);
      if (!unknown) releaseIntent();
      setError(
        unknown
          ? 'The result is not confirmed. Keep this form open and retry the same action to check its saved result.'
          : errorMessageFromAxios(
              cause,
              cause instanceof Error
                ? cause.message
                : 'Could not save this record.'
            )
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const changeRelation = useCallback(
    (next: unknown) => {
      props.onChange(next);
      setConflicts([]);
      const id = typeof next === 'string' ? next : '';
      selection.current = id;
      if (!id || !config.prefill) return;
      void entriesApi
        .get(id)
        .then((saved) => {
          if (!mounted.current || selection.current !== id) return;
          if (latestLifecycle.current?.customFields[props.field.key] !== id)
            return;
          const patch = prefill(saved);
          if (Object.keys(patch).length)
            latestLifecycle.current?.onDraftPatch?.({ custom_fields: patch });
        })
        .catch(() => {
          /* Selected relation remains; no guessed defaults. */
        });
    },
    [props, config.prefill, prefill]
  );
  return (
    <div className="space-y-1">
      <Field
        {...props}
        searchable
        onRelationSearch={setSearch}
        onChange={changeRelation}
        relationChoices={[
          ...(props.relationChoices || []).filter(
            (choice) =>
              !extraChoices.some((extra) => extra.value === choice.value)
          ),
          ...extraChoices,
        ]}
      />
      {conflicts.length > 0 && (
        <details>
          <summary>
            Review selected {props.field.name.toLowerCase()} details
          </summary>
          <Text variant="body-sm" tone="muted">
            Your current values were kept. Review before replacing them.
          </Text>
          <dl className="space-y-2">
            {conflicts.map((item) => (
              <div key={item.key}>
                <Text as="dt" variant="label">
                  {item.label}
                </Text>
                <Text as="dd" variant="body-sm">
                  Current: {String(item.current || '—')} · Selected:{' '}
                  {String(item.proposed)}
                </Text>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => {
                latestLifecycle.current?.onDraftPatch?.({
                  custom_fields: Object.fromEntries(
                    conflicts.map((item) => [item.key, item.proposed])
                  ),
                });
                setConflicts([]);
              }}
            >
              Use selected details
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setConflicts([])}
            >
              Keep current details
            </Button>
          </div>
        </details>
      )}
      {canCreate && !props.field.readonly && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy || uncertain}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            if (!withheld) clearForm();
            setOpen(true);
          }}
        >
          Add {props.field.name.toLowerCase()}
        </Button>
      )}
      {open && (
        <Modal
          open
          onClose={close}
          title={`Add ${props.field.name.toLowerCase()}`}
          placement="right"
          disableEscape={busy || uncertain}
        >
          <div className="space-y-4 p-4">
            <Text variant="body" tone="muted">
              Save this record and continue where you left off. It remains
              available even if you cancel the original task.
            </Text>
            {error && (
              <div role="alert">
                <Text variant="body">{error}</Text>
              </div>
            )}
            {withheld && (
              <Text variant="body-sm" tone="muted">
                The earlier action is complete. Start a new record only if you
                need a separate one.
              </Text>
            )}
            {form.isPending && (
              <div role="status">
                <Text variant="body">Loading form…</Text>
              </div>
            )}
            {form.isError && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void form.refetch()}
              >
                Retry loading form
              </Button>
            )}
            <fieldset
              disabled={busy || uncertain || withheld}
              className="space-y-3"
            >
              {form.data?.fields.map((rawField) => {
                const dependency = form.data?.dependent_options?.[rawField.key];
                const field = dependency
                  ? {
                      ...rawField,
                      enum:
                        dependency.values[
                          String(current[dependency.field] || '')
                        ] || [],
                    }
                  : rawField;
                return (
                  <div key={field.key}>
                    <Field
                      field={field}
                      value={current[field.key]}
                      onChange={(value) => {
                        setValues((prev) => {
                          const next = { ...prev, [field.key]: value };
                          for (const [target, rule] of Object.entries(
                            form.data?.dependent_options || {}
                          )) {
                            if (
                              rule.field === field.key &&
                              !(rule.values[String(value)] || []).includes(
                                String(current[target] || '')
                              )
                            )
                              next[target] = '';
                          }
                          return next;
                        });
                        setCandidates([]);
                        setDuplicateConfirmed(false);
                      }}
                      searchable
                    />
                    {field.help && (
                      <Text variant="body-sm" tone="muted">
                        {field.help}
                      </Text>
                    )}
                  </div>
                );
              })}
              {candidates.length > 0 && (
                <div className="space-y-2">
                  <Text variant="body">Use an existing record:</Text>
                  {candidates.map((candidate) => (
                    <Button
                      key={candidate.id}
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (active.current) return;
                        active.current = true;
                        setBusy(true);
                        void select(candidate.id)
                          .catch(() =>
                            setError(
                              'Could not read this record. Check your access and try again.'
                            )
                          )
                          .finally(() => {
                            active.current = false;
                            setBusy(false);
                          });
                      }}
                    >
                      {candidate.title}
                    </Button>
                  ))}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={duplicateConfirmed}
                      onChange={(event) =>
                        setDuplicateConfirmed(event.target.checked)
                      }
                    />
                    Create a separate record with these details
                  </label>
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              {withheld && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={startNewRecord}
                >
                  Start a new record
                </Button>
              )}
              <Button
                type="button"
                loading={busy}
                disabled={
                  withheld ||
                  !form.data ||
                  (candidates.length > 0 && !duplicateConfirmed)
                }
                onClick={() => void save()}
              >
                {uncertain ? 'Check saved result' : 'Save and use'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || uncertain}
                onClick={close}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
