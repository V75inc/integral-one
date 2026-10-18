import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select, Surface, Text } from '../../ui';
import { SeamlessField } from './SeamlessField';
import { entriesApi, tracksApi } from '../../api';
import { toolsApi } from '../../api/tools';
import { useToast } from '../../context/ToastContext';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import type {
  OperationalModelFieldSpec,
  CreateWizardConfig,
  CreateWizardPeriodOption,
  CreateWizardStep,
  Entry,
  EntryTypeNode,
  Track,
} from '../../types';

/**
 * Generic multi-step "create flow" — region_system's ``create_wizard``
 * primitive (see operational_model_compile.py's ``_normalize_create_wizard``
 * for the full config shape this renders). Opt-in per entry type via
 * ``form_schema.create_wizard``, same convention as ``open_as_page``.
 *
 * Three step kinds, each reusing an existing rendering convention rather
 * than inventing a new one:
 *  - ``form``: SeamlessField per field key (same dispatch every other
 *    entry form/table cell already uses), optionally prefilled by a
 *    no-arg workspace tool call (e.g. compute_next_period).
 *  - ``entry_checklist``: pick N of M entries from a track, with columns
 *    resolved either from the row's own fields or joined through a
 *    RELATED track (e.g. an employee's latest compensation rate) — the
 *    one genuinely new, reusable piece; not payroll-specific.
 *  - ``summary``: read-only review before submit.
 *
 * On finish: creates the entry from the form step(s)' values, then calls
 * ``on_create_tool`` with ``entry_id`` + the checked entry_checklist ids
 * under ``on_create_ids_param`` — e.g. payroll-app's pay_run wires this to
 * populate_pay_run_lines_for_employees.
 */

interface CreateWizardModalProps {
  open: boolean;
  track: Track;
  entryType: EntryTypeNode;
  onClose(): void;
  onCreated(entry: Entry): void;
}

interface ChecklistRow {
  entry: Entry;
  checked: boolean;
}

/** Values are read off raw custom_fields with no field-type metadata in
 *  reach here, so a bare snake_case string (an unlabeled select/enum
 *  value, e.g. "full_time") reads as internal plumbing rather than
 *  copy — humanize it the same way every other enum-value display in the
 *  app does. Numbers/booleans pass through humanizeEnumValue unchanged
 *  (no underscores to split on), so this is safe for any column shape. */
function formatDisplayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return humanizeEnumValue(value) || '—';
  return String(value);
}

function resolveDisplayValue(
  row: Entry,
  col: { source_field?: string; join?: { track_type: string; on_field: string; show_field: string } },
  joinedByTrack: Record<string, Entry[]>
): string {
  if (col.join) {
    const candidates = joinedByTrack[col.join.track_type] || [];
    const match = candidates.find(
      e => String((e.custom_fields || {})[col.join!.on_field] || '') === row.id
    );
    const value = match ? (match.custom_fields || {})[col.join.show_field] : undefined;
    return formatDisplayValue(value);
  }
  const key = col.source_field || '';
  const value = key === 'title' ? row.title : (row.custom_fields || {})[key];
  return formatDisplayValue(value);
}

export function CreateWizardModal({
  open,
  track,
  entryType,
  onClose,
  onCreated,
}: CreateWizardModalProps) {
  const { showToast } = useToast();
  const config = entryType.form_schema?.create_wizard as CreateWizardConfig | undefined;
  const steps = useMemo<CreateWizardStep[]>(() => config?.steps ?? [], [config]);
  const fields = useMemo<OperationalModelFieldSpec[]>(
    () => entryType.form_schema?.fields ?? [],
    [entryType]
  );
  const fieldByKey = useMemo(() => {
    const out = new Map<string, OperationalModelFieldSpec>();
    for (const f of fields) out.set(f.key, f);
    return out;
  }, [fields]);

  const [stepIndex, setStepIndex] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [checklistRows, setChecklistRows] = useState<ChecklistRow[]>([]);
  const [joinedByTrack, setJoinedByTrack] = useState<Record<string, Entry[]>>({});
  const [loadingStep, setLoadingStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefilledSteps, setPrefilledSteps] = useState<Set<number>>(new Set());
  // Keyed by `${stepIndex}:${filter's compared form value}` — a checklist
  // filtered against an earlier step's field (e.g. frequency) must reload
  // if the preparer goes back and changes that field, not just once ever.
  const [loadedChecklistSteps, setLoadedChecklistSteps] = useState<Set<string>>(new Set());
  const [periodOptions, setPeriodOptions] = useState<CreateWizardPeriodOption[]>([]);
  // Keyed by `${stepIndex}:${input_fields values}`, not just stepIndex —
  // a period_picker step can carry its own editable input_fields (e.g.
  // frequency) inline, and changing one must re-fetch periods for the new
  // value rather than reusing whatever was fetched for the old one.
  const [loadedPeriodSteps, setLoadedPeriodSteps] = useState<Set<string>>(new Set());
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [periodLoadNotice, setPeriodLoadNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setFormValues({});
      setChecklistRows([]);
      setJoinedByTrack({});
      setPrefilledSteps(new Set());
      setLoadedChecklistSteps(new Set());
      setPeriodOptions([]);
      setLoadedPeriodSteps(new Set());
      setSelectedPeriodIndex(0);
      setPeriodLoadNotice(null);
    }
  }, [open]);

  const step = steps[stepIndex];

  // Prefill a 'form' step's values from its prefill_tool, once per step.
  useEffect(() => {
    if (!open || !step || step.kind !== 'form' || !step.prefill_tool) return;
    if (prefilledSteps.has(stepIndex)) return;
    let cancelled = false;
    setLoadingStep(true);
    toolsApi
      .call(step.prefill_tool, {})
      .then(({ output }) => {
        if (cancelled) return;
        const fieldKeys = new Set(step.fields || []);
        const merged: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(output)) {
          if (fieldKeys.has(k)) merged[k] = v;
        }
        setFormValues(prev => ({ ...merged, ...prev }));
      })
      .catch(() => {
        /* prefill is best-effort — the fields just start empty */
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStep(false);
          setPrefilledSteps(prev => new Set(prev).add(stepIndex));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, stepIndex]);

  // Default a 'period_picker' step's own input_fields (e.g. frequency) to
  // their field spec's default/first enum option the first time the step
  // is shown, if not already set — so there's always a starting value to
  // both render a selected control and key the first periods_tool call
  // off, instead of leaving it blank until the user touches it.
  useEffect(() => {
    if (!open || !step || step.kind !== 'period_picker') return;
    const missing = (step.input_fields || []).filter(k => formValues[k] === undefined);
    if (!missing.length) return;
    setFormValues(prev => {
      const next = { ...prev };
      for (const key of missing) {
        const f = fieldByKey.get(key);
        const fallback = f?.default ?? f?.enum?.[0];
        if (fallback !== undefined) next[key] = fallback;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, stepIndex]);

  // Load a 'period_picker' step's candidate periods — re-fetches whenever
  // its own input_fields change (e.g. the preparer switches Frequency
  // inline in this same step), not just once per step. The first result is
  // pre-selected (the periods_tool's own job to order "soonest first",
  // e.g. compute_upcoming_pay_periods).
  const periodInputValuesKey =
    step?.kind === 'period_picker'
      ? JSON.stringify((step.input_fields || []).map(k => formValues[k]))
      : '';
  useEffect(() => {
    if (!open || !step || step.kind !== 'period_picker' || !step.periods_tool) return;
    // Wait for the defaulting effect above to fill in any input_fields
    // before firing — an undefined value would query with a hole in it.
    if ((step.input_fields || []).some(k => formValues[k] === undefined)) return;
    const cacheKey = `${stepIndex}:${periodInputValuesKey}`;
    if (loadedPeriodSteps.has(cacheKey)) return;
    let cancelled = false;
    setLoadingStep(true);
    const args: Record<string, unknown> = {};
    for (const key of step.input_fields || []) {
      if (formValues[key] !== undefined) args[key] = formValues[key];
    }
    toolsApi
      .call(step.periods_tool, args)
      .then(({ output }) => {
        if (cancelled) return;
        const periods = (output.periods as CreateWizardPeriodOption[]) || [];
        setPeriodOptions(periods);
        setSelectedPeriodIndex(0);
        if (periods[0]) {
          setPeriodLoadNotice(null);
          const fieldKeys = new Set(step.fields || []);
          const values: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(periods[0])) {
            if (fieldKeys.has(k)) values[k] = v;
          }
          setFormValues(prev => ({ ...values, ...prev }));
        } else {
          setPeriodOptions([]);
          // The tool itself reports why (e.g. "No Pay Calendar configured")
          // when it returns ok:false — surface that instead of just
          // silently hiding the Quick pick dropdown with no explanation.
          // Still not fatal: the date fields below stay usable either way.
          setPeriodLoadNotice(
            typeof output.reason === 'string' && output.reason
              ? output.reason
              : 'No quick-pick periods available — set the dates below directly.'
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPeriodOptions([]);
        setPeriodLoadNotice(
          'Could not load quick-pick periods — set the dates below directly.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStep(false);
          setLoadedPeriodSteps(prev => new Set(prev).add(cacheKey));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, stepIndex, periodInputValuesKey]);

  const selectPeriod = (index: number) => {
    setSelectedPeriodIndex(index);
    const chosen = periodOptions[index];
    if (!chosen || !step || step.kind !== 'period_picker') return;
    const fieldKeys = new Set(step.fields || []);
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(chosen)) {
      if (fieldKeys.has(k)) values[k] = v;
    }
    setFormValues(prev => ({ ...prev, ...values }));
  };

  // Load an 'entry_checklist' step's rows (+ any joined tracks) — re-fetches
  // if the filter's compared form value changes (e.g. Frequency), otherwise
  // once per step.
  const checklistCacheKey = `${stepIndex}:${
    step?.kind === 'entry_checklist' && step.filter
      ? String(formValues[step.filter.against_form_field] ?? '')
      : ''
  }`;
  useEffect(() => {
    if (!open || !step || step.kind !== 'entry_checklist') return;
    if (loadedChecklistSteps.has(checklistCacheKey)) return;
    let cancelled = false;
    setLoadingStep(true);
    (async () => {
      const allTracks = await tracksApi.list();
      const sourceTrack = allTracks.find(
        (t: Track) => t.title === step.source_track_type
      );
      if (!sourceTrack) {
        if (!cancelled) {
          setChecklistRows([]);
          setLoadingStep(false);
          setLoadedChecklistSteps(prev => new Set(prev).add(checklistCacheKey));
        }
        return;
      }
      const rows: Entry[] = await entriesApi.list({ track_id: sourceTrack.id, limit: 500 });
      const active = step.active_field
        ? rows.filter(r => {
            const v = (r.custom_fields || {})[step.active_field as string];
            return v === undefined || v === null || v === '' || v === 'active' || v === true;
          })
        : rows;

      const joinTrackTypes = Array.from(
        new Set(
          [
            ...(step.display_columns || []).map(c => c.join?.track_type),
            step.filter?.join.track_type,
          ].filter((t): t is string => Boolean(t))
        )
      );
      const joined: Record<string, Entry[]> = {};
      for (const joinTrackType of joinTrackTypes) {
        const jt = allTracks.find((t: Track) => t.title === joinTrackType);
        if (jt) {
          joined[joinTrackType] = await entriesApi.list({ track_id: jt.id, limit: 1000 });
        }
      }

      // Narrow to rows whose related record (via filter.join) matches the
      // value collected under an earlier step's form field — e.g. only
      // employees whose Compensation Record pay_frequency equals the
      // frequency picked in step 1. Absent filter = every active row, same
      // as before this existed.
      const filtered = step.filter
        ? active.filter(row => {
            const f = step.filter!;
            const candidates = joined[f.join.track_type] || [];
            const match = candidates.find(
              e => String((e.custom_fields || {})[f.join.on_field] || '') === row.id
            );
            const actual = match ? (match.custom_fields || {})[f.join.match_field] : undefined;
            const want = formValues[f.against_form_field];
            return want === undefined || want === '' || String(actual) === String(want);
          })
        : active;

      if (!cancelled) {
        setChecklistRows(filtered.map(entry => ({ entry, checked: true })));
        setJoinedByTrack(joined);
        setLoadingStep(false);
        setLoadedChecklistSteps(prev => new Set(prev).add(checklistCacheKey));
      }
    })().catch(() => {
      if (!cancelled) setLoadingStep(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, stepIndex, checklistCacheKey]);

  if (!open || !config || steps.length === 0) return null;

  const isLastStep = stepIndex === steps.length - 1;
  const checkedCount = checklistRows.filter(r => r.checked).length;
  // A required entry_checklist step with nothing checked must block
  // progressing past it — most concretely, a filtered candidate list that
  // comes back empty (e.g. no Compensation Record matches the chosen pay
  // frequency) previously still let the wizard finish with "0 selected
  // where applicable" and no warning, silently creating a Pay Run with no
  // employees.
  const blockedByRequiredChecklist =
    step?.kind === 'entry_checklist' && Boolean(step.required) && checkedCount === 0;

  const toggleAll = (checked: boolean) =>
    setChecklistRows(prev => prev.map(r => ({ ...r, checked })));
  const toggleOne = (id: string) =>
    setChecklistRows(prev =>
      prev.map(r => (r.entry.id === id ? { ...r, checked: !r.checked } : r))
    );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const typeSlug = entryType.form_schema?._manifest_entry_type_key || entryType.name;
      // No dedicated title field in a typical wizard form step (just
      // period/etc dates) — derive a readable default from a date-shaped
      // field if one's present, same "Month YYYY" convention the existing
      // create_next_pay_run tool already uses, rather than leaving every
      // wizard-created entry titled "New X". Prefers a field literally
      // named "period_start"/"start"/"date" over object key order, which
      // isn't a reliable "first meaningful date" signal.
      const preferredKeys = ['period_start', 'start_date', 'start', 'date'];
      const dateFieldValue = (preferredKeys
        .map(k => formValues[k])
        .find(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ??
        Object.values(formValues).find(
          v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
        )) as string | undefined;
      // Parse the YYYY-MM-DD parts directly rather than `new Date(str)` —
      // that parses bare date strings as UTC midnight, which rolls back a
      // day (sometimes a MONTH) once formatted in a negative-UTC-offset
      // browser timezone (found live: period_start "2026-08-01" titled
      // itself "July 2026").
      const derivedTitle = dateFieldValue
        ? (() => {
            const [y, m] = dateFieldValue.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            });
          })()
        : undefined;
      const created = await entriesApi.create({
        track_id: track.id,
        type: typeSlug,
        type_id: entryType.id,
        title: String(formValues.title || derivedTitle || `New ${entryType.name}`),
        custom_fields: formValues,
      });
      const checklistStep = steps.find(s => s.kind === 'entry_checklist');
      if (checklistStep && config.on_create_tool) {
        const ids = checklistRows.filter(r => r.checked).map(r => r.entry.id);
        await toolsApi.call(config.on_create_tool, {
          entry_id: created.id,
          [config.on_create_ids_param]: ids,
        });
      }
      showToast(`${entryType.name} created`, 'success');
      onCreated(created);
      onClose();
    } catch {
      showToast('Failed to create — please try again', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Create ${entryType.name}`}>
      <Modal.Body>
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full ${
                  i <= stepIndex ? 'bg-[var(--link)]' : 'bg-[var(--panel-border)]'
                }`}
              />
            </div>
          ))}
        </div>
        <Text as="div" variant="heading-sm">
          {step.title || step.kind}
        </Text>

        {loadingStep ? (
          <Surface tone="panel-2" radius="input" padding="md">
            <Text as="span" variant="body-sm" tone="muted">
              Loading…
            </Text>
          </Surface>
        ) : step.kind === 'form' ? (
          <div className="space-y-3">
            {(step.fields || []).map(key => {
              const field = fieldByKey.get(key);
              if (!field) return null;
              return (
                <div key={key}>
                  <SeamlessField
                    field={field}
                    value={formValues[key]}
                    onChange={next => setFormValues(prev => ({ ...prev, [key]: next }))}
                    siblingFields={entryType.form_schema?.fields}
                    siblingValues={formValues}
                  />
                </div>
              );
            })}
          </div>
        ) : step.kind === 'period_picker' ? (
          <div className="space-y-3">
            {/* input_fields render inline as normal controls (e.g. a
             *  Frequency select) — changing one re-fetches periods for the
             *  new value via the periodInputValuesKey-keyed effect above,
             *  so frequency and period selection live in this one step.
             *  No wrapping label here — SeamlessField self-labels (see the
             *  bare usage below and in EntryFormExpanded.renderDynamicField);
             *  wrapping it duplicated the label for any required/filled
             *  field, since SeamlessField's floating label shows whenever
             *  the field is required, focused, or has a value. */}
            {(step.input_fields || []).map(key => {
              const field = fieldByKey.get(key);
              if (!field) return null;
              return (
                <div key={key}>
                  <SeamlessField
                    field={field}
                    value={formValues[key]}
                    onChange={next => setFormValues(prev => ({ ...prev, [key]: next }))}
                    siblingFields={entryType.form_schema?.fields}
                    siblingValues={formValues}
                  />
                </div>
              );
            })}
            {periodOptions.length === 0 && periodLoadNotice && (
              <Surface tone="panel-2" radius="input" padding="sm">
                <Text as="span" variant="body-sm" tone="muted">
                  {periodLoadNotice}
                </Text>
              </Surface>
            )}
            {periodOptions.length > 0 && (
              <div className="space-y-1">
                <Text as="label" variant="label">
                  Quick pick
                </Text>
                <Select
                  value={String(selectedPeriodIndex)}
                  onChange={e => selectPeriod(Number(e.target.value))}
                >
                  {periodOptions.map((opt, i) => (
                    <option key={i} value={i}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {/* step.fields (period_start/period_end/pay_date) are always
             *  real, editable date fields — the Quick pick dropdown above
             *  is only a shortcut that fills them in, never the sole way
             *  to set them. A one-off or irregular period (doesn't match
             *  the Pay Calendar's fixed cadence) still needs to be
             *  settable by hand. */}
            {(step.fields || []).map(key => {
              const field = fieldByKey.get(key);
              if (!field) return null;
              return (
                <div key={key}>
                  <SeamlessField
                    field={field}
                    value={formValues[key]}
                    onChange={next => setFormValues(prev => ({ ...prev, [key]: next }))}
                    siblingFields={entryType.form_schema?.fields}
                    siblingValues={formValues}
                  />
                </div>
              );
            })}
          </div>
        ) : step.kind === 'entry_checklist' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Text as="span" variant="body-sm" tone="muted">
                {checkedCount} of {checklistRows.length} selected
              </Text>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-[var(--link)] hover:underline"
                  onClick={() => toggleAll(true)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-[var(--link)] hover:underline"
                  onClick={() => toggleAll(false)}
                >
                  Select none
                </button>
              </div>
            </div>
            <Surface tone="panel" radius="card" padding="none" className="overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--panel-border)]">
                    <th className="w-8" />
                    {(step.display_columns || []).map(col => (
                      <th key={col.key} className="text-left px-3 py-2">
                        <Text as="span" variant="meta" tone="muted">
                          {col.label}
                        </Text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checklistRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={(step.display_columns || []).length + 1}
                        className="px-3 py-6 text-center"
                      >
                        <Text as="span" variant="body-sm" tone="muted">
                          {step.filter
                            ? 'No matching records for the values chosen in an earlier step.'
                            : 'No records to select.'}
                        </Text>
                      </td>
                    </tr>
                  )}
                  {checklistRows.map(row => (
                    <tr key={row.entry.id} className="border-b border-[var(--panel-border)]">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={() => toggleOne(row.entry.id)}
                        />
                      </td>
                      {(step.display_columns || []).map(col => (
                        <td key={col.key} className="px-3 py-2">
                          <Text as="span" variant="body-sm">
                            {resolveDisplayValue(row.entry, col, joinedByTrack)}
                          </Text>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
            {step.required && checkedCount === 0 && (
              <Surface tone="panel-2" radius="input" padding="sm">
                <Text as="span" variant="body-sm" tone="danger">
                  Select at least one before continuing.
                </Text>
              </Surface>
            )}
          </div>
        ) : (
          <Surface tone="panel-2" radius="input" padding="md">
            <Text as="span" variant="body-sm">
              Ready to create — {checkedCount} selected where applicable.
            </Text>
          </Surface>
        )}
      </Modal.Body>

      <Modal.Footer align="between">
        <Button
          variant="outline"
          size="sm"
          disabled={stepIndex === 0 || submitting}
          onClick={() => setStepIndex(i => Math.max(0, i - 1))}
        >
          Back
        </Button>
        {isLastStep ? (
          <Button
            size="sm"
            loading={submitting}
            disabled={blockedByRequiredChecklist}
            onClick={handleSubmit}
          >
            Create
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={blockedByRequiredChecklist}
            onClick={() => setStepIndex(i => Math.min(steps.length - 1, i + 1))}
          >
            Next
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/** Resolve the create_wizard config for a track's default/selected entry
 *  type, if it has one — the check EntryComposer uses to decide whether
 *  to open this wizard instead of the plain create dialog. */
export function findCreateWizardEntryType(
  entryTypes: EntryTypeNode[] | undefined | null,
  preferredKey?: string
): EntryTypeNode | undefined {
  const types = entryTypes ?? [];
  if (preferredKey) {
    const match = types.find(
      et => et.form_schema?._manifest_entry_type_key === preferredKey
    );
    if (match?.form_schema?.create_wizard) return match;
  }
  return types.find(et => et.form_schema?.create_wizard);
}
