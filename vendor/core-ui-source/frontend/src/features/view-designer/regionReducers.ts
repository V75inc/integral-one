/**
 * Pure reducers for layout_container.config.regions[] edits.
 */

import type {
  FormRegionSpec,
  LayoutContainerConfig,
  LayoutMode,
  RegionSpec,
  ViewRegionSpec,
} from './viewDesignerTypes';
import { uniqueRegionKey } from './viewDesignerTypes';

export function reorderRegions(
  regions: RegionSpec[],
  fromIndex: number,
  toIndex: number
): RegionSpec[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= regions.length ||
    toIndex >= regions.length ||
    fromIndex === toIndex
  ) {
    return regions;
  }
  const next = [...regions];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function removeRegion(regions: RegionSpec[], key: string): RegionSpec[] {
  return regions.filter(r => r.key !== key);
}

export function updateRegion(
  regions: RegionSpec[],
  key: string,
  patch: Partial<RegionSpec>
): RegionSpec[] {
  return regions.map(r => {
    if (r.key !== key) return r;
    // Preserve kind discriminant; never allow kind flip via partial patch
    // without an explicit recreate.
    if (r.kind === 'form') {
      return { ...r, ...(patch as Partial<FormRegionSpec>), kind: 'form', key: r.key };
    }
    return { ...r, ...(patch as Partial<ViewRegionSpec>), kind: 'view', key: r.key };
  });
}

export function addFormRegion(
  regions: RegionSpec[],
  opts?: { title?: string; fields?: string[]; keyBase?: string }
): RegionSpec[] {
  const key = uniqueRegionKey(opts?.keyBase || opts?.title || 'form', regions);
  const region: FormRegionSpec = {
    key,
    kind: 'form',
    title: opts?.title || 'Form',
    fields: opts?.fields || [],
    columns: 2,
  };
  return [...regions, region];
}

export function addViewRegion(
  regions: RegionSpec[],
  opts: { view: string; title?: string; keyBase?: string }
): RegionSpec[] {
  const key = uniqueRegionKey(
    opts.keyBase || opts.title || opts.view || 'view',
    regions
  );
  const region: ViewRegionSpec = {
    key,
    kind: 'view',
    title: opts.title || opts.view,
    view: opts.view,
  };
  return [...regions, region];
}

export function setLayoutMode(
  config: LayoutContainerConfig,
  mode: LayoutMode
): LayoutContainerConfig {
  return { ...config, mode };
}

export function setLayoutTitle(
  config: LayoutContainerConfig,
  title: string
): LayoutContainerConfig {
  return { ...config, title: title.trim() || undefined };
}

export function withRegions(
  config: LayoutContainerConfig,
  regions: RegionSpec[]
): LayoutContainerConfig {
  return { ...config, regions };
}

/** Build a saveable view.config object from layout draft.
 *  Merges onto ``base`` so identity keys like ``_manifest_view_key``
 *  (and any other passthrough plugin keys) are not wiped on Save —
 *  otherwise entry ui_contributions can no longer resolve the view. */
export function layoutConfigToRecord(
  config: LayoutContainerConfig,
  base?: Record<string, unknown> | null
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base || {}) };
  out.regions = config.regions || [];
  if (config.mode) out.mode = config.mode;
  else delete out.mode;
  if (config.title) out.title = config.title;
  else delete out.title;
  if (config.layout) out.layout = config.layout;
  else if (base && !('layout' in (base || {}))) delete out.layout;
  return out;
}
