/**
 * Shared layout_container region types for the Core View Designer.
 * Mirrors LayoutContainerWidget config shapes (REGION_SYSTEM.md).
 */

import type { ConditionalFieldEntry, VisibleIf } from '../../components/views/regionConditions';

export type Responsive<T> = T | { desktop?: T; tablet?: T; mobile?: T };

export type GapSize = 'none' | 'sm' | 'md' | 'lg';

export type LayoutMode = 'stack' | 'tabs' | 'accordion' | 'grid' | 'flex';

export type RegionLayoutOverride = {
  span?: Responsive<number>;
  order?: Responsive<number>;
  column?: Responsive<number>;
  row?: Responsive<number>;
  grow?: number;
  shrink?: number;
  basis?: string;
};

export type GridLayoutConfig = {
  columns?: Responsive<number>;
  gap?: GapSize;
};

export type FlexLayoutConfig = {
  direction?: 'row' | 'column';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: GapSize;
  wrap?: boolean;
};

export type ViewRegionSpec = {
  key: string;
  kind: 'view';
  title?: string;
  view: string;
  bind?: Record<string, unknown>;
  visible_if?: VisibleIf;
  layout?: RegionLayoutOverride;
  accent?: string;
  collapsible?: boolean;
  default_open?: boolean;
};

export type FormRegionSpec = {
  key: string;
  kind: 'form';
  title?: string;
  fields: ConditionalFieldEntry[];
  columns?: number;
  visible_if?: VisibleIf;
  layout?: RegionLayoutOverride;
  accent?: string;
  collapsible?: boolean;
  default_open?: boolean;
};

export type RegionSpec = ViewRegionSpec | FormRegionSpec;

export type LayoutContainerConfig = {
  regions?: RegionSpec[];
  mode?: LayoutMode | Responsive<LayoutMode>;
  title?: string;
  layout?: GridLayoutConfig | FlexLayoutConfig;
};

/** Region widgets valid as nested `kind: view` children (entry-scoped chrome). */
export const LAYOUT_PALETTE_TYPES = [
  { type: 'form_region', label: 'Form region', kind: 'form' as const },
  { type: 'static_content', label: 'Static content', kind: 'view' as const },
  { type: 'layout_container', label: 'Nested layout', kind: 'view' as const },
  { type: 'chart_region', label: 'Chart', kind: 'view' as const },
  { type: 'summary_tiles', label: 'Summary tiles', kind: 'view' as const },
  {
    type: 'region-system/editable-related-lines',
    label: 'Editable related lines',
    kind: 'view' as const,
  },
  {
    type: 'reverse_relation_list',
    label: 'Reverse relation list',
    kind: 'view' as const,
  },
] as const;

export function isLayoutContainerType(type: string | undefined): boolean {
  return String(type || '').trim().toLowerCase() === 'layout_container';
}

export function parseLayoutConfig(
  config: Record<string, unknown> | undefined | null
): LayoutContainerConfig {
  if (!config || typeof config !== 'object') return { regions: [], mode: 'stack' };
  const regions = Array.isArray(config.regions)
    ? (config.regions as RegionSpec[])
    : [];
  return {
    regions,
    mode: (config.mode as LayoutContainerConfig['mode']) || 'stack',
    title: typeof config.title === 'string' ? config.title : undefined,
    layout: (config.layout as LayoutContainerConfig['layout']) || undefined,
  };
}

export function slugifyKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function uniqueRegionKey(base: string, existing: RegionSpec[]): string {
  const keys = new Set(existing.map(r => r.key));
  const candidate = slugifyKey(base) || 'region';
  if (!keys.has(candidate)) return candidate;
  let i = 2;
  while (keys.has(`${candidate}_${i}`)) i += 1;
  return `${candidate}_${i}`;
}
