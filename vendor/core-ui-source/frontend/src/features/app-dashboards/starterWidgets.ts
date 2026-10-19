/** Starter widget templates for manual dashboard creation. */

import type { DashboardWidget } from '../../api/dashboards';

export interface DashboardStarterTemplate {
  key: string;
  label: string;
  description: string;
  widgets: Omit<DashboardWidget, 'id'>[];
}

export const STARTER_TEMPLATES: DashboardStarterTemplate[] = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Metrics, activity, and recent entries',
    widgets: [
      {
        type: 'metric_card',
        title: 'Total entries',
        grid: { x: 0, y: 0, w: 3, h: 2 },
        config: {},
        data_source: { kind: 'count' },
      },
      {
        type: 'activity_digest',
        title: 'Activity',
        grid: { x: 0, y: 2, w: 6, h: 4 },
        config: {},
        data_source: { kind: 'activity_digest', period: 'week' },
      },
      {
        type: 'recent_entries',
        title: 'Recent entries',
        grid: { x: 6, y: 2, w: 6, h: 4 },
        config: {},
        data_source: { limit: 8 },
      },
    ],
  },
  {
    key: 'charts',
    label: 'Charts',
    description: 'Status breakdown and trends',
    widgets: [
      {
        type: 'chart_bar',
        title: 'By status',
        grid: { x: 0, y: 0, w: 6, h: 4 },
        config: { orientation: 'vertical' },
        data_source: { kind: 'grouped_count', group_by: 'status' },
      },
      {
        type: 'chart_line',
        title: 'Created over time',
        grid: { x: 6, y: 0, w: 6, h: 4 },
        config: {},
        data_source: { kind: 'grouped_count', group_by: 'date' },
      },
    ],
  },
];

export function assignWidgetIds(
  widgets: Omit<DashboardWidget, 'id'>[],
): DashboardWidget[] {
  return widgets.map((w, i) => ({
    ...w,
    id: `w_${Date.now().toString(36)}_${i}`,
  }));
}
