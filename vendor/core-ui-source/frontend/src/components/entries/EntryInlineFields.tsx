import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../../api';
import { errorMessageFromAxios } from '../../api/helpers';
import { invalidateFeedCaches } from '../../queryKeys';
import { Text } from '../../ui';
import { Button } from '../ui/Button';
import { isVisible } from '../views/regionConditions';
import type { Entry, OperationalModelFieldSpec } from '../../types';
import { EntryMetaFields, type EntryMetaFieldsProps } from './EntryMetaFields';
import { SeamlessField } from './SeamlessField';

// Relations, files and derived fields retain their full-form workflows: a
// relation can represent a reverse projection, and an upload has side effects
// before saving. A scalar field edit must never invent those write semantics.
const EDITABLE_TYPES = new Set([
  'text', 'number', 'markdown', 'boolean', 'select', 'multi_select',
  'date', 'datetime', 'member',
]);

export function canInlineEditField(
  field: OperationalModelFieldSpec,
  values: Record<string, unknown>,
  readOnlyKeys: readonly string[],
): boolean {
  return EDITABLE_TYPES.has(field.type) && !field.hidden && !field.key.startsWith('_') &&
    !field.readonly && !readOnlyKeys.includes(field.key) &&
    !(field.readonly_if && isVisible(field.readonly_if, values));
}

interface EntryInlineFieldsProps extends Omit<EntryMetaFieldsProps, 'onCommitField' | 'fieldActions'> {
  entry: Entry;
  onSaved: (entry: Entry) => void;
}

interface FieldDraft {
  field: OperationalModelFieldSpec;
  value: unknown;
  recordRevision: number;
  schemaRevision: number;
}

function hasRevisions(entry: Entry): boolean {
  return Number.isSafeInteger(entry.record_revision) && (entry.record_revision ?? 0) > 0 &&
    Number.isSafeInteger(entry.schema_revision) && (entry.schema_revision ?? 0) > 0;
}

/** One session per record: a late completion cannot edit a newly opened record. */
export function EntryInlineFields(props: EntryInlineFieldsProps) {
  const protectedKeys = Array.from(new Set([
    ...(props.readOnlyKeys ?? []),
    ...Object.keys(props.entry.read_time_fields?.values ?? {}),
    ...Object.keys(props.entry.read_time_fields?.status ?? {}),
  ]));
  return <EntryInlineFieldsSession key={props.entry.id} {...props} readOnlyKeys={protectedKeys} />;
}

function EntryInlineFieldsSession({ entry, onSaved, ...meta }: EntryInlineFieldsProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const mounted = useRef(false);
  const operation = useRef(0);
  const submitting = useRef(false);
  const editor = useRef<HTMLDivElement>(null);
  const latest = useRef({ entry, onSaved, meta });
  useLayoutEffect(() => { latest.current = { entry, onSaved, meta }; });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current++; };
  }, []);
  const editingKey = draft?.field.key;
  useEffect(() => {
    if (editingKey) editor.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
  }, [editingKey]);

  const canEdit = (field: OperationalModelFieldSpec) => {
    const current = meta.fields.find(candidate => candidate.key === field.key);
    return Boolean(current && current.type === field.type && meta.variant === 'detail' &&
      !meta.readOnly && canInlineEditField(current, meta.values, meta.readOnlyKeys ?? []));
  };
  const allowed = !draft || canEdit(draft.field);
  useEffect(() => {
    if (!allowed) { setDraft(null); setError(null); operation.current++; }
  }, [allowed]);

  async function begin(field: OperationalModelFieldSpec) {
    if (!canEdit(field) || submitting.current || loading) return;
    const token = ++operation.current;
    setError(null);
    setLoading(true);
    try {
      // Fetch the full record before exposing an editor; never let the API client substitute
      // a fresh token at save time for the version the person actually edited.
      const current = await entriesApi.get(entry.id);
      const now = latest.current;
      const currentField = now.meta.fields.find(candidate => candidate.key === field.key);
      if (!mounted.current || token !== operation.current || now.meta.readOnly ||
          !currentField || currentField.type !== field.type ||
          !canInlineEditField(currentField, now.meta.values, now.meta.readOnlyKeys ?? [])) return;
      if (current.id !== entry.id || !hasRevisions(current)) {
        throw new Error('Missing record revision');
      }
      setDraft({ field, value: structuredClone(current.custom_fields?.[field.key] ?? null),
        recordRevision: current.record_revision!, schemaRevision: current.schema_revision! });
      setRefreshError(null);
      now.onSaved(current);
    } catch (cause) {
      if (mounted.current && token === operation.current) {
        setError(errorMessageFromAxios(cause, 'Could not open this field. Refresh the entry and try again.'));
      }
    } finally {
      if (mounted.current && token === operation.current) setLoading(false);
    }
  }

  async function save() {
    if (!draft || submitting.current || !canEdit(draft.field)) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    const token = operation.current;
    try {
      const saved = await entriesApi.update(entry.id, {
        custom_fields: { [draft.field.key]: draft.value },
        expected_record_revision: draft.recordRevision,
        expected_schema_revision: draft.schemaRevision,
      });
      // The server still enforces authorization, field validation, approvals
      // and both revisions. Only an authoritative response changes read mode.
      if (saved.id !== entry.id) throw new Error('Unexpected saved record');
      let complete: Entry;
      let refreshFailure: string | null = null;
      try {
        complete = await entriesApi.get(entry.id);
        if (complete.id !== entry.id || !hasRevisions(complete) ||
            (complete.record_revision ?? 0) < (saved.record_revision ?? 0)) {
          throw new Error('Unexpected refreshed record');
        }
      } catch (cause) {
        // A successful write must never be reported as a failed save or
        // offered for blind replay. Retain structural context; live projections
        // become explicitly unknown and stay protected until a full read works.
        const prior = latest.current.entry;
        const keys = Array.from(new Set([
          ...Object.keys(prior.read_time_fields?.values ?? {}),
          ...Object.keys(prior.read_time_fields?.status ?? {}),
        ]));
        complete = { ...prior, ...saved, ...(keys.length ? { read_time_fields: {
          values: Object.fromEntries(keys.map(key => [key, null])),
          status: Object.fromEntries(keys.map(key => [key, 'unavailable'])),
        } } : {}) };
        refreshFailure = errorMessageFromAxios(cause, 'The latest entry could not be loaded.');
      }
      void queryClient.invalidateQueries({ queryKey: ['entry', entry.id] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void invalidateFeedCaches(queryClient);
      if (mounted.current && token === operation.current) {
        setDraft(null);
        setRefreshError(refreshFailure);
        latest.current.onSaved(complete);
      }
    } catch (cause) {
      if (mounted.current && token === operation.current) {
        setError(errorMessageFromAxios(cause, 'Could not save this field. Your draft is still here.'));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function cancel() {
    if (submitting.current) return;
    operation.current++;
    setDraft(null); setError(null); setLoading(false);
  }

  async function refresh() {
    if (submitting.current || loading) return;
    const token = ++operation.current;
    setLoading(true);
    try {
      const current = await entriesApi.get(entry.id);
      if (current.id !== entry.id || !hasRevisions(current)) throw new Error('Unexpected refreshed record');
      if (mounted.current && token === operation.current) {
        setRefreshError(null); latest.current.onSaved(current);
      }
    } catch (cause) {
      if (mounted.current && token === operation.current) {
        setRefreshError(errorMessageFromAxios(cause, 'The latest entry could not be loaded.'));
      }
    } finally {
      if (mounted.current && token === operation.current) setLoading(false);
    }
  }

  const errorNotice = error ? (
    <div role="alert">
      <Text as="p" variant="body-sm" tone="danger">Could not edit this field.</Text>
      <details>
        <summary>Show error details</summary>
        <Text as="p" variant="body-sm">{error}</Text>
      </details>
    </div>
  ) : null;

  return (
    <>
      <EntryMetaFields {...meta} fieldActions={{
        canEdit, onEdit: field => { void begin(field); }, editingKey: allowed ? draft?.field.key : undefined,
        disabled: loading || saving || Boolean(draft),
        editor: draft && allowed ? (
          <div ref={editor} role="group" aria-label={`Edit ${draft.field.name}`} className="space-y-2"
            onKeyDown={event => {
              // The entry dialog also listens for Escape. Cancel this draft
              // first; no blur or keyboard shortcut implicitly saves it.
              if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
            }}>
            <fieldset disabled={saving}>
              <legend className="sr-only">{draft.field.name}</legend>
              <SeamlessField externalLabel field={draft.field} value={draft.value}
                enumLabels={meta.workflowEnumLabels?.[draft.field.key]}
                onChange={value => {
                  if (!submitting.current) setDraft(current => current ? { ...current, value } : current);
                }} />
            </fieldset>
            {errorNotice}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" loading={saving} onClick={() => { void save(); }}>Save</Button>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={cancel}>Cancel</Button>
            </div>
          </div>
        ) : undefined,
      }} />
      {loading ? <div role="status"><Text variant="body-sm">Loading field…</Text></div> : null}
      {!draft ? errorNotice : null}
      {refreshError ? (
        <div role="status" className="space-y-2">
          <Text as="p" variant="body-sm" tone="warn">Field saved. Refresh the entry to check its latest live fields.</Text>
          <details><summary>Show refresh error</summary><Text as="p" variant="body-sm">{refreshError}</Text></details>
          <Button type="button" variant="secondary" size="sm" disabled={saving || loading || Boolean(draft)}
            onClick={() => { void refresh(); }}>Refresh entry</Button>
        </div>
      ) : null}
    </>
  );
}
