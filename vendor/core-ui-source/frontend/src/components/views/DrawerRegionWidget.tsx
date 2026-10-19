import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ComposableViewSlot } from './ComposableViewSlot';
import { FormRegionWidget } from './FormRegionWidget';
import { Button } from '../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Surface, Text } from '../../ui';
import { useRegisterOverlay } from '../../hooks/useOverlayPresence';
import type { ViewWidgetProps } from './types';
import type { SavedView } from '../../types';
import type { ConditionalFieldEntry } from './regionConditions';

/**
 * A button that opens a side panel (slides in from the right or left)
 * instead of a centered dialog — `modal_region`'s lighter-weight sibling
 * for content that reads better as a panel than a takeover (a filter
 * builder, a detail peek, a secondary form that shouldn't fully block the
 * page behind it). Same region composition as modal_region/layout_container
 * (`kind:'view'`/`kind:'form'`, always stacked). Config:
 * ``{trigger_label, trigger_variant?, title?, side?, width_px?, regions:
 * RegionSpec[]}``.
 *
 * Registers as a blocking overlay via `useRegisterOverlay` — same
 * lifecycle contract `Modal` uses — so it participates in the app's
 * overlay-depth tracking even though its own visual chrome (no rounded
 * dialog corners, edge-anchored) is simpler than Modal's.
 */

type DrawerRegionSpec =
  | { key: string; kind: 'view'; title?: string; view: string }
  | { key: string; kind: 'form'; title?: string; fields: ConditionalFieldEntry[]; columns?: number };

export function DrawerRegionWidget({ view, entries, isLoading, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const regions = (Array.isArray(config.regions) ? config.regions : []) as DrawerRegionSpec[];
  const triggerLabel = typeof config.trigger_label === 'string' ? config.trigger_label : 'Open';
  const triggerVariant =
    typeof config.trigger_variant === 'string'
      ? (config.trigger_variant as 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline')
      : 'secondary';
  const title = typeof config.title === 'string' ? config.title : triggerLabel;
  const side = config.side === 'left' ? 'left' : 'right';
  const widthPx = typeof config.width_px === 'number' ? config.width_px : 420;

  const [open, setOpen] = useState(false);
  useRegisterOverlay(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const renderRegion = (region: DrawerRegionSpec) => {
    if (region.kind === 'view') {
      return <ComposableViewSlot trackId={view.track_id} viewKey={region.view} bindings={bindings} />;
    }
    const syntheticView: SavedView = {
      ...view,
      id: `${view.id}:${region.key}`,
      type: 'form_region',
      track_id: view.track_id,
      config: { fields: region.fields, title: region.title, columns: region.columns, __bindings: bindings },
    } as SavedView;
    return (
      <FormRegionWidget view={syntheticView} entries={entries} isLoading={isLoading} onEntryOpen={onEntryOpen} />
    );
  };

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute top-0 bottom-0"
              style={{ [side]: 0, width: widthPx, maxWidth: '100vw' }}
            >
              <Surface
                tone="panel"
                border="none"
                radius="none"
                className="h-full flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--panel-border)]">
                  <Text as="h2" variant="heading-sm">{title}</Text>
                  <IconButton onClick={() => setOpen(false)} label="Close">
                    <X size={16} strokeWidth={1.5} aria-hidden="true" />
                  </IconButton>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex flex-col gap-3">
                    {regions.map(region => (
                      <div key={region.key}>
                        {region.title && (
                          <Text as="div" variant="label" tone="muted" className="uppercase tracking-wide mb-1.5">
                            {region.title}
                          </Text>
                        )}
                        {renderRegion(region)}
                      </div>
                    ))}
                  </div>
                </div>
              </Surface>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
