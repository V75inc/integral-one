/**
 * View contract types that exist only on app dashboards — not in the
 * track view palette (no ``manifests/<type>.manifest.ts``).
 *
 * Kept in sync with ``contracts.json`` ``palette_group: "dashboard"`` entries.
 * Vitest asserts every contract type is either dashboard-only or has a track manifest.
 */
export const DASHBOARD_ONLY_VIEW_TYPES = new Set<string>([
  'activity_digest',
  'chart_bar',
  'chart_line',
  'chart_pie',
  'metric_card',
  'metric_row',
  'progress',
  'recent_entries',
  'record_summary',
  'table_widget',
  'track_breakdown',
  'table_widget',
  'progress',
]);

export function isDashboardOnlyViewType(type: string): boolean {
  return DASHBOARD_ONLY_VIEW_TYPES.has(type);
}
