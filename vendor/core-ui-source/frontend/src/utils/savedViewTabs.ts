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
export function savedViewTabs(views: SavedView[]): SavedView[] {
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
  return orderSavedViews([...byDefinition.values()]);
}

export function orderSavedViews(views: SavedView[]): SavedView[] {
  return views.map((view, index) => ({ view, index }))
    .sort((a, b) => {
      const aOrder = a.view.config?.tab_order;
      const bOrder = b.view.config?.tab_order;
      return (typeof aOrder === 'number' && Number.isFinite(aOrder) ? aOrder : a.index) -
        (typeof bOrder === 'number' && Number.isFinite(bOrder) ? bOrder : b.index) || a.index - b.index;
    }).map(item => item.view);
}
