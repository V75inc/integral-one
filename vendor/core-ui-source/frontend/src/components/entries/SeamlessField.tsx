import { useContext, useState, type ReactNode } from 'react';
import { Pencil, X } from 'lucide-react';
import { AppSelect, DatePicker } from '../ui';
import type { OperationalModelFieldSpec } from '../../types';
import { buildFieldPlaceholder } from '../../utils/fieldPlaceholders';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import { SeamlessFileFieldInner } from './SeamlessFileFieldInner';
import { resolveFieldType, MissingFieldType, checklistFieldRegistration } from './fieldTypes';
import { IconButton, Text } from '../../ui';
import { JsonTableEditor, isJsonTableShape } from './JsonTableEditor';
import { useRelationLabels, RelationValue } from './relations';
import { RelationMultiSelectCombobox } from './RelationMultiSelectCombobox';
import { AnchorTrackField, isAnchorTrackRelation } from './AnchorTrackField';
import {
  FieldLabelContent,
  fieldAriaLabel,
  isFieldRequired,
} from './fieldLabel';
import { projectComputedValues } from './computedExpression';
import type { RelationNavContext } from './relations/routeForRelationTarget';
import { ExternalLabelContext } from './fieldLabelContext';

/** Resolve a single relation id via the shared cache when the picker's
 *  preloaded opts don't cover it (cross-track relation, late preload, etc.).
 *  Renders as plain text — the surrounding chip provides the visual frame. */
function RelationChipFallbackLabel({
  id,
  relation,
}: {
  id: string;
  relation: OperationalModelFieldSpec['relation'];
}) {
  const { targets } = useRelationLabels(id, relation);
  const label = targets[0]?.label;
  // Until resolved, show the short-id fallback inline (no skeleton inside
  // a chip — flashing chips look broken).
  return <>{label ?? `Entry ${String(id).slice(-6)}`}</>;
}

/** Shared horizontal inset with title/body in the entry composer (`px-3` / `pl-3`).
 *  Also strips native number-input spinner arrows (Chrome/Safari via the
 *  webkit pseudo-elements, Firefox via `appearance:textfield`) — a plain
 *  click near the right edge of a narrow cell (e.g. editable-table wage
 *  columns) was landing on the spinner and silently bumping the value by 1
 *  instead of placing the cursor to type. No-op on non-number inputs. */
const FIELD_INPUT_CLASS =
  'w-full bg-transparent px-3 py-2 text-sm font-normal leading-normal text-[var(--text)] placeholder:text-[var(--text-muted)] border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const FIELD_TEXTAREA_CLASS = `${FIELD_INPUT_CLASS} min-h-[5rem] resize-y align-top`;

export interface SeamlessFieldRelationChoice {
  value: string;
  label: string;
}

export interface SeamlessFieldProps {
  /** Detail grid owns the visible label and left alignment. */
  externalLabel?: boolean;
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  relationChoices?: SeamlessFieldRelationChoice[];
  relationLoading?: boolean;
  /** Other fields on this entry type, used to evaluate a computed expression. */
  siblingFields?: OperationalModelFieldSpec[];
  /** Current values of those fields, including unsaved edits. */
  siblingValues?: Record<string, unknown>;
  /** Optional display labels for select / multi_select enum keys (e.g. kanban column labels). */
  enumLabels?: Record<string, string>;
  /** Opt-in type-ahead for select fields: a search box filters the options. */
  searchable?: boolean;
  /**
   * Required for ``file`` / ``files`` field types — the inline file
   * picker uploads against this entry id before binding the
   * attachment to the field's value. Safe to omit for other field
   * types.
   */
  entryId?: string;
  /** Public share wizard — file uploads use token-scoped endpoints. */
  publicShare?: { token: string; entryId: string };
  /** Upload via `/me/assigned-form/attachments` (member assigned-form API). */
  memberFormUpload?: boolean;
  /** Dismiss host modal (etc.) before following a relation link. */
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}

function resolveEnumOptionLabel(
  opt: string,
  enumLabels?: Record<string, string>
): string {
  const custom = enumLabels?.[opt];
  if (custom?.trim()) return custom.trim();
  return humanizeEnumValue(opt);
}

function hasMeaningfulValue(value: unknown, fieldType: string): boolean {
  if (value == null || value === '') return false;
  if (fieldType === 'number' && typeof value === 'number' && !Number.isNaN(value)) {
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function FloatingLabel({
  show,
  name,
  required = false,
}: {
  show: boolean;
  name: string;
  required?: boolean;
}) {
  if (!show) return null;
  return (
    <span
      className="pointer-events-none absolute -top-2.5 left-3 z-[1] rounded px-1 text-[12px] font-medium text-[var(--text-muted)] bg-[var(--panel)]"
      aria-hidden
    >
      <FieldLabelContent name={name} required={required} />
    </span>
  );
}

function SeamlessShell({
  children,
  showLabel,
  field,
  active,
  className = '',
  hideLabel = false,
}: {
  hideLabel?: boolean;
  children: ReactNode;
  showLabel: boolean;
  field: OperationalModelFieldSpec;
  active: boolean;
  className?: string;
}) {
  const required = isFieldRequired(field);
  const externalLabel = useContext(ExternalLabelContext);
  return (
    <div
      className={`
        relative rounded-md border transition-[border-color,background-color] duration-fast
        ${active ? 'border-[var(--panel-border)] bg-[var(--panel)]' : 'border-transparent bg-transparent hover:bg-[var(--panel-2)]'}
        ${className}
      `}
      aria-required={required || undefined}
    >
      {!(hideLabel || externalLabel) && (
        <FloatingLabel show={showLabel} name={field.name} required={required} />
      )}
      {children}
    </div>
  );
}

function StaticFieldLabel({ field }: { field: OperationalModelFieldSpec }) {
  return (
    <p className="text-xs text-[var(--text-muted)] mb-1">
      <FieldLabelContent name={field.name} required={isFieldRequired(field)} />
    </p>
  );
}

function InlineFieldLabel({ field }: { field: OperationalModelFieldSpec }) {
  return (
    <p className="text-[12px] font-medium text-[var(--text-muted)]">
      <FieldLabelContent name={field.name} required={isFieldRequired(field)} />
    </p>
  );
}

function LegacyField(props: SeamlessFieldProps) {
  const {
    field,
    value,
    onChange,
    relationChoices = [],
    relationLoading,
    enumLabels,
    onNavigate,
    navContext,
    entryId,
    publicShare,
    memberFormUpload,
  } = props;
  const v = value;
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 pl-3 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={Boolean(v)}
          disabled={field.readonly}
          onChange={e => onChange(e.currentTarget.checked)}
        />
        <FieldLabelContent name={field.name} required={isFieldRequired(field)} />
      </label>
    );
  }
  if (field.type === 'select') {
    const enumStrings = (field.enum ?? []) as string[];
    const opts = enumStrings.map(opt => ({
      value: opt,
      label: resolveEnumOptionLabel(opt, enumLabels),
    }));
    return (
      <>
        <StaticFieldLabel field={field} />
        <AppSelect
          className="app-input text-sm py-2 w-full"
          value={String(v || '')}
          onValueChange={val => onChange(val)}
          disabled={field.readonly}
          options={[{ value: '', label: 'Enter…' }, ...opts]}
          aria-label={fieldAriaLabel(field)}
        />
      </>
    );
  }
  if (field.type === 'multi_select') {
    const selected = Array.isArray(v) ? (v as string[]).map(String) : [];
    const enumValues = (field.enum ?? []) as string[];
    return (
      <>
        <StaticFieldLabel field={field} />
        <div className="max-h-36 overflow-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel)] p-2 space-y-1">
          {enumValues.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No options configured.</p>
          ) : (
            enumValues.map(opt => (
              <label key={opt} className="flex items-center gap-2 text-xs text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  disabled={field.readonly}
                  onChange={e => {
                    const next = e.currentTarget.checked
                      ? [...selected, opt]
                      : selected.filter(x => x !== opt);
                    onChange(next);
                  }}
                />
                {resolveEnumOptionLabel(opt, enumLabels)}
              </label>
            ))
          )}
        </div>
      </>
    );
  }
  if (field.type === 'relation') {
    if (isAnchorTrackRelation(field)) {
      return (
        <AnchorTrackField
          field={field}
          value={value}
          onChange={onChange}
          readonly={Boolean(field.readonly)}
          onNavigate={onNavigate}
          navContext={navContext}
        />
      );
    }
    const relation = field.relation || {};
    const opts = relationChoices;
    const many = Boolean(relation.many);
    const emptyLabel =
      field.key === 'sprint'
        ? 'No sprint'
        : relationLoading
          ? 'Loading…'
          : 'Select…';
    if (many) {
      const selected = Array.isArray(v) ? (v as string[]) : [];
      return (
        <>
          <StaticFieldLabel field={field} />
          <div className="max-h-36 overflow-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel)] p-2 space-y-1">
            {relationLoading ? (
              <p className="text-xs text-[var(--text-muted)]">Loading options…</p>
            ) : opts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No matching entries found.</p>
            ) : (
              opts.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-xs text-[var(--text)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    disabled={field.readonly}
                    onChange={e => {
                      const next = e.currentTarget.checked
                        ? [...selected, opt.value]
                        : selected.filter(x => x !== opt.value);
                      onChange(next);
                    }}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </>
      );
    }
    return (
      <>
        <StaticFieldLabel field={field} />
        <AppSelect
          className="app-input text-sm py-2 w-full"
          value={String(v || '')}
          onValueChange={val => onChange(val || null)}
          disabled={field.readonly}
          options={[
            { value: '', label: emptyLabel },
            ...opts,
          ]}
          aria-label={fieldAriaLabel(field)}
        />
      </>
    );
  }

  if (field.type === 'file' || field.type === 'files') {
    return (
      <SeamlessFileFieldInner
        field={field}
        value={value}
        onChange={onChange}
        many={field.type === 'files'}
        readonly={Boolean(field.readonly)}
        entryId={entryId}
        publicShare={publicShare}
        memberFormUpload={memberFormUpload}
      />
    );
  }

  if (field.type === 'date' || field.type === 'datetime') {
    const stringVal = v == null ? '' : String(v);
    return (
      <>
        <StaticFieldLabel field={field} />
        <DatePicker
          mode={field.type === 'datetime' ? 'datetime' : 'date'}
          value={stringVal}
          onChange={val => onChange(val)}
          disabled={field.readonly}
          placeholder={buildFieldPlaceholder(field)}
          aria-label={fieldAriaLabel(field)}
          variant="field"
          className="w-full"
        />
      </>
    );
  }

  const inputType = field.type === 'number' ? 'number' : 'text';

  const stringVal =
    v == null
      ? ''
      : field.type === 'json' && typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);

  return (
    <>
      <StaticFieldLabel field={field} />
      {field.type === 'markdown' || field.type === 'json' ? (
        <textarea
          value={stringVal}
          onChange={e => {
            const t = e.target.value;
            if (field.type === 'json') {
              try {
                onChange(t.trim() ? JSON.parse(t) : null);
              } catch {
                onChange(t);
              }
            } else {
              onChange(t);
            }
          }}
          placeholder={buildFieldPlaceholder(field)}
          disabled={field.readonly}
          rows={field.type === 'markdown' ? 4 : 3}
          aria-label={fieldAriaLabel(field)}
          className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm font-normal text-[var(--text)] placeholder:text-[var(--text-muted)] resize-y min-h-[4.5rem]"
        />
      ) : (
        <input
          type={inputType}
          value={stringVal}
          onChange={e =>
            onChange(
              field.type === 'number'
                ? Number(e.target.value || 0)
                : e.target.value
            )
          }
          onWheel={
            inputType === 'number'
              ? e => (e.currentTarget as HTMLInputElement).blur()
              : undefined
          }
          placeholder={buildFieldPlaceholder(field)}
          disabled={field.readonly}
          aria-label={fieldAriaLabel(field)}
          className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm font-normal text-[var(--text)] placeholder:text-[var(--text-muted)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}
    </>
  );
}

function SeamlessSelectInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
  enumLabels,
  searchable = false,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
  enumLabels?: Record<string, string>;
  searchable?: boolean;
}) {
  const enumStrings = (field.enum ?? []) as string[];
  const opts = enumStrings.map(opt => ({
    value: opt,
    label: resolveEnumOptionLabel(opt, enumLabels),
  }));
  const hasValue = hasMeaningfulValue(value, field.type);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const showFloat =
    focusWithin || hovered || hasValue || isFieldRequired(field);
  const active = focusWithin || hasValue || readonly;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      <SeamlessShell
        showLabel={showFloat}
        field={field}
        active={active || hovered}
      >
        <div className="py-0.5">
          <AppSelect
            variant="pill"
            className="w-full max-w-full border-0 bg-transparent px-0 py-1 font-normal shadow-none focus:ring-0"
            value={String(value || '')}
            onValueChange={val => onChange(val)}
            disabled={readonly}
            placeholder={placeholder}
            options={
              isFieldRequired(field)
                ? opts
                : [{ value: '', label: 'None' }, ...opts]
            }
            aria-label={fieldAriaLabel(field)}
            searchable={searchable}
          />
        </div>
      </SeamlessShell>
    </div>
  );
}

function SeamlessMultiSelectInner({
  field,
  value,
  onChange,
  readonly,
  enumLabels,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  readonly: boolean;
  enumLabels?: Record<string, string>;
}) {
  const selected = Array.isArray(value) ? (value as string[]).map(String) : [];
  const enumValues = (field.enum ?? []) as string[];
  const [hovered, setHovered] = useState(false);
  const showFloat =
    hovered || selected.length > 0 || isFieldRequired(field);

  return (
    <div
      className="space-y-1.5 pl-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showFloat ? <InlineFieldLabel field={field} /> : null}
      {enumValues.length === 0 ? (
        <Text variant="body" tone="muted" as="p">No options configured.</Text>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={fieldAriaLabel(field)}>
          {enumValues.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={readonly}
                onClick={() => {
                  const next = isSelected
                    ? selected.filter(x => x !== opt)
                    : [...selected, opt];
                  onChange(next);
                }}
                className={`
                  px-2.5 py-1 rounded-full text-sm font-normal transition-all outline-none
                  focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
                  disabled:opacity-50
                  ${
                    isSelected
                      ? 'bg-[var(--link)] text-white'
                      : 'bg-[var(--panel-2)] text-[var(--text-muted)] hover:bg-[var(--panel)]'
                  }
                `}
              >
                {resolveEnumOptionLabel(opt, enumLabels)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeamlessRelationManyInner({
  externalLabel = false,
  field,
  value,
  onChange,
  opts,
  relationLoading,
  placeholder,
  readonly,
  onNavigate,
  navContext,
}: {
  externalLabel?: boolean;
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  opts: SeamlessFieldRelationChoice[];
  relationLoading: boolean;
  placeholder: string;
  readonly: boolean;
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}) {
  const emptyHint =
    field.key === 'tasks' && opts.length === 0 && !relationLoading
      ? (placeholder || 'Select project(s) above first to load tasks.')
      : undefined;

  return (
    <div className={`space-y-1.5 ${externalLabel ? '' : 'pl-3'}`}>
      {/* Keep the label in flow so pointer entry cannot move the trigger. */}
      {!externalLabel && <InlineFieldLabel field={field} />}
      <RelationMultiSelectCombobox
        field={field}
        value={value}
        onChange={onChange}
        options={opts}
        loading={relationLoading}
        placeholder={placeholder}
        readonly={readonly}
        emptyHint={emptyHint}
        onNavigate={onNavigate}
        navContext={navContext}
      />
    </div>
  );
}

function SeamlessRelationSingleInner({
  externalLabel = false,
  field,
  value,
  onChange,
  opts,
  relationLoading,
  placeholder,
  readonly,
  onNavigate,
  navContext,
}: {
  externalLabel?: boolean;
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  opts: SeamlessFieldRelationChoice[];
  relationLoading: boolean;
  placeholder: string;
  readonly: boolean;
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}) {
  const hasValue = hasMeaningfulValue(value, field.type);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const showFloat =
    focusWithin || hovered || hasValue || isFieldRequired(field);
  const active = focusWithin || hasValue || readonly;
  const currentId = String(value || '');
  const [editing, setEditing] = useState(false);
  const knownChoice = opts.find(o => o.value === currentId);
  // Same fallback as the many-chip path — when the picker's preloaded opts
  // don't cover the current value (cross-track relation, late preload,
  // deleted-then-restored entry), resolve the label via the shared cache so
  // the trigger shows the real label instead of the generic placeholder.
  const needsFallback = currentId !== '' && !knownChoice;
  const chipFallback = (
    <span className="inline-flex items-center px-2 py-0.5 text-sm font-normal rounded-full bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]">
      {knownChoice?.label || (
        <RelationChipFallbackLabel
          id={currentId}
          relation={field.relation}
        />
      )}
    </span>
  );

  if (readonly || (currentId && !editing)) {
    return (
      <div className={`space-y-1.5 ${externalLabel ? '' : 'pl-3'}`}>
        {!externalLabel && <InlineFieldLabel field={field} />}
        <div className="flex min-w-0 items-center gap-2">
          {currentId ? (
            <div className="min-w-0 flex-1">
              <RelationValue
                value={currentId}
                relation={field.relation}
                variant="chips"
                stopPropagation
                onNavigate={onNavigate}
                navContext={navContext}
                emptyFallback={chipFallback}
              />
            </div>
          ) : (
            <Text variant="body" tone="muted" as="p">—</Text>
          )}
          {!readonly && (
            <IconButton label={`Change ${field.name}`} onClick={() => setEditing(true)} className="shrink-0">
              <Pencil size={14} aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative space-y-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      <SeamlessShell
        hideLabel={externalLabel}
        showLabel={!externalLabel && showFloat}
        field={field}
        active={active || hovered}
      >
        <div className="flex min-w-0 items-center gap-2 py-0.5">
          <AppSelect
            variant="pill"
            className="min-w-0 w-full max-w-full border-0 bg-transparent px-0 py-1 font-normal shadow-none focus:ring-0"
            value={currentId}
            onValueChange={val => { onChange(val || null); setEditing(false); }}
            disabled={readonly}
            placeholder={placeholder}
            options={[
              { value: '', label: relationLoading ? 'Loading…' : placeholder },
              ...(needsFallback
                ? [{
                    value: currentId,
                    label: (
                      <RelationChipFallbackLabel
                        id={currentId}
                        relation={field.relation}
                      />
                    ),
                  }]
                : []),
              ...opts,
            ]}
            aria-label={fieldAriaLabel(field)}
          />
          {currentId && <IconButton label={`Cancel editing ${field.name}`} onClick={() => setEditing(false)} className="shrink-0">
            <X size={14} aria-hidden />
          </IconButton>}
        </div>
      </SeamlessShell>
    </div>
  );
}

function SeamlessDateInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = hasMeaningfulValue(value, field.type);
  const showFloat = isFocused || hasValue || isFieldRequired(field);
  const active = isFocused || hasValue || readonly;
  const str = value == null ? '' : String(value);
  const mode = field.type === 'datetime' ? 'datetime' : 'date';

  return (
    <SeamlessShell showLabel={showFloat} field={field} active={active}>
      <DatePicker
        mode={mode}
        value={str}
        onChange={val => onChange(val)}
        disabled={readonly}
        placeholder={placeholder}
        aria-label={fieldAriaLabel(field)}
        variant="seamless"
        className="w-full"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </SeamlessShell>
  );
}

function SeamlessTextLikeInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
  inputType,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
  inputType: 'text' | 'number';
}) {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = hasMeaningfulValue(value, field.type);
  const showFloat = isFocused || hasValue || isFieldRequired(field);
  const active = isFocused || hasValue || readonly;
  const str = value == null ? '' : String(value);

  return (
    <SeamlessShell showLabel={showFloat} field={field} active={active}>
      <input
        type={inputType}
        value={str}
        onChange={e =>
          onChange(
            field.type === 'number' ? Number(e.target.value || 0) : e.target.value
          )
        }
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        // Native number inputs also change value on mouse-wheel scroll while
        // focused — surprising when a cell just happens to sit under the
        // cursor during a page scroll. Blur on wheel so scrolling always
        // scrolls the page, never the number.
        onWheel={
          inputType === 'number'
            ? e => (e.currentTarget as HTMLInputElement).blur()
            : undefined
        }
        placeholder={placeholder}
        disabled={readonly}
        aria-label={fieldAriaLabel(field)}
        className={FIELD_INPUT_CLASS}
      />
    </SeamlessShell>
  );
}

function SeamlessMarkdownInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const str = value == null ? '' : String(value);
  const hasValue = str.length > 0;
  const showFloat = isFocused || hasValue || isFieldRequired(field);
  const active = isFocused || hasValue || readonly;

  return (
    <SeamlessShell showLabel={showFloat} field={field} active={active}>
      <textarea
        value={str}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        disabled={readonly}
        rows={4}
        aria-label={fieldAriaLabel(field)}
        className={FIELD_TEXTAREA_CLASS}
      />
    </SeamlessShell>
  );
}

function SeamlessJsonRawInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const str =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
  const hasValue = str.length > 0;
  const showFloat = isFocused || hasValue || isFieldRequired(field);
  const active = isFocused || hasValue || readonly;

  return (
    <SeamlessShell showLabel={showFloat} field={field} active={active}>
      <textarea
        value={str}
        onChange={e => {
          const t = e.target.value;
          try {
            onChange(t.trim() ? JSON.parse(t) : null);
          } catch {
            onChange(t);
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        disabled={readonly}
        rows={4}
        aria-label={fieldAriaLabel(field)}
        className={`${FIELD_TEXTAREA_CLASS} font-mono`}
      />
    </SeamlessShell>
  );
}

function SeamlessJsonInner(props: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
}) {
  // Array-of-objects (rubric_lines, line_items, role_effort, …) renders
  // as a structured table instead of raw mono JSON. The editor itself
  // offers a "Raw JSON" toggle for nested / irregular shapes.
  if (isJsonTableShape(props.value)) {
    return (
      <JsonTableEditor
        value={props.value}
        onChange={props.onChange}
        readonly={props.readonly}
        label={props.field.name}
        labelRequired={isFieldRequired(props.field)}
      />
    );
  }
  return <SeamlessJsonRawInner {...props} />;
}

function SeamlessFallbackTextInner({
  field,
  value,
  onChange,
  placeholder,
  readonly,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder: string;
  readonly: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = hasMeaningfulValue(value, field.type);
  const showFloat = isFocused || hasValue || isFieldRequired(field);
  const active = isFocused || hasValue || readonly;

  return (
    <SeamlessShell showLabel={showFloat} field={field} active={active}>
      <input
        type="text"
        value={value == null ? '' : String(value)}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        disabled={readonly}
        aria-label={fieldAriaLabel(field)}
        className={FIELD_INPUT_CLASS}
      />
    </SeamlessShell>
  );
}

function SeamlessFieldInner(props: SeamlessFieldProps) {
  const {
    field: rawField,
    value,
    onChange,
    relationChoices = [],
    relationLoading = false,
    entryId,
    enumLabels,
    onNavigate,
    navContext,
    siblingFields,
    siblingValues,
    searchable,
  } = props;

  // 1. Plugin / composite override: if the field-type registry has an
  //    explicit renderer for ``field.type`` (or for the composite's
  //    ``base``), let that win regardless of legacy / seamless mode.
  const registered = resolveFieldType(rawField);
  if (registered) {
    const Renderer = registered.editor;
    return (
      <Renderer
        field={rawField}
        value={value}
        onChange={onChange}
        relationChoices={relationChoices}
        relationLoading={relationLoading}
        entryId={entryId}
      />
    );
  }

  // 2. Manifest-declared composite with no custom renderer: rewrite the
  //    field's ``type`` to the composite's primitive base so the existing
  //    dispatch below resolves it as if the user had declared the
  //    primitive directly. ``field.composite.config`` stays available to
  //    any renderer that wants to consume it (e.g. currency code on a
  //    number field).
  const compositeBase = rawField.composite?.base;
  const field: OperationalModelFieldSpec =
    compositeBase && compositeBase !== rawField.type
      ? { ...rawField, type: compositeBase }
      : rawField;

  if (field.seamless === false) {
    return <LegacyField {...{ ...props, field }} />;
  }

  // 3. Built-in primitive dispatch (unchanged).
  const placeholder = buildFieldPlaceholder(field);
  const readonly = Boolean(field.readonly);
  // Selects are searchable by default (one search+select control); pass
  // ``searchable={false}`` on a specific field to opt out.
  const searchableSelect = searchable ?? true;

  // Surface a clear "type not installed" affordance when the field uses an
  // unknown primitive and no composite/plugin handler matched. This
  // replaces the previous silent fallthrough to the generic text input.
  const KNOWN_PRIMITIVES = new Set([
    'boolean',
    'select',
    'multi_select',
    'relation',
    'text',
    'number',
    'date',
    'datetime',
    'markdown',
    'json',
    'file',
    'files',
    'computed',
  ]);
  if (!KNOWN_PRIMITIVES.has(field.type)) {
    return <MissingFieldType field={rawField} />;
  }

  if (field.type === 'boolean') {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-1 hover:bg-[var(--panel-2)]/60 transition-colors">
        <span className="text-sm text-[var(--text)]">
          <FieldLabelContent name={field.name} required={isFieldRequired(field)} />
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={fieldAriaLabel(field)}
          disabled={readonly}
          onClick={() => onChange(!checked)}
          className={`
            relative inline-flex h-5 w-10 shrink-0 items-center justify-start
            rounded-full border-0 p-0 appearance-none transition-colors outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            disabled:opacity-50
            ${checked ? 'bg-[var(--brand-accent)]' : 'bg-[var(--panel-border)]'}
          `}
        >
          <span
            aria-hidden="true"
            className={`
              pointer-events-none absolute left-0.5 top-0.5 block h-4 w-4
              rounded-full bg-white shadow transition-transform
              ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <SeamlessSelectInner
        field={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readonly={readonly}
        enumLabels={enumLabels}
        searchable={searchableSelect}
      />
    );
  }

  if (field.type === 'multi_select') {
    return (
      <SeamlessMultiSelectInner
        field={field}
        value={value}
        onChange={onChange}
        readonly={readonly}
        enumLabels={enumLabels}
      />
    );
  }

  if (field.type === 'relation') {
    if (isAnchorTrackRelation(field)) {
      return (
        <AnchorTrackField
          field={field}
          value={value}
          onChange={onChange}
          readonly={readonly}
          onNavigate={onNavigate}
          navContext={navContext}
        />
      );
    }
    const many = Boolean(field.relation?.many);
    const emptyLabel =
      field.key === 'sprint'
        ? 'No sprint'
        : relationLoading
          ? 'Loading…'
          : field.placeholder?.trim() || `Select ${field.name || 'an entry'}…`;
    if (many) {
      const tasksPlaceholder =
        relationChoices.length === 0
          ? 'Select project(s) above first'
          : 'Select tasks…';
      return (
        <SeamlessRelationManyInner
          externalLabel={props.externalLabel}
          field={field}
          value={value}
          onChange={onChange}
          opts={relationChoices}
          relationLoading={relationLoading}
          placeholder={
            field.key === 'tasks' ? tasksPlaceholder : (placeholder || `Select ${field.name || 'options'}…`)
          }
          readonly={readonly}
          onNavigate={onNavigate}
          navContext={navContext}
        />
      );
    }
    return (
      <SeamlessRelationSingleInner
        externalLabel={props.externalLabel}
        field={field}
        value={value}
        onChange={onChange}
        opts={relationChoices}
        relationLoading={relationLoading}
        placeholder={emptyLabel}
        readonly={readonly}
        onNavigate={onNavigate}
        navContext={navContext}
      />
    );
  }

  if (field.type === 'date' || field.type === 'datetime') {
    return (
      <SeamlessDateInner
        field={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readonly={readonly}
      />
    );
  }

  if (field.type === 'text' || field.type === 'number') {
    const inputType = field.type === 'number' ? 'number' : 'text';
    return (
      <SeamlessTextLikeInner
        field={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readonly={readonly}
        inputType={inputType}
      />
    );
  }

  if (field.type === 'computed') {
    const shown =
      siblingFields && siblingValues
        ? projectComputedValues(siblingFields, siblingValues)[field.key]
        : value;
    return (
      <SeamlessTextLikeInner
        field={field}
        value={shown}
        onChange={onChange}
        placeholder={placeholder}
        readonly
        inputType="text"
      />
    );
  }

  if (field.type === 'markdown') {
    return (
      <SeamlessMarkdownInner
        field={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readonly={readonly}
      />
    );
  }

  if (field.type === 'json' && field.key === 'checklist') {
    const ChecklistEditor = checklistFieldRegistration.editor;
    return (
      <ChecklistEditor
        field={field}
        value={value}
        onChange={onChange}
        relationChoices={relationChoices}
        relationLoading={relationLoading}
        entryId={entryId}
      />
    );
  }

  if (field.type === 'json') {
    return (
      <SeamlessJsonInner
        field={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readonly={readonly}
      />
    );
  }

  if (field.type === 'file' || field.type === 'files') {
    return (
      <SeamlessFileFieldInner
        field={field}
        value={value}
        onChange={onChange}
        many={field.type === 'files'}
        readonly={readonly}
        entryId={props.entryId}
        publicShare={props.publicShare}
        memberFormUpload={props.memberFormUpload}
      />
    );
  }

  return (
    <SeamlessFallbackTextInner
      field={field}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readonly={readonly}
    />
  );
}

/**
 * Field renderer. ``externalLabel`` tells the control that the *caller* already
 * renders the label (the detail grid / card), so no inner control should draw its
 * own floating label — otherwise the two overlap (e.g. "PIPELINE STATUS" over
 * "Pipeline status *"). The flag is published via context so every inner honors it
 * without each one threading the prop.
 */
export function SeamlessField(props: SeamlessFieldProps) {
  return (
    <ExternalLabelContext.Provider value={Boolean(props.externalLabel)}>
      <SeamlessFieldInner {...props} />
    </ExternalLabelContext.Provider>
  );
}
