import type { HomeElement } from '../features/app-dashboards/nativeHomeTypes';
import apiClient from './client';
import { unwrapResource } from './helpers';

export interface DashboardGridPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  grid: DashboardGridPlacement;
  config: Record<string, unknown>;
  data_source: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  name: string;
  app_id: string;
  workspace_id?: string;
  layout: { columns: number; row_height: number };
  widgets: DashboardWidget[];
  is_default: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HomeComponentWidget {
  id: string;
  type: 'native_component';
  title?: string;
  grid: DashboardGridPlacement;
  content: HomeElement;
}
export type HomeWidget = (DashboardWidget & { data?: Record<string, unknown> }) | HomeComponentWidget;
export function isHomeComponentWidget(widget: HomeWidget): widget is HomeComponentWidget {
  return widget.type === 'native_component' && 'content' in widget;
}
export interface AppHome {
  title: string;
  description?: string;
  renderer?: 'widgets' | 'native';
  content?: HomeElement;
  actions?: Array<{ label: string; draft: string; when?: { widget: string; state: 'empty' | 'has_records' } }>;
  widgets?: HomeWidget[];
}
export interface AppHomeResponse {
  home: AppHome | null;
  home_revision?: string;
  definition_revision?: number | null;
  source?: 'instance' | 'package' | 'preview';
  preview?: boolean;
  live_data?: boolean;
  error?: string;
  bindings?: { queries: Array<Record<string, unknown>>; operations: Array<Record<string, unknown>> };
  components?: Array<{ key: string; name: string; schema: Record<string, unknown> }>;
}

export interface DashboardWidgetTypeSpec {
  type: string;
  label: string;
  description: string;
  palette_group: string;
  default_size: { w: number; h: number };
  config_schema?: Record<string, unknown>;
  data_source_schema?: Record<string, unknown>;
}

export interface DashboardSuggestResult {
  name: string;
  layout: { columns: number; row_height: number };
  widgets: DashboardWidget[];
  rationale: string;
}

export interface DashboardDrilldownResult {
  items?: Record<string, unknown>[] | null;
  result_set_id: string;
  graph_revision: string;
  membership_limit: number;
  total_estimate?: number;
  membership_complete?: boolean;
  continuation_contract?: string;
  loaded_count?: number;
  next_cursor?: string | null;
  membership_scope: Record<string, unknown>;
  calculation: { op: string; field?: string | null; group_by?: string | null };
  refreshed_at: string;
  page_calculation?: Record<string, unknown>;
  current_widget_value?: unknown;
  page_truncated?: boolean;
  track_navigation?: { track_id: string; filters: Array<{ field: string; op: string; value: unknown }> };
}

export const dashboardsApi = {
  async home(appId: string, includeData = true): Promise<AppHomeResponse> {
    const { data } = await apiClient.get(`/apps/${appId}/home`, { params: { include_data: String(includeData) } });
    return data;
  },
  async previewHome(appId: string, home: AppHome | Record<string, never>, includeData = false): Promise<AppHomeResponse> {
    const { data } = await apiClient.post(`/apps/${appId}/home/preview`, { home, include_data: includeData });
    return data;
  },
  async saveHome(appId: string, home: AppHome | Record<string, never>, expectedRevision: string): Promise<unknown> {
    const { data } = await apiClient.put(`/apps/${appId}`, { home, expected_home_revision: expectedRevision });
    return data;
  },
  async list(appId: string): Promise<Dashboard[]> {
    const { data } = await apiClient.get(`/apps/${appId}/dashboards`);
    return unwrapResource<Dashboard[]>(data, 'dashboards');
  },

  async get(appId: string, dashboardId: string): Promise<Dashboard> {
    const { data } = await apiClient.get(
      `/apps/${appId}/dashboards/${dashboardId}`,
    );
    return data as Dashboard;
  },

  async create(
    appId: string,
    body: {
      name: string;
      layout?: Dashboard['layout'];
      widgets?: DashboardWidget[];
      is_default?: boolean;
    },
  ): Promise<Dashboard> {
    const { data } = await apiClient.post(`/apps/${appId}/dashboards`, body);
    return data as Dashboard;
  },

  async update(
    appId: string,
    dashboardId: string,
    body: Partial<{
      name: string;
      layout: Dashboard['layout'];
      widgets: DashboardWidget[];
      is_default: boolean;
    }>,
  ): Promise<Dashboard> {
    const { data } = await apiClient.patch(
      `/apps/${appId}/dashboards/${dashboardId}`,
      body,
    );
    return data as Dashboard;
  },

  async remove(appId: string, dashboardId: string): Promise<void> {
    await apiClient.delete(`/apps/${appId}/dashboards/${dashboardId}`);
  },

  async getData(
    appId: string,
    dashboardId: string,
  ): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get(
      `/apps/${appId}/dashboards/${dashboardId}/data`,
      // A dashboard resolves several bounded queries in one request.
      { timeout: 120_000 },
    );
    return (data?.widget_data ?? {}) as Record<string, unknown>;
  },

  async drillThrough(
    appId: string,
    dashboardId: string,
    body: {
      widget_id: string;
      group_key?: string;
      result_set_id?: string;
      cursor?: string;
    },
  ): Promise<DashboardDrilldownResult> {
    const { data } = await apiClient.post(
      `/apps/${appId}/dashboards/${dashboardId}/drill-through`,
      body,
    );
    return data as DashboardDrilldownResult;
  },

  async suggest(appId: string): Promise<DashboardSuggestResult> {
    const { data } = await apiClient.get(`/apps/${appId}/dashboards/suggest`);
    return data as DashboardSuggestResult;
  },

  async getSubstrate(): Promise<{ widget_types: DashboardWidgetTypeSpec[] }> {
    const { data } = await apiClient.get('/dashboard-widget-substrate');
    return data as { widget_types: DashboardWidgetTypeSpec[] };
  },
};
