import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, CircleDashed, Loader2, Plus, Settings2 } from 'lucide-react';
import { entriesApi } from '../../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import type { Entry } from '../../types';
import type { ViewWidgetProps } from './types';
import { ExtensionViewWidget } from './ExtensionViewWidget';

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
  /** Record types this section lists. A section that shows an App screen instead leaves this empty. */
  entry_type_keys?: string[];
  fields?: SettingField[];
  /** This section holds one record (an employer, a set of permissions). Once it exists there is no Add, only Edit. Split layout only. */
  single?: boolean;
  /** Show this App screen (an extension view) in the detail pane instead of a record list. */
  extension_view_key?: string;
  /** A reviewed React component of the App to show instead; the extension view above is its fallback. */
  component_key?: string;
  component_props?: Record<string, unknown>;
  /** Heading the section is listed under in the left list. Consecutive sections with one group share it. */
  group?: string;
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
  done,
  count,
  split,
  onClick,
}: {
  active: boolean;
  label: string;
  /** Split layout: true once something is set up in the section; left out for a section that shows an App screen. */
  done?: boolean;
  /** Original layout: how many records the section holds. */
  count?: number;
  split?: boolean;
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
        aria-current={active ? 'true' : undefined}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
      >
        <Text as="span" variant="body-sm" weight={active ? 'medium' : 'normal'} tone={active ? 'default' : 'muted'}>
          {label}
        </Text>
        {split ? (
          done === undefined ? null : done ? (
            <Check size={14} className="shrink-0 text-[var(--success-fg)]" aria-label="Set up" />
          ) : (
            <CircleDashed size={14} className="shrink-0 text-[var(--warn-fg)]" aria-label="Not set up yet" />
          )
        ) : (
          <Badge variant="default">{count ?? 0}</Badge>
        )}
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

export function SettingsHubWidget(props: ViewWidgetProps) {
  const { view, entries, isLoading, onEntryOpen, onEntryCreate, entryTypes } = props;
  const config = (view.config || {}) as {
    title?: string;
    description?: string;
    sections?: SettingSection[];
    /** ``split`` turns on the grouped list, status marks and next-step prompts. Leave it out and the hub looks as it always did. */
    variant?: string;
  };
  const split = config.variant === 'split';
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

  // In the split layout records always open in the dialog, even for a type that opts into a full page, so Settings
  // never throws you onto another screen. Without the option the hub opens records as it always did.
  const openOptions = split ? { forceModal: true } : undefined;

  // A record type declared ``singleton`` holds one record. Once it exists the section offers Edit, not Add.
  const isSingleton = (key: string): boolean =>
    Boolean((entryTypes || []).find(et => slug(et.name) === slug(key))?.form_schema?.singleton);

  const createRecord = async (entryTypeKey: string) => {
    if (!onEntryCreate) return;
    setCreatingType(entryTypeKey);
    try {
      const created = await onEntryCreate({
        title: nameForEntryType(entryTypeKey),
        type: entryTypeKey,
      });
      if (created) onEntryOpen(created as Entry, openOptions);
    } finally {
      setCreatingType(null);
    }
  };

  const sectionEntries = useMemo(() => {
    return sections.map(section => ({
      section,
      entries: sourceEntries.filter(entry =>
        (section.entry_type_keys || []).some(key => slug(key) === entryTypeSlugFor(entry)),
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

  // Consecutive sections that share a group name are listed under one heading.
  const navGroups: Array<{ name: string; sections: typeof sectionEntries }> = [];
  for (const item of sectionEntries) {
    const name = split ? item.section.group || '' : '';
    const last = navGroups[navGroups.length - 1];
    if (last && last.name === name) last.sections.push(item);
    else navGroups.push({ name, sections: [item] });
  }

  return (
    <div className="space-y-5" data-testid="settings-hub-widget">
      {split ? (
        config.title && config.title !== 'App settings' ? (
          <header className="border-b border-[var(--panel-border)] pb-4">
            <Text as="h2" variant="heading-md">{config.title}</Text>
            {config.description ? <Text variant="body-sm" tone="muted">{config.description}</Text> : null}
          </header>
        ) : null
      ) : (
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
      )}

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:block">
          {navGroups.map((group, groupIndex) => {
            const headingId = `settings-group-${groupIndex}`;
            return (
              <div
                key={group.name || `group-${groupIndex}`}
                role="group"
                aria-labelledby={group.name ? headingId : undefined}
                className={`contents lg:block ${groupIndex > 0 ? 'lg:mt-4 lg:border-t lg:border-[var(--panel-border)] lg:pt-3' : ''}`}
              >
                {group.name ? (
                  // A label, not a link: smaller, bolder, muted, no hover, and set apart from the items below it.
                  <div
                    id={headingId}
                    className="hidden select-none px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)] lg:block"
                  >
                    {group.name}
                  </div>
                ) : null}
                <div className="contents lg:block lg:space-y-0.5">
                  {group.sections.map(({ section, entries: sectionRows }) => (
                    <SectionNavButton
                      key={section.key}
                      active={activeSection?.section.key === section.key}
                      label={section.title}
                      done={section.extension_view_key || section.component_key ? undefined : sectionRows.length > 0}
                      count={sectionRows.length}
                      split={split}
                      onClick={() => setActiveSectionKey(section.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {activeSection && (activeSection.section.extension_view_key || activeSection.section.component_key) ? (
          <section aria-label={activeSection.section.title} className="min-w-0">
            <ExtensionViewWidget
              {...props}
              key={activeSection.section.key}
              view={{
                ...view,
                type: 'extension_view',
                config: {
                  ...(view.config || {}),
                  extension_view_key: activeSection.section.extension_view_key,
                  component_key: activeSection.section.component_key,
                  component_props: activeSection.section.component_props,
                },
              } as typeof view}
            />
          </section>
        ) : activeSection && (
          <Surface tone="panel" border="default" radius="card" padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-4">
              <div className="min-w-0">
                <Text as="h3" variant="heading-sm">{activeSection.section.title}</Text>
                {activeSection.section.description && <Text variant="body-sm" tone="muted">{activeSection.section.description}</Text>}
              </div>
              {onEntryCreate && !(split && !activeSection.entries.length) && (
                <div className="flex flex-wrap justify-end gap-2">
                  {(activeSection.section.entry_type_keys || []).filter(key => !(split && (activeSection.section.single || isSingleton(key)) && activeSection.entries.length > 0)).map(key => (
                    <Button
                      key={key}
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={14} aria-hidden="true" />}
                      loading={creatingType === key}
                      disabled={creatingType !== null && creatingType !== key}
                      onClick={() => void createRecord(key)}
                    >
                      {split && activeSection.entries.length ? 'Add another' : 'Add'} {nameForEntryType(key)}
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
                  <Button variant="ghost" size="sm" onClick={() => onEntryOpen(entry, openOptions)}>
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
                    const unset = value === null || value === undefined || String(value) === '';
                    return (
                      <div key={field.key} className="flex items-center justify-between gap-4 py-1">
                        <Text variant="body-sm" tone="muted">{field.label || labelFor(field.key)}</Text>
                        {unset ? (
                          <Text variant="body-sm" tone="muted">Not set</Text>
                        ) : selectType ? (
                          // Choices read as a tag, the way record lists show them.
                          <Badge variant="default">{displayValue}</Badge>
                        ) : (
                          // Names, numbers, IDs and dates are plain values, not tags.
                          <Text variant="body-sm" className="text-right">{displayValue}</Text>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
                );
              })}
              {!activeSection.entries.length && (split ? (
                <div className="flex flex-col items-start gap-3 px-5 py-8">
                  <div>
                    <Text as="div" variant="body-sm" weight="medium">Nothing is set up here yet.</Text>
                  </div>
                  {onEntryCreate && (activeSection.section.entry_type_keys || [])[0] ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus size={14} aria-hidden="true" />}
                      loading={creatingType === (activeSection.section.entry_type_keys || [])[0]}
                      onClick={() => void createRecord((activeSection.section.entry_type_keys || [])[0])}
                    >
                      Set up {activeSection.section.title.toLowerCase()}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="px-5 py-8"><Text variant="body-sm" tone="muted">No records have been configured in this section yet.</Text></div>
              ))}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
