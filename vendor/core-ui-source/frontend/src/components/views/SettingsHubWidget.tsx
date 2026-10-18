import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Loader2, Plus, Settings2 } from 'lucide-react';
import { entriesApi } from '../../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import type { Entry } from '../../types';
import type { ViewWidgetProps } from './types';

type SettingField = {
  key: string;
  label?: string;
  description?: string;
  type?: 'toggle' | 'value';
};

type SettingSection = {
  key: string;
  title: string;
  description?: string;
  entry_type_keys: string[];
  fields?: SettingField[];
};

function slug(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function labelFor(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function SectionNavButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const highlighted = active || hovered;
  return (
    <Surface
      tone={highlighted ? 'panel-2' : 'transparent'}
      border="none"
      radius="input"
      className="min-w-max lg:w-full"
    >
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
      >
        <Text as="span" variant="body-sm" weight={active ? 'medium' : 'normal'} tone={active ? 'default' : 'muted'}>
          {label}
        </Text>
        <Badge variant="default">{count}</Badge>
      </button>
    </Surface>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'Turn off' : 'Turn on'}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--link)]' : 'bg-[var(--panel-border)]'
      } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function SettingsHubWidget({ view, entries, isLoading, onEntryOpen, onEntryCreate, entryTypes }: ViewWidgetProps) {
  const config = (view.config || {}) as {
    title?: string;
    description?: string;
    sections?: SettingSection[];
  };
  const sections = config.sections || [];
  const settingsEntriesQuery = useQuery({
    queryKey: ['settings-hub-entries', view.track_id],
    enabled: Boolean(view.track_id),
    queryFn: () => entriesApi.list({ track_id: view.track_id }),
    staleTime: 30_000,
  });
  const sourceEntries = settingsEntriesQuery.data?.length ? settingsEntriesQuery.data : entries;
  // A section's own SettingField config only distinguishes 'toggle' vs
  // plain 'value' — it doesn't know the underlying entry type's field is
  // select-typed, so a badge value like Pay Calendar's "cadence"
  // (monthly/biweekly/weekly) rendered the raw stored string instead of
  // the humanized label the create form and every other read surface use.
  // Cross-reference the real field schema, same pattern as TableWidget /
  // ReportCenterWidget.
  const selectFieldTypes = useMemo(() => {
    const out = new Map<string, 'select' | 'multi_select'>();
    for (const et of entryTypes || []) {
      for (const f of et.form_schema?.fields || []) {
        const t = String(f.type || '').toLowerCase();
        if (t === 'select' || t === 'multi_select') out.set(f.key, t);
      }
    }
    return out;
  }, [entryTypes]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [activeSectionKey, setActiveSectionKey] = useState(() => sections[0]?.key || '');
  const [creatingType, setCreatingType] = useState<string | null>(null);

  const nameForEntryType = (key: string): string => {
    const match = (entryTypes || []).find(et => slug(et.name) === slug(key));
    return match?.name || labelFor(key);
  };

  const entryTypeSlugFor = (entry: Entry): string => {
    const fields = entry.custom_fields || {};
    return slug(
      entry.type ||
        fields._entry_type_slug ||
        (fields._cp_index as { entry_type_key?: string } | undefined)?.entry_type_key,
    );
  };

  const createRecord = async (entryTypeKey: string) => {
    if (!onEntryCreate) return;
    setCreatingType(entryTypeKey);
    try {
      const created = await onEntryCreate({
        title: nameForEntryType(entryTypeKey),
        type: entryTypeKey,
      });
      if (created) onEntryOpen(created as Entry);
    } finally {
      setCreatingType(null);
    }
  };

  const sectionEntries = useMemo(() => {
    return sections.map(section => ({
      section,
      entries: sourceEntries.filter(entry =>
        section.entry_type_keys.some(key => slug(key) === entryTypeSlugFor(entry)),
      ),
    }));
  }, [sections, sourceEntries]);

  const toggle = async (entry: Entry, field: SettingField) => {
    const id = `${entry.id}:${field.key}`;
    setSaving(id);
    setSaved(null);
    const nextValue = !(entry.custom_fields || {})[field.key];
    try {
      await entriesApi.update(entry.id, {
        custom_fields: {
          ...(entry.custom_fields || {}),
          [field.key]: nextValue,
        },
      });
      setOverrides(current => ({ ...current, [id]: nextValue }));
      setSaved(id);
      window.setTimeout(() => setSaved(current => (current === id ? null : current)), 1600);
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return <Surface tone="panel-2" radius="card" className="h-48 animate-pulse">{null}</Surface>;
  }

  const activeSection = sectionEntries.find(({ section }) => section.key === activeSectionKey)
    || sectionEntries[0];

  return (
    <div className="space-y-6" data-testid="settings-hub-widget">
      <header className="border-b border-[var(--panel-border)] pb-5">
        <div className="flex items-start gap-3">
          <Surface tone="panel-2" border="none" radius="input" padding="sm"><Settings2 size={20} aria-hidden="true" /></Surface>
          <div>
            <Text as="h2" variant="heading-md">{config.title || 'App settings'}</Text>
            <Text variant="body-sm" tone="muted">
              {config.description || 'Configure how this App runs.'}
            </Text>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          {sectionEntries.map(({ section, entries: sectionRows }) => (
            <SectionNavButton
              key={section.key}
              active={activeSection?.section.key === section.key}
              label={section.title}
              count={sectionRows.length}
              onClick={() => setActiveSectionKey(section.key)}
            />
          ))}
        </nav>

        {activeSection && (
          <Surface tone="panel" border="default" radius="card" padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-4">
              <div className="min-w-0">
                <Text as="h3" variant="heading-sm">{activeSection.section.title}</Text>
                {activeSection.section.description && <Text variant="body-sm" tone="muted">{activeSection.section.description}</Text>}
              </div>
              {onEntryCreate && (
                <div className="flex flex-wrap justify-end gap-2">
                  {activeSection.section.entry_type_keys.map(key => (
                    <Button
                      key={key}
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={14} aria-hidden="true" />}
                      loading={creatingType === key}
                      disabled={creatingType !== null && creatingType !== key}
                      onClick={() => void createRecord(key)}
                    >
                      Add {nameForEntryType(key)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="divide-y divide-[var(--panel-border)]">
              {activeSection.entries.map(entry => {
                const entryTypeName = nameForEntryType(entryTypeSlugFor(entry));
                return (
                <div key={entry.id} className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <Text as="div" variant="body-sm" weight="medium">{entry.title || entryTypeName}</Text>
                    {entry.title !== entryTypeName && <Text as="div" variant="meta" tone="muted">{entryTypeName}</Text>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onEntryOpen(entry)}>
                    Edit <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {(activeSection.section.fields || []).map(field => {
                    const actionId = `${entry.id}:${field.key}`;
                    const value = overrides[actionId] ?? (entry.custom_fields || {})[field.key];
                    if (field.type === 'toggle') {
                      return (
                        <Surface key={field.key} tone="panel-2" border="none" radius="input" padding="md" className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <Text as="div" variant="body-sm" weight="medium">{field.label || labelFor(field.key)}</Text>
                            {field.description && <Text as="div" variant="meta" tone="muted">{field.description}</Text>}
                          </div>
                          <div className="flex items-center gap-2">
                            {saved === actionId && <Check size={15} className="text-[var(--success-fg)]" aria-label="Saved" />}
                            {saving === actionId && <Loader2 size={15} className="animate-spin" aria-label="Saving" />}
                            <Switch checked={Boolean(value)} disabled={saving !== null} onChange={() => void toggle(entry, field)} />
                          </div>
                        </Surface>
                      );
                    }
                    const selectType = selectFieldTypes.get(field.key);
                    const displayValue =
                      value === null || value === undefined
                        ? 'Not set'
                        : selectType === 'multi_select' && Array.isArray(value)
                          ? value.map(v => humanizeEnumValue(String(v))).join(', ')
                          : selectType === 'select'
                            ? humanizeEnumValue(String(value))
                            : String(value);
                    return <div key={field.key} className="flex items-center justify-between py-1"><Text variant="body-sm" tone="muted">{field.label || labelFor(field.key)}</Text><Badge variant="default">{displayValue}</Badge></div>;
                  })}
                </div>
                </div>
                );
              })}
              {!activeSection.entries.length && <div className="px-5 py-8"><Text variant="body-sm" tone="muted">No records have been configured in this section yet.</Text></div>}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
