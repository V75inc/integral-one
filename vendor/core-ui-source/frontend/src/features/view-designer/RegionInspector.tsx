import { useMemo } from 'react';
import type { EntryTypeNode, OperationalModelFieldSpec, SavedView } from '../../types';
import type { RegionSpec } from './viewDesignerTypes';
import { fieldEntryKey } from '../../components/views/regionConditions';
import { Input, Surface, Text } from '../../ui';

type RegionInspectorProps = {
  region: RegionSpec | null;
  entryTypes: EntryTypeNode[];
  trackViews: SavedView[];
  onChange: (key: string, patch: Partial<RegionSpec>) => void;
  onDrillIntoView?: (view: SavedView) => void;
};

function collectFields(entryTypes: EntryTypeNode[]): OperationalModelFieldSpec[] {
  const out: OperationalModelFieldSpec[] = [];
  const seen = new Set<string>();
  for (const et of entryTypes) {
    for (const f of et.form_schema?.fields || []) {
      if (!f.key || seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(f);
    }
  }
  return out;
}

function manifestKey(view: SavedView): string | null {
  const cfg = view.config as { _manifest_view_key?: string } | undefined;
  const key = cfg?._manifest_view_key;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function RegionInspector({
  region,
  entryTypes,
  trackViews,
  onChange,
  onDrillIntoView,
}: RegionInspectorProps) {
  const fields = useMemo(() => collectFields(entryTypes), [entryTypes]);

  if (!region) {
    return (
      <Text as="p" variant="body" tone="muted" className="py-4">
        Select a region on the canvas to edit its properties.
      </Text>
    );
  }

  const selectedFieldKeys =
    region.kind === 'form'
      ? (region.fields || []).map(fieldEntryKey)
      : [];

  const toggleField = (fieldKey: string) => {
    if (region.kind !== 'form') return;
    const current = selectedFieldKeys;
    const next = current.includes(fieldKey)
      ? current.filter(k => k !== fieldKey)
      : [...current, fieldKey];
    onChange(region.key, { fields: next } as Partial<RegionSpec>);
  };

  const nestedView =
    region.kind === 'view'
      ? trackViews.find(v => manifestKey(v) === region.view)
      : null;

  return (
    <div data-testid="region-inspector" className="space-y-3">
      <div>
        <Text as="label" variant="label" htmlFor="region-title">
          Title
        </Text>
        <Input
          id="region-title"
          className="mt-1 w-full"
          value={region.title || ''}
          onChange={e => onChange(region.key, { title: e.target.value })}
        />
      </div>

      <Text as="div" variant="body-sm" tone="muted">
        Key: <Text as="span" variant="mono" tone="default">{region.key}</Text>
        <span className="mx-1">·</span>
        Kind: <Text as="span" variant="mono" tone="default">{region.kind}</Text>
      </Text>

      {region.kind === 'form' && (
        <>
          <div>
            <Text as="label" variant="label" htmlFor="region-cols">
              Columns
            </Text>
            <Input
              id="region-cols"
              type="number"
              min={1}
              max={4}
              className="mt-1 w-20"
              value={region.columns ?? 2}
              onChange={e =>
                onChange(region.key, {
                  columns: Math.max(1, Math.min(4, Number(e.target.value) || 1)),
                } as Partial<RegionSpec>)
              }
            />
          </div>
          <fieldset>
            <Text as="legend" variant="label" className="mb-1.5">Fields</Text>
            <Surface tone="transparent" border="default" radius="input" padding="sm" className="max-h-48 overflow-y-auto space-y-1">
              {fields.length === 0 ? (
                <Text as="p" variant="body-sm" tone="muted">No fields on this track.</Text>
              ) : (
                fields.map(f => (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFieldKeys.includes(f.key)}
                      onChange={() => toggleField(f.key)}
                    />
                    <Text as="span" variant="body" truncate>{f.name || f.key}</Text>
                    <Text as="span" variant="mono" tone="muted" className="shrink-0">
                      {f.key}
                    </Text>
                  </label>
                ))
              )}
            </Surface>
          </fieldset>
        </>
      )}

      {region.kind === 'view' && (
        <div className="space-y-2">
          <div>
            <Text as="label" variant="label" htmlFor="region-view-key">
              Nested view key
            </Text>
            <select
              id="region-view-key"
              className="app-input mt-1 w-full"
              value={region.view || ''}
              onChange={e =>
                onChange(region.key, { view: e.target.value } as Partial<RegionSpec>)
              }
            >
              <option value="">Select…</option>
              {trackViews.map(v => {
                const key = manifestKey(v);
                if (!key) return null;
                return (
                  <option key={v.id} value={key}>
                    {v.name} ({key})
                  </option>
                );
              })}
            </select>
          </div>
          {nestedView && onDrillIntoView && (
            <button
              type="button"
              className="text-sm text-[var(--link)] hover:underline"
              onClick={() => onDrillIntoView(nestedView)}
            >
              Open nested view in designer →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
