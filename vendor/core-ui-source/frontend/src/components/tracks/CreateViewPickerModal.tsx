/**
 * APEX-style Create View picker — pick a registered view_type from a grid,
 * then name + minimal type-specific config, then POST create.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  FileText,
  GalleryHorizontal,
  Kanban,
  LayoutGrid,
  LayoutList,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { trackViewsApi } from '../../api';
import { operationalModelsApi } from '../../api/operationalModels';
import { useToast } from '../../context/ToastContext';
import {
  useViewTypeCatalog,
  type ViewTypeCatalogEntry,
} from '../../hooks/useViewTypeCatalog';
import type { EntryTypeNode, SavedView } from '../../types';
import { AppSelect, Button, Modal } from '../ui';
import { Surface, Text } from '../../ui';

type Step = 'component' | 'configure';

export type CreateViewPickerModalProps = {
  open: boolean;
  onClose: () => void;
  trackId: string;
  entryTypes: EntryTypeNode[];
  /** When true, the new view is marked default (e.g. track has no views yet). */
  defaultAsFirst?: boolean;
  onCreated?: (view: SavedView) => void;
};

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  feed: LayoutList,
  table: Table2,
  kanban: Kanban,
  calendar: Calendar,
  gallery: GalleryHorizontal,
  wiki: FileText,
  composable_list: LayoutList,
  composable_grid: LayoutGrid,
  composable_board: Kanban,
  composable_timeline: LayoutList,
};

function iconFor(type: string): LucideIcon {
  return ICON_BY_TYPE[type.toLowerCase()] || LayoutGrid;
}

export function buildCreateViewConfig(
  viewType: string,
  opts: { dateField: string; wikiParentField: string }
): Record<string, unknown> {
  if (viewType === 'calendar') {
    return {
      calendar_mapping: {
        date_field: opts.dateField || 'created_at',
      },
    };
  }
  if (viewType === 'wiki') {
    return { parent_field: opts.wikiParentField };
  }
  if (viewType === 'kanban' || viewType === 'composable_board') {
    return { group_by: 'custom_fields._kanban_stage' };
  }
  return {};
}

export function CreateViewPickerModal({
  open,
  onClose,
  trackId,
  entryTypes,
  defaultAsFirst = false,
  onCreated,
}: CreateViewPickerModalProps) {
  const { showToast } = useToast();
  const { entries, isLoading } = useViewTypeCatalog(open);
  const [step, setStep] = useState<Step>('component');
  const [selected, setSelected] = useState<ViewTypeCatalogEntry | null>(null);
  const [name, setName] = useState('');
  const [dateField, setDateField] = useState('created_at');
  const [wikiParentField, setWikiParentField] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dateFieldOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [
      { value: 'created_at', label: 'Created at (default)' },
      { value: 'updated_at', label: 'Updated at' },
    ];
    const seen = new Set(out.map(o => o.value));
    for (const et of entryTypes) {
      for (const f of et.form_schema?.fields || []) {
        if (!f?.key) continue;
        if (f.type !== 'date' && f.type !== 'datetime') continue;
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        out.push({
          value: f.key,
          label: `${f.name || f.key} (${et.name})`,
        });
      }
    }
    return out;
  }, [entryTypes]);

  const wikiParentFieldOptions = useMemo(() => {
    const fields = new Map<string, string>();
    for (const entryType of entryTypes) {
      for (const field of entryType.form_schema?.fields || []) {
        if (field.type === 'relation' && field.key) {
          fields.set(
            field.key,
            `${field.name || field.key} (${entryType.name})`
          );
        }
      }
    }
    return [...fields].map(([value, label]) => ({ value, label }));
  }, [entryTypes]);

  useEffect(() => {
    if (!open) return;
    setStep('component');
    setSelected(null);
    setName('');
    setDateField('created_at');
    setWikiParentField(wikiParentFieldOptions[0]?.value || '');
    setMakeDefault(defaultAsFirst);
    setSubmitting(false);
  }, [open, defaultAsFirst, wikiParentFieldOptions]);

  const canCreateWiki =
    selected?.type !== 'wiki' || wikiParentFieldOptions.length > 0;

  const handleCreate = async () => {
    if (!selected || !name.trim()) return;
    if (selected.type === 'wiki' && !wikiParentFieldOptions.length) {
      showToast('Add a parent page relation field to an entry type first', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const parentField =
        wikiParentField || wikiParentFieldOptions[0]?.value || '';
      const config = buildCreateViewConfig(selected.type, {
        dateField,
        wikiParentField: parentField,
      });
      // Prefer OM-attached create (syncs manifest) when the track has a
      // profile; fall back to the bare views API otherwise.
      let view: SavedView;
      try {
        const data = await operationalModelsApi.addViewToTrackProfile(trackId, {
          name: name.trim(),
          view_type: selected.type,
          type: selected.type,
          config,
          is_default: makeDefault,
        });
        view = (data?.view || data) as SavedView;
      } catch (omErr: unknown) {
        const status = (omErr as { response?: { status?: number } })?.response
          ?.status;
        if (status !== 404) throw omErr;
        view = await trackViewsApi.create(trackId, {
          name: name.trim(),
          type: selected.type,
          config,
          is_default: makeDefault,
        });
      }
      showToast('View created', 'success');
      onCreated?.(view);
      onClose();
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string; message?: string } } })
          ?.response?.data?.detail ||
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ||
          'Failed to create view',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a view"
      width="max-w-dialog-wide"
    >
      <Modal.Body className="space-y-4">
        {step === 'component' ? (
          <>
            <Text as="p" variant="body" tone="muted">
              Choose a view type from the platform palette.
            </Text>
            {isLoading ? (
              <Surface tone="panel-2" border="none" radius="card" className="h-40 animate-pulse" />
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                role="listbox"
                aria-label="View types"
              >
                {entries.map(entry => {
                  const Icon = iconFor(entry.type);
                  const isSelected = selected?.type === entry.type;
                  return (
                    <Surface
                      as="button"
                      key={entry.type}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelected(entry)}
                      tone={isSelected ? 'panel-2' : 'panel'}
                      border={isSelected ? 'subtle' : 'default'}
                      radius="input"
                      padding="md"
                      className={`flex flex-col items-start gap-2 text-left transition-colors ${isSelected ? 'ring-1 ring-[var(--accent)]' : 'hover:border-[var(--text-subtle)]'}`}
                    >
                      <Text as="span" variant="body" tone="muted">
                        <Icon size={22} aria-hidden />
                      </Text>
                      <Text as="span" variant="body" weight="medium">
                        {entry.label}
                      </Text>
                      {entry.description ? (
                        <Text as="span" variant="meta" tone="subtle" className="line-clamp-2">
                          {entry.description}
                        </Text>
                      ) : null}
                    </Surface>
                  );
                })}
              </div>
            )}
            {!isLoading && entries.length === 0 ? (
              <Text as="p" variant="body" tone="muted">
                No creatable view types are registered.
              </Text>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <Text as="p" variant="body" tone="muted">
              Configure{' '}
              <Text as="span" variant="body" weight="medium">
                {selected?.label}
              </Text>
              .
            </Text>
            <label className="block space-y-1">
              <Text as="span" variant="label" weight="medium">
                Name
              </Text>
              <input
                className="app-input text-sm w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`e.g. ${selected?.label || 'View'}`}
                autoFocus
              />
            </label>
            {selected?.type === 'calendar' ? (
              <label className="block space-y-1">
                <Text as="span" variant="label" weight="medium">
                  Date field
                </Text>
                <AppSelect
                  className="app-input text-sm w-full"
                  value={dateField}
                  onValueChange={setDateField}
                  options={dateFieldOptions}
                />
              </label>
            ) : null}
            {selected?.type === 'wiki' ? (
              wikiParentFieldOptions.length ? (
                <label className="block space-y-1">
                  <Text as="span" variant="label" weight="medium">
                    Parent page relation
                  </Text>
                  <AppSelect
                    className="app-input text-sm w-full"
                    value={wikiParentField || wikiParentFieldOptions[0].value}
                    onValueChange={setWikiParentField}
                    options={wikiParentFieldOptions}
                  />
                </label>
              ) : (
                <Text as="p" variant="body-sm" tone="subtle">
                  Add a relation field for parent pages to an entry type before
                  creating a Wiki view.
                </Text>
              )
            ) : null}
            <Text as="label" variant="body" className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={e => setMakeDefault(e.target.checked)}
              />
              Set as default view
            </Text>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {step === 'component' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                setName(selected.label);
                setStep('configure');
              }}
            >
              Next
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep('component')}
              disabled={submitting}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={submitting}
              disabled={!name.trim() || !canCreateWiki || submitting}
              onClick={() => void handleCreate()}
            >
              Create
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
