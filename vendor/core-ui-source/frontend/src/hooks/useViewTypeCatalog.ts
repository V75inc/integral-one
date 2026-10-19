/**
 * Catalog of registered Operational Model view types from
 * ``GET /operational-model-substrate``, intersected with frontend widgets
 * that can actually render as track tabs (``listWidgets``).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  operationalModelDraftsApi,
  type ViewTypeDescriptor,
} from '../api/operationalModelDrafts';
import { listWidgets } from '../views/registry';

export type ViewTypeCatalogEntry = {
  type: string;
  label: string;
  description: string;
  config_schema?: Record<string, unknown>;
  source?: string;
  palette_group?: string;
};

const REGION_PREFIX = 'region-system/';

type WidgetLite = {
  type: string;
  meta: { label: string; description?: string };
  scope?: 'track' | 'entry' | 'both';
};

/** Track-tab creatable types: backend-registered + SPA widget; not entry hosts. */
export function isTrackCreatableViewType(
  type: string,
  widget?: WidgetLite
): boolean {
  const t = String(type || '').trim().toLowerCase();
  if (!t) return false;
  // Entry-bound region / host widgets are not track tabs.
  if (t.startsWith(REGION_PREFIX)) return false;
  if (
    t === 'layout_container' ||
    t === 'form_region' ||
    t === 'extension_view' ||
    t === 'action_bar' ||
    t === 'modal_region' ||
    t === 'drawer_region' ||
    t === 'popover_region' ||
    t === 'summary_tiles' ||
    t === 'static_content' ||
    t === 'reverse_relation_list'
  ) {
    return false;
  }
  if (widget?.scope === 'entry') return false;
  return true;
}

export function mergeViewTypeCatalog(
  substrateTypes: ViewTypeDescriptor[],
  widgetTypes: WidgetLite[]
): ViewTypeCatalogEntry[] {
  const widgetsByType = new Map(
    widgetTypes.map(w => [String(w.type || '').trim().toLowerCase(), w])
  );
  const out: ViewTypeCatalogEntry[] = [];
  const seen = new Set<string>();

  // Only substrate keys — those are what POST /views will accept.
  // Do not fall back to frontend-only widget registrations (e.g. editable_table).
  for (const spec of substrateTypes) {
    const type = String(spec.type || '').trim();
    const key = type.toLowerCase();
    if (!type || seen.has(key)) continue;
    const widget = widgetsByType.get(key);
    if (!widget) continue;
    if (!isTrackCreatableViewType(type, widget)) continue;
    seen.add(key);
    out.push({
      type,
      label: String(spec.label || widget.meta.label || type),
      description: String(
        spec.description || widget.meta.description || ''
      ).trim(),
      config_schema: spec.config_schema,
      source: spec.source,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function useViewTypeCatalog(enabled = true) {
  const query = useQuery({
    queryKey: ['operational-model-substrate', 'view-types'],
    queryFn: () => operationalModelDraftsApi.substrate(),
    enabled,
    staleTime: 5 * 60_000,
  });

  const entries = useMemo(() => {
    const substrate = query.data?.view_types ?? [];
    const widgets = listWidgets().map(reg => ({
      type: reg.type,
      meta: {
        label: reg.meta.label,
        description: reg.meta.description,
      },
      scope: reg.scope,
    }));
    return mergeViewTypeCatalog(substrate, widgets);
  }, [query.data?.view_types]);

  return {
    entries,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
