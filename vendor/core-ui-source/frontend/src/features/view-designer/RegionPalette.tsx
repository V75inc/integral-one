import { Columns, LayoutTemplate, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, LINE_ICON_STROKE } from '../../components/ui';
import { Text } from '../../ui';
import type { SavedView } from '../../types';
import { LAYOUT_PALETTE_TYPES } from './viewDesignerTypes';

type RegionPaletteProps = {
  trackViews: SavedView[];
  onAddForm: () => void;
  onAddView: (viewKey: string, title?: string) => void;
};

function manifestKey(view: SavedView): string | null {
  const cfg = view.config as { _manifest_view_key?: string } | undefined;
  const key = cfg?._manifest_view_key;
  if (typeof key === 'string' && key.trim()) return key.trim();
  const legacy = (view as SavedView & { key?: string }).key;
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  return null;
}

export function RegionPalette({
  trackViews,
  onAddForm,
  onAddView,
}: RegionPaletteProps) {
  const [selectedViewKey, setSelectedViewKey] = useState('');

  const nestableViews = useMemo(() => {
    return trackViews
      .map(v => {
        const key = manifestKey(v);
        return key
          ? { id: v.id, key, name: v.name || key, type: v.type }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      key: string;
      name: string;
      type: string;
    }>;
  }, [trackViews]);

  return (
    <div data-testid="region-palette" className="flex flex-col gap-3">
      <Text as="h3" variant="meta" tone="subtle" weight="semibold" className="uppercase tracking-[0.08em]">
        Add region
      </Text>

      <Button
        size="sm"
        variant="outline"
        onClick={onAddForm}
        className="justify-start"
      >
        <Columns size={13} strokeWidth={LINE_ICON_STROKE} />
        Form fields
      </Button>

      <div className="space-y-1.5">
        <Text as="label" variant="label" htmlFor="nested-view-pick">
          Nested saved view
        </Text>
        <div className="flex gap-1.5">
          <select
            id="nested-view-pick"
            className="app-input min-w-0 flex-1"
            value={selectedViewKey}
            onChange={e => setSelectedViewKey(e.target.value)}
          >
            <option value="">Select view…</option>
            {nestableViews.map(v => (
              <option key={v.id} value={v.key}>
                {v.name} ({v.type})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="primary"
            disabled={!selectedViewKey}
            onClick={() => {
              const match = nestableViews.find(v => v.key === selectedViewKey);
              if (!match) return;
              onAddView(match.key, match.name);
              setSelectedViewKey('');
            }}
            aria-label="Add nested view region"
          >
            <Plus size={13} />
          </Button>
        </div>
      </div>

      <div className="pt-2 border-t border-[var(--panel-border)]">
        <Text as="p" variant="meta" tone="subtle" className="mb-2 flex items-center gap-1">
          <LayoutTemplate size={11} strokeWidth={LINE_ICON_STROKE} />
          Region types (reference)
        </Text>
        <ul className="space-y-1">
          {LAYOUT_PALETTE_TYPES.map(t => (
            <Text as="li" key={t.type} variant="body-sm" tone="muted">{t.label}</Text>
          ))}
        </ul>
      </div>
    </div>
  );
}
