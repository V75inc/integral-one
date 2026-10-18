import { useState } from 'react';
import { ComposableViewSlot } from './ComposableViewSlot';
import { FormRegionWidget } from './FormRegionWidget';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { SavedView } from '../../types';
import type { ConditionalFieldEntry } from './regionConditions';

/**
 * A button that opens an Oracle-APEX-style "modal page" — the same region
 * composition primitive layout_container uses (`kind: 'view'` nests another
 * registered view_type, `kind: 'form'` reuses FormRegionWidget directly),
 * rendered inside a dialog instead of inline. Config:
 * ``{trigger_label, trigger_variant?, title?, width?, regions: RegionSpec[]}``.
 *
 * Regions always stack (one after another) inside the modal — no
 * tabs/accordion/grid/flex modes here; a modal is already a focused,
 * single-purpose surface, and those modes exist on layout_container for
 * composing WITHIN a page, not within a dialog. Reach for layout_container
 * nested as a `kind: 'view'` region here if a more elaborate arrangement is
 * genuinely needed inside the modal.
 */

type ModalRegionSpec =
  | { key: string; kind: 'view'; title?: string; view: string }
  | { key: string; kind: 'form'; title?: string; fields: ConditionalFieldEntry[]; columns?: number };

export function ModalRegionWidget({ view, entries, isLoading, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const regions = (Array.isArray(config.regions) ? config.regions : []) as ModalRegionSpec[];
  const triggerLabel = typeof config.trigger_label === 'string' ? config.trigger_label : 'Open';
  const triggerVariant =
    typeof config.trigger_variant === 'string'
      ? (config.trigger_variant as 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline')
      : 'primary';
  const title = typeof config.title === 'string' ? config.title : triggerLabel;
  const width = typeof config.width === 'string' ? config.width : undefined;

  const [open, setOpen] = useState(false);

  const renderRegion = (region: ModalRegionSpec) => {
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
      <Modal open={open} onClose={() => setOpen(false)} title={title} width={width}>
        <Modal.Body>
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
        </Modal.Body>
      </Modal>
    </>
  );
}
