import type { SavedView } from '../types';
import { getWidget } from '../components/views/registry';

const BOTH_SCOPE_NEEDS_ENTRY_LIST = new Set([
  'calendar',
  'composable_board',
  'composable_grid',
  'composable_list',
  'composable_timeline',
  'editable_table',
  'feed',
  'gallery',
  'grouped_list',
  'kanban',
  'record_collection',
  'reverse_relation_list',
  'table',
]);

/**
 * Whether ComposableViewSlot should GET /entries?view_id=… for this saved view.
 * Entry-scoped chrome (layout, lines editor, static blocks) uses bindings or its
 * own fetches — listing track entries by view_id is wasted work on hot paths.
 */
export function savedViewUsesHostedEntryList(view: SavedView): boolean {
  const type = String(view.type || '').trim();
  const typeLower = type.toLowerCase();
  const scope = getWidget(type)?.scope ?? 'track';
  if (scope === 'entry') return false;
  if (scope === 'track') return true;
  for (const key of BOTH_SCOPE_NEEDS_ENTRY_LIST) {
    if (typeLower === key || typeLower.endsWith(`/${key}`)) return true;
  }
  return false;
}
