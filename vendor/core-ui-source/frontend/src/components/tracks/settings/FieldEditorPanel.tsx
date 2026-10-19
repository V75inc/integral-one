import { useEffect, useState } from 'react';
import type { OperationalModelFieldSpec } from '../../../types';
import {
  FIELD_TYPES,
  slugifyKey,
  validateFieldKey,
  validateFieldName,
  type FieldType
} from './fieldValidation';
import { SelectConfig } from './fieldConfig/SelectConfig';
import { NumberConfig } from './fieldConfig/NumberConfig';
import { DateConfig } from './fieldConfig/DateConfig';
import { RelationConfig } from './fieldConfig/RelationConfig';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../../ui';
import { Field } from '../../../patterns';
import apiClient from '../../../api/client';

export interface FieldEditorPanelProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial: OperationalModelFieldSpec | null;
  siblingKeys: string[];
  onSave: (field: OperationalModelFieldSpec) => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving?: boolean;
}

export function FieldEditorPanel({
  open,
  mode,
  initial,
  siblingKeys,
  onSave,
  onCancel,
  onDelete,
  saving
}: FieldEditorPanelProps) {
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [keyVal, setKeyVal] = useState('');
  const [keyDirty, setKeyDirty] = useState(false);
  const [type, setType] = useState<FieldType>('text');
  const [required, setRequired] = useState(false);
  const [help, setHelp] = useState('');
  const [enumOpts, setEnumOpts] = useState<string[]>([]);
  const [numCfg, setNumCfg] = useState<{ min?: number; max?: number; step?: number }>({});
  const [withTime, setWithTime] = useState(false);
  const [relMode, setRelMode] = useState<'lookup' | 'anchor'>('lookup');
  const [relTargetTrackId, setRelTargetTrackId] = useState('');
  const [relTargetEntryTypeId, setRelTargetEntryTypeId] = useState('');
  const [relMany, setRelMany] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setNameTouched(false);
      setKeyVal(initial.key ?? '');
      setKeyDirty(true);
      setType((initial.type as FieldType) ?? 'text');
      setRequired(Boolean(initial.required));
      setHelp(initial.help ?? '');
      setEnumOpts(Array.isArray(initial.enum) ? (initial.enum as string[]) : []);
      const v = initial.validation ?? {};
      setNumCfg({
        min: typeof v.min === 'number' ? v.min : undefined,
        max: typeof v.max === 'number' ? v.max : undefined,
        step: typeof v.step === 'number' ? v.step : undefined
      });
      setWithTime((initial.type as string) === 'datetime');
      setRelMode(
        initial.relation?.target === 'track' ? 'anchor' : 'lookup'
      );
      setRelTargetTrackId(
        initial.relation?.target_track_types?.[0] ?? ''
      );
      setRelTargetEntryTypeId(
        initial.relation?.target_entry_types?.[0] ?? ''
      );
      setRelMany(Boolean(initial.relation?.many));
    } else {
      setName('');
      setNameTouched(false);
      setKeyVal('');
      setKeyDirty(false);
      setType('text');
      setRequired(false);
      setHelp('');
      setEnumOpts([]);
      setNumCfg({});
      setWithTime(false);
      setRelMode('lookup');
      setRelTargetTrackId('');
      setRelTargetEntryTypeId('');
      setRelMany(false);
    }
  }, [initial, open]);

  // Load available tracks for the relation field picker when the panel opens.
  useEffect(() => {
    if (!open) return;
    apiClient
      .get('/tracks')
      .then(r => {
        const raw = r.data;
        const list: Array<{ id: string; title: string }> = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { tracks?: unknown[] })?.tracks)
          ? ((raw as { tracks: Array<{ id: string; title: string }> }).tracks)
          : [];
        setAvailableTracks(list.map(t => ({ id: t.id, title: t.title })));
      })
      .catch(() => {});
  }, [open]);

  const effectiveType: FieldType =
    type === 'date' || type === 'datetime' ? (withTime ? 'datetime' : 'date') : type;

  const onNameChange = (v: string) => {
    setName(v);
    setNameTouched(true);
    if (mode === 'create' && !keyDirty) {
      setKeyVal(slugifyKey(v));
    }
  };

  const onKeyChange = (v: string) => {
    setKeyDirty(true);
    setKeyVal(v);
  };

  const onTypeChange = (v: FieldType) => {
    setType(v);
    if (v !== 'select' && v !== 'multi_select') setEnumOpts([]);
    if (v !== 'number') setNumCfg({});
    if (v !== 'date' && v !== 'datetime') setWithTime(false);
    if (v === 'datetime') setWithTime(true);
    if (v === 'date') setWithTime(false);
  };

  const nameError = validateFieldName(name);
  const keyError =
    mode === 'edit'
      ? null
      : validateFieldKey(keyVal, siblingKeys);
  const selectError =
    (effectiveType === 'select' || effectiveType === 'multi_select') && enumOpts.length === 0
      ? 'Add at least one option.'
      : null;
  const numberError =
    effectiveType === 'number' &&
    numCfg.min !== undefined &&
    numCfg.max !== undefined &&
    numCfg.min > numCfg.max
      ? 'min must be ≤ max'
      : null;

  const canSave = !nameError && !keyError && !selectError && !numberError && !saving;

  const handleSave = () => {
    if (!canSave) return;
    const built: OperationalModelFieldSpec = {
      // Preserve the server-issued identity during edits. New fields receive
      // an identity before the optimistic update so later schema edits never
      // have to infer continuity from a display label or storage key.
      id: initial?.id ?? `field-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      key: mode === 'edit' && initial ? initial.key : keyVal,
      name: name.trim(),
      type: effectiveType,
      required,
      order: initial?.order
    };
    if (help.trim()) built.help = help.trim();
    if (effectiveType === 'select' || effectiveType === 'multi_select') {
      built.enum = enumOpts.filter(o => o.trim() !== '');
    }
    if (effectiveType === 'number') {
      built.validation = { ...numCfg };
    }
    if (effectiveType === 'relation') {
      built.relation = relMode === 'anchor'
        ? {
            target: 'track',
            ...(relTargetTrackId ? { target_track_types: [relTargetTrackId] } : {})
          }
        : {
            target: 'entry',
            ...(relTargetTrackId ? { target_track_types: [relTargetTrackId] } : {}),
            ...(relTargetEntryTypeId ? { target_entry_types: [relTargetEntryTypeId] } : {}),
            many: relMany
          };
    }
    if (effectiveType === 'member') {
      built.relation = {
        many: relMany
      };
    }
    onSave(built);
  };

  const title = mode === 'create' ? 'Add field' : `Edit field — ${initial?.name ?? ''}`;

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <Modal.Body noSpacing>
        <div className="space-y-3">
          <Field label="Name" htmlFor="fe-name" error={nameTouched ? nameError ?? undefined : undefined}>
            <Input
              id="fe-name"
              value={name}
              onChange={e => onNameChange(e.target.value)}
            />
          </Field>

          <Field
            label="Key"
            htmlFor="fe-key"
            error={keyDirty || nameTouched ? keyError ?? undefined : undefined}
            hint={
              mode === 'edit'
                ? 'Key is locked after creation to preserve existing entry data.'
                : 'This is filled in from the name. You can change it if needed.'
            }
          >
            <Input
              id="fe-key"
              value={keyVal}
              onChange={e => onKeyChange(e.target.value)}
              disabled={mode === 'edit'}
              monospace
            />
          </Field>

          <div>
            <label htmlFor="fe-type" className="text-xs font-medium text-[var(--text-muted)]">Type</label>
            <select
              id="fe-type"
              className="app-input text-sm w-full mt-1"
              value={type}
              onChange={e => onTypeChange(e.target.value as FieldType)}
              disabled={mode === 'edit'}
            >
              {FIELD_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
            Required
          </label>

          <Field label="Help text (optional)" htmlFor="fe-help">
            <Input
              id="fe-help"
              value={help}
              onChange={e => setHelp(e.target.value)}
            />
          </Field>

          {(effectiveType === 'select' || effectiveType === 'multi_select') && (
            <SelectConfig options={enumOpts} onChange={setEnumOpts} error={selectError ?? undefined} />
          )}
          {effectiveType === 'number' && (
            <NumberConfig
              min={numCfg.min}
              max={numCfg.max}
              step={numCfg.step}
              onChange={setNumCfg}
              error={numberError ?? undefined}
            />
          )}
          {(type === 'date' || type === 'datetime') && (
            <DateConfig withTime={withTime} onChange={setWithTime} />
          )}
          {effectiveType === 'relation' && (
            <RelationConfig
              mode={relMode}
              targetTrackId={relTargetTrackId}
              targetEntryTypeId={relTargetEntryTypeId}
              many={relMany}
              tracks={availableTracks}
              onChangeMode={setRelMode}
              onChangeTargetTrack={setRelTargetTrackId}
              onChangeTargetEntryType={setRelTargetEntryTypeId}
              onChangeMany={setRelMany}
            />
          )}
          {effectiveType === 'member' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={relMany}
                onChange={e => setRelMany(e.target.checked)}
              />
              Allow multiple members (many)
            </label>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer align="between">
        {mode === 'edit' && onDelete ? (
          <button
            type="button"
            className="text-sm text-[var(--danger-fg)] hover:underline"
            onClick={onDelete}
            disabled={saving}
          >
            Delete field
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-[var(--panel-border)] text-[var(--text)]"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
