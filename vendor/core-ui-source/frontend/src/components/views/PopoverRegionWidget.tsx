import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ComposableViewSlot } from './ComposableViewSlot';
import { FormRegionWidget } from './FormRegionWidget';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { SavedView } from '../../types';
import type { ConditionalFieldEntry } from './regionConditions';

/**
 * A button that opens a small floating panel anchored to it — the region
 * system's "quick peek" primitive, one step lighter than `modal_region`
 * (no backdrop, no viewport takeover, doesn't register as a blocking
 * overlay). Same region composition as modal_region/layout_container
 * (`kind:'view'`/`kind:'form'`, always stacked). Config:
 * ``{trigger_label, trigger_variant?, placement?, regions: RegionSpec[]}``.
 *
 * Positioned via a manual `getBoundingClientRect()` read on open + a
 * `createPortal` panel — same pattern `ResourceTagPopover.tsx` already
 * uses elsewhere in the app, not a new positioning approach. Closes on
 * outside click or Escape.
 */

type PopoverRegionSpec =
  | { key: string; kind: 'view'; title?: string; view: string }
  | { key: string; kind: 'form'; title?: string; fields: ConditionalFieldEntry[]; columns?: number };

export function PopoverRegionWidget({ view, entries, isLoading, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const regions = (Array.isArray(config.regions) ? config.regions : []) as PopoverRegionSpec[];
  const triggerLabel = typeof config.trigger_label === 'string' ? config.trigger_label : 'Open';
  const triggerVariant =
    typeof config.trigger_variant === 'string'
      ? (config.trigger_variant as 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline')
      : 'secondary';
  const placement =
    typeof config.placement === 'string' ? (config.placement as 'bottom' | 'top') : 'bottom';

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  // Button isn't a forwardRef component — wrap it in a plain span to read
  // its position instead of trying to ref the button itself.
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPopover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords(
      placement === 'top'
        ? { top: rect.top - 8, left: rect.left }
        : { top: rect.bottom + 8, left: rect.left }
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const renderRegion = (region: PopoverRegionSpec) => {
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
      <span ref={triggerRef} className="inline-block">
        <Button variant={triggerVariant} onClick={() => (open ? setOpen(false) : openPopover())}>
          {triggerLabel}
        </Button>
      </span>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 60,
              width: 320,
              transform: placement === 'top' ? 'translateY(-100%)' : undefined,
            }}
          >
            <Surface tone="panel" border="default" radius="card" elevation="pop" padding="md">
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
            </Surface>
          </div>,
          document.body
        )}
    </>
  );
}
