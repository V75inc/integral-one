import type { SavedView } from '../types';

function canonicalConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalConfig);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalConfig(item)]),
    );
  }
  return value;
}

/** Collapse equivalent definitions, never distinct saved views of one renderer. */
export function savedViewTabs(views: SavedView[], appOrder?: string[]): SavedView[] {
  const byDefinition = new Map<string, SavedView>();
  for (const view of views) {
    const key = JSON.stringify([
      view.type,
      [...(view.entry_type_keys || [])].map(k => k.toLowerCase().trim()).sort(),
      view.name || '',
      canonicalConfig(view.config || {}),
    ]);
    const previous = byDefinition.get(key);
    if (!previous || (view.is_default && !previous.is_default)) {
      byDefinition.set(key, view);
    }
  }
  return orderSavedViews([...byDefinition.values()], appOrder);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Tab order, most specific first:
 * 1. the order a person chose by dragging (``tab_order``);
 * 2. the App's track-level list (``appOrder``, from ``defaults.tabs.order``), matched on each view's manifest key;
 * 3. the App's per-view default (``default_tab_order``, its place in the manifest);
 * 4. the order the views arrived in.
 */
export function orderSavedViews(views: SavedView[], appOrder?: string[]): SavedView[] {
  const listed = new Map((appOrder || []).map((key, index) => [key, index]));
  const appPosition = (view: SavedView, index: number): number => {
    const manifestKey = String(view.config?._manifest_view_key ?? '');
    const fromList = listed.get(manifestKey);
    if (fromList !== undefined) return fromList;
    // Views the list does not name follow it, in their declared order.
    const declared = finiteNumber(view.config?.default_tab_order) ?? index;
    return (appOrder?.length ?? 0) + declared;
  };
  const key = (view: SavedView, index: number) =>
    finiteNumber(view.config?.tab_order) ?? (listed.size ? appPosition(view, index) : (finiteNumber(view.config?.default_tab_order) ?? index));
  return views.map((view, index) => ({ view, index }))
    .sort((a, b) => key(a.view, a.index) - key(b.view, b.index) || a.index - b.index)
    .map(item => item.view);
}

/**
 * The saved views whose stored ``tab_order`` must change so the tabs read in ``orderedIds`` order.
 */
export function tabOrderChanges(
  views: SavedView[],
  orderedIds: string[],
): Array<{ view: SavedView; tabOrder: number }> {
  const byId = new Map(views.map(view => [view.id, view]));
  const changes: Array<{ view: SavedView; tabOrder: number }> = [];
  orderedIds.forEach((id, position) => {
    const view = byId.get(id);
    // Every tab gets a stored position the first time anyone reorders, so a person's order never mixes with
    // the App's default numbers. After that only the tabs that moved are written.
    if (view && finiteNumber(view.config?.tab_order) !== position) changes.push({ view, tabOrder: position });
  });
  return changes;
}
