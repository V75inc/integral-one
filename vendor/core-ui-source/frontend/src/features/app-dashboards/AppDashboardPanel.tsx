import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GridLayout from 'react-grid-layout/legacy';
import { RefreshCw, GripVertical, LayoutDashboard, Sparkles, Trash2, Pencil, Star } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import {
  dashboardsApi,
  type DashboardWidget,
  type DashboardDrilldownResult,
  type DashboardWidgetTypeSpec
} from '../../api/dashboards';
import { errorMessageFromAxios } from '../../api/helpers';
import {
  Button,
  EmptyState,
  IconWell,
  LINE_ICON_STROKE,
  Modal,
  KebabMenu,
  Skeleton
} from '../../components/ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useChatPageFocus } from '../../context/ChatPageFocusContext';
import { Text, Select, Input } from '../../ui';
import { CreateDashboardForm } from './CreateDashboardForm';
import { WidgetShell } from './WidgetShell';
import {
  DashboardWidgetRenderer,
  groupWidgetTypes
} from './DashboardWidgetRegistry';
import {
  layoutFromWidgets,
  layoutsEqual,
  needsDashboardReflow,
  nextWidgetPosition,
  packDashboardWidgets,
  type GridLayoutItem,
  widgetsFromLayout
} from './dashboardLayout';
import './dashboardWidgets.css';

function loadedAggregate(result: DashboardDrilldownResult): string {
  const items = result.items ?? [];
  const { op, field } = result.calculation;
  if (op === 'count') return String(items.length);
  const key = field ? (field.startsWith('custom_fields.') ? field : `custom_fields.${field}`) : '';
  const values = items.map(item => item[key]).filter(value => value !== null && value !== undefined);
  if (op === 'distinct') return String(new Set(values.map(value => JSON.stringify(value))).size);
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 'unavailable';
  if (op === 'sum') return String(numbers.reduce((total, value) => total + value, 0));
  if (op === 'avg') return String(numbers.reduce((total, value) => total + value, 0) / numbers.length);
  if (op === 'min') return String(Math.min(...numbers));
  if (op === 'max') return String(Math.max(...numbers));
  return 'unavailable';
}

export interface AppDashboardPanelProps {
  appId: string;
  appName?: string;
  canEdit: boolean;
  /** When true, omit the section heading — parent supplies tab chrome. */
  embedded?: boolean;
  /** Called after a dashboard is successfully created (e.g. switch tabs). */
  onDashboardCreated?: () => void;
}

export function AppDashboardPanel({
  appId,
  appName,
  canEdit,
  embedded = false,
  onDashboardCreated
}: AppDashboardPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { setPageContext } = useChatPageFocus();
  const [destinationParams, setDestinationParams] = useSearchParams();
  const requestedDashboardId = destinationParams.get('dashboard_id');
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectDashboard = useCallback((id: string) => {
    setActiveId(id);
    setDestinationParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('section', 'dashboards');
      next.set('dashboard_id', id);
      return next;
    }, { replace: true });
  }, [setDestinationParams]);
  const [editMode, setEditMode] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ id?: string; name: string } | null>(null);
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>([]);
  const [drillTarget, setDrillTarget] = useState<{
    widget: DashboardWidget;
    groupKey?: string;
  } | null>(null);
  const [drillResult, setDrillResult] = useState<DashboardDrilldownResult | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPackedRef = useRef<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['dashboards', appId],
    queryFn: () => dashboardsApi.list(appId)
  });

  const substrateQuery = useQuery({
    queryKey: ['dashboard-widget-substrate'],
    queryFn: () => dashboardsApi.getSubstrate()
  });

  const dashboards = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const activeDashboard = useMemo(
    () => dashboards.find(d => d.id === (requestedDashboardId ?? activeId)) ?? dashboards.find(d => d.id === activeId) ?? dashboards[0] ?? null,
    [dashboards, activeId, requestedDashboardId],
  );
  const activeDashboardId = activeDashboard?.id ?? null;
  const activeDashboardName = activeDashboard?.name ?? null;

  useEffect(() => {
    if (dashboards.length && !activeId) {
      setActiveId(dashboards.find(d => d.is_default)?.id ?? dashboards[0].id);
    }
  }, [dashboards, activeId]);

  useEffect(() => {
    if (!activeDashboardId) return;
    setPageContext({
      metadata: {
        ...(appName ? { app_name: appName } : {}),
        focused_dashboard_id: activeDashboardId,
        focused_dashboard_name: activeDashboardName
      }
    });
  }, [activeDashboardId, activeDashboardName, appName, setPageContext]);

  const dataQuery = useQuery({
    queryKey: ['dashboard-data', appId, activeDashboard?.id],
    queryFn: () =>
      dashboardsApi.getData(appId, activeDashboard!.id),
    enabled: !!activeDashboard?.id,
    refetchInterval: 60_000
  });

  const widgetData = dataQuery.data ?? {};

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboards', appId] });
    if (activeDashboard?.id) {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard-data', appId, activeDashboard.id]
      });
    }
  }, [queryClient, appId, activeDashboard?.id]);

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof dashboardsApi.create>[1]) =>
      dashboardsApi.create(appId, body),
    onSuccess: d => {
      invalidate();
      onDashboardCreated?.();
      selectDashboard(d.id);
      showToast('Dashboard created', 'success');
    },
    onError: () => showToast('Failed to create dashboard', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({
      dashboardId,
      body
    }: {
      dashboardId: string;
      body: Parameters<typeof dashboardsApi.update>[2];
    }) => dashboardsApi.update(appId, dashboardId, body),
    onSuccess: () => invalidate(),
    onError: () => showToast('Failed to save dashboard', 'error')
  });

  const drillMutation = useMutation({
    mutationFn: (input: {
      dashboardId: string;
      widgetId: string;
      groupKey?: string;
      resultSetId?: string;
      cursor?: string;
    }) => dashboardsApi.drillThrough(appId, input.dashboardId, {
      widget_id: input.widgetId,
      ...(input.groupKey !== undefined ? { group_key: input.groupKey } : {}),
      ...(input.resultSetId ? { result_set_id: input.resultSetId } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    }),
    onSuccess: (result, input) => setDrillResult(previous => {
      if (!input.cursor || !previous) return { ...result, loaded_count: result.items?.length ?? 0 };
      const items = [...(previous.items ?? []), ...(result.items ?? [])];
      return { ...result, items, loaded_count: items.length };
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboardId: string) =>
      dashboardsApi.remove(appId, dashboardId),
    onSuccess: () => {
      setActiveId(null);
      setDestinationParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete('dashboard_id');
        return next;
      }, { replace: true });
      invalidate();
      showToast('Dashboard deleted', 'success');
    },
    onError: () => showToast('Failed to delete dashboard', 'error')
  });

  const updateDashboardRef = useRef(updateMutation.mutate);
  updateDashboardRef.current = updateMutation.mutate;

  useEffect(() => {
    if (!activeDashboard) return;
    const cols = activeDashboard.layout?.columns ?? 12;
    const raw = activeDashboard.widgets ?? [];
    const packed = packDashboardWidgets(raw, cols);
    setLocalWidgets(prev => (layoutsEqual(prev, packed) ? prev : packed));

    if (
      canEdit &&
      needsDashboardReflow(raw, cols) &&
      !layoutsEqual(raw, packed) &&
      activeDashboard.id !== autoPackedRef.current
    ) {
      autoPackedRef.current = activeDashboard.id;
      updateDashboardRef.current({
        dashboardId: activeDashboard.id,
        body: { widgets: packed }
      });
    }
    // Field-level deps deliberately: this effect auto-packs and SAVES the
    // layout, so re-running it on every refetch of the dashboards query
    // would write repeatedly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDashboard?.id,
    activeDashboard?.widgets,
    activeDashboard?.layout?.columns,
    canEdit,
  ]);

  const scheduleSave = useCallback(
    (widgets: DashboardWidget[]) => {
      if (!activeDashboard || !canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateMutation.mutate({
          dashboardId: activeDashboard.id,
          body: { widgets }
        });
      }, 600);
    },
    [activeDashboard, canEdit, updateMutation],
  );

  // react-grid-layout types its callback payload as `readonly LayoutItem[]`,
  // which is not assignable to a mutable array param. Accept it readonly and
  // copy before handing it to code that expects a mutable list.
  const onLayoutChange = (layout: readonly GridLayoutItem[]) => {
    const next = widgetsFromLayout(localWidgets, [...layout]);
    setLocalWidgets(next);
    if (editMode) scheduleSave(next);
  };

  const autoArrange = () => {
    const cols = activeDashboard?.layout?.columns ?? 12;
    const packed = packDashboardWidgets(localWidgets, cols);
    setLocalWidgets(packed);
    scheduleSave(packed);
    showToast('Layout auto-arranged', 'success');
  };

  const openDrillThrough = (widget: DashboardWidget, groupKey?: string) => {
    if (!activeDashboard) return;
    setDrillTarget({ widget, groupKey });
    setDrillResult(null);
    drillMutation.mutate({
      dashboardId: activeDashboard.id,
      widgetId: widget.id,
      ...(groupKey !== undefined ? { groupKey } : {}),
    });
  };

  const addWidget = (spec: DashboardWidgetTypeSpec) => {
    const id = `w_${Date.now().toString(36)}`;
    const cols = activeDashboard?.layout?.columns ?? 12;
    const gw = spec.default_size?.w ?? 4;
    const gh = spec.default_size?.h ?? 3;
    const pos = nextWidgetPosition(localWidgets, gw, gh, cols);
    const chartDataSource =
      spec.type === 'chart_line'
        ? { kind: 'grouped_count', group_by: 'date' }
        : spec.type === 'chart_bar' || spec.type === 'chart_pie'
          ? { kind: 'grouped_count', group_by: 'status' }
          : {};
    const next: DashboardWidget = {
      id,
      type: spec.type,
      title: spec.label,
      grid: {
        x: pos.x,
        y: pos.y,
        w: gw,
        h: gh
      },
      config: {},
      data_source: chartDataSource
    };
    const widgets = [...localWidgets, next];
    setLocalWidgets(widgets);
    scheduleSave(widgets);
  };

  const removeWidget = (widgetId: string) => {
    const widgets = localWidgets.filter(w => w.id !== widgetId);
    setLocalWidgets(widgets);
    scheduleSave(widgets);
  };

  const handleSuggest = async () => {
    try {
      const suggestion = await dashboardsApi.suggest(appId);
      createMutation.mutate({
        name: suggestion.name,
        layout: suggestion.layout,
        widgets: suggestion.widgets,
        is_default: dashboards.length === 0
      });
    } catch {
      showToast('Could not suggest dashboard', 'error');
    }
  };

  const widgetTypeGroups = groupWidgetTypes(
    substrateQuery.data?.widget_types ?? [],
  );

  const rowHeight = activeDashboard?.layout?.row_height ?? 80;
  const columns = activeDashboard?.layout?.columns ?? 12;
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setGridWidth(w);
    });
    ro.observe(el);
    setGridWidth(el.clientWidth || 900);
    return () => ro.disconnect();
  }, [activeDashboard?.id]);

  return (
    <section className={embedded ? '' : 'mb-10'} aria-label="App dashboards">
      {!embedded ? (
        <div className="mb-4 flex items-center gap-2">
          <IconWell size="sm" aria-hidden>
            <LayoutDashboard size={16} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
          <Text variant="body" as="h2" className="font-semibold">
            Dashboards
          </Text>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      ) : dashboards.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={
              <IconWell size="lg" aria-hidden>
                <LayoutDashboard size={22} strokeWidth={LINE_ICON_STROKE} />
              </IconWell>
            }
            title="No dashboards yet"
            description="Create a dashboard manually, from a template, or ask Integral to suggest one for this App."
          />
          {canEdit ? (
            <CreateDashboardForm
              widgetTypes={substrateQuery.data?.widget_types ?? []}
              creating={createMutation.isPending}
              suggesting={createMutation.isPending}
              onCreateBlank={name =>
                createMutation.mutate({ name, widgets: [], is_default: true })
              }
              onCreateFromTemplate={(name, widgets) =>
                createMutation.mutate({ name, widgets, is_default: true })
              }
              onSuggest={() => void handleSuggest()}
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="dashboard-control-bar mb-4">
            <label className="dashboard-picker">
              <Text variant="meta" tone="muted" as="span">Dashboard</Text>
              <Select aria-label="Dashboard" value={activeDashboard?.id ?? ''}
                disabled={createMutation.isPending}
                onChange={event => {
                  if (event.target.value === '__new__') {
                    setNameDialog({ name: '' });
                  } else {
                    selectDashboard(event.target.value);
                    setEditMode(false);
                  }
                }}>
                {dashboards.map(d => <option key={d.id} value={d.id}>
                  {d.name}{d.is_default ? ' · Default' : ''}
                </option>)}
                {canEdit && <option value="__new__">＋ New dashboard…</option>}
              </Select>
            </label>
            {activeDashboard && canEdit ? (
              <div className="dashboard-control-actions">
                {editMode ? <Button variant="outline" size="sm"
                  icon={<Sparkles size={14} strokeWidth={LINE_ICON_STROKE} />}
                  onClick={autoArrange}>Auto-arrange</Button> : null}
                <Button variant={editMode ? 'primary' : 'outline'} size="sm"
                  icon={<Pencil size={14} strokeWidth={LINE_ICON_STROKE} />}
                  onClick={() => setEditMode(v => !v)}>
                  {editMode ? 'Done editing' : 'Edit layout'}
                </Button>
                <KebabMenu ariaLabel="Dashboard actions" portal items={[
                  { key: 'rename', label: 'Rename dashboard',
                    icon: <Pencil size={14} />,
                    disabled: updateMutation.isPending,
                    onClick: () => setNameDialog({ id: activeDashboard.id, name: activeDashboard.name }) },
                  { key: 'default', label: activeDashboard.is_default ? 'Default dashboard' : 'Set as default',
                    icon: <Star size={14} />, disabled: activeDashboard.is_default || updateMutation.isPending,
                    onClick: () => updateMutation.mutate({ dashboardId: activeDashboard.id, body: { is_default: true } }) },
                  { key: 'delete', label: 'Delete dashboard', danger: true, dividerAbove: true,
                    icon: <Trash2 size={14} />, disabled: deleteMutation.isPending,
                    onClick: () => { void (async () => {
                      const dashboard = activeDashboard;
                      const approved = await confirm({ title: 'Delete dashboard?',
                        message: `Delete “${dashboard.name}” and its widget layout? App records and the Home tab will remain. This cannot be undone.`,
                        confirmLabel: 'Delete dashboard', variant: 'danger' });
                      if (approved) {
                        if (saveTimer.current) clearTimeout(saveTimer.current);
                        deleteMutation.mutate(dashboard.id);
                      }
                    })(); } }
                ]} />
              </div>
            ) : null}
          </div>
          <Modal open={!!nameDialog} onClose={() => setNameDialog(null)}
            title={nameDialog?.id ? 'Rename dashboard' : 'New dashboard'}>
            <Modal.Body>
              <form onSubmit={event => {
                event.preventDefault();
                if (!nameDialog?.name.trim()) return;
                if (nameDialog.id) {
                  updateMutation.mutate({ dashboardId: nameDialog.id, body: { name: nameDialog.name.trim() } },
                    { onSuccess: () => setNameDialog(null) });
                } else {
                  createMutation.mutate({ name: nameDialog.name.trim(), widgets: [] },
                    { onSuccess: () => setNameDialog(null) });
                }
              }} className="space-y-4">
                <label className="block space-y-2">
                  <Text variant="body" as="span">Dashboard name</Text>
                  <Input autoFocus maxLength={100} value={nameDialog?.name ?? ''}
                    onChange={event => setNameDialog(previous => previous ? { ...previous, name: event.target.value } : null)} />
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>Cancel</Button>
                  <Button type="submit" disabled={!nameDialog?.name.trim() || updateMutation.isPending || createMutation.isPending}>
                    {nameDialog?.id ? 'Save name' : 'Create dashboard'}
                  </Button>
                </div>
              </form>
            </Modal.Body>
          </Modal>

          {editMode && canEdit ? (
            <div className="dashboard-toolbar mb-4 flex flex-wrap gap-2">
              {Object.entries(widgetTypeGroups).map(([group, specs]) => (
                <div key={group} className="flex flex-wrap items-center gap-1">
                  <Text variant="meta" tone="muted" as="span" className="mr-1">
                    {group}:
                  </Text>
                  {specs.map(s => (
                    <Button
                      key={s.type}
                      variant="outline"
                      size="sm"
                      onClick={() => addWidget(s)}
                    >
                      + {s.label}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {activeDashboard ? (
            <div ref={containerRef} className="relative min-h-[320px] w-full">
              <GridLayout
                className={`dashboard-grid layout${editMode ? ' dashboard-grid--editing' : ''}`}
                layout={layoutFromWidgets(localWidgets, rowHeight)}
                cols={columns}
                rowHeight={rowHeight}
                width={gridWidth}
                margin={[12, 12]}
                compactType="vertical"
                isDraggable={editMode && canEdit}
                isResizable={editMode && canEdit}
                resizeHandles={['se', 's', 'e', 'sw', 'nw', 'ne', 'n', 'w']}
                draggableCancel=".dashboard-no-drag, button, a, input, textarea, .recharts-wrapper"
                onLayoutChange={onLayoutChange}
              >
                {localWidgets.map(w => (
                  <div key={w.id} className="dashboard-grid-item h-full">
                    {editMode ? (
                      <div className="dashboard-edit-chrome">
                        <span
                          className="dashboard-drag-handle"
                          title="Drag to move"
                          aria-label="Drag widget"
                        >
                          <GripVertical size={14} strokeWidth={LINE_ICON_STROKE} />
                        </span>
                        <button
                          type="button"
                          className="dashboard-edit-badge dashboard-no-drag"
                          onClick={() => removeWidget(w.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                    {!dataQuery.data && dataQuery.isPending ? (
                      <WidgetShell title={w.title}>
                        <div role="status"><Text as="p" variant="meta" tone="muted">Loading widget data…</Text></div>
                        <Skeleton className="mt-3 h-16 w-full" />
                      </WidgetShell>
                    ) : !dataQuery.data && dataQuery.isError ? (
                      <WidgetShell title={w.title}>
                        <Text as="p" variant="meta" tone="muted">Could not load widget data.</Text>
                        <Button variant="secondary" className="mt-3" onClick={() => void dataQuery.refetch()}>Try again</Button>
                      </WidgetShell>
                    ) : (
                      <DashboardWidgetRenderer
                        type={w.type}
                        title={w.title}
                        data={widgetData[w.id] as Record<string, unknown> | undefined}
                        config={w.config}
                        onDrillThrough={groupKey => openDrillThrough(w, groupKey)}
                      />
                    )}
                  </div>
                ))}
              </GridLayout>
            </div>
          ) : null}
        </>
      )}
      <Modal
        open={Boolean(drillTarget)}
        onClose={() => {
          setDrillTarget(null);
          setDrillResult(null);
          drillMutation.reset();
        }}
        title={drillTarget ? `${drillTarget.widget.title} records` : 'Dashboard records'}
        width="max-w-dialog-wide"
      >
        <Modal.Body>
          {drillTarget ? (
            <Text variant="meta" tone="muted" as="p">
              Calculation: {String(drillTarget.widget.data_source.op ?? 'count')}
              {drillTarget.widget.data_source.field ? ` ${String(drillTarget.widget.data_source.field)}` : ''}
              {drillTarget.groupKey !== undefined ? ` for ${drillTarget.groupKey}` : ''}.
              Values are re-read under current access and schema rules. Each continuation resolves against current data and permissions; refresh before treating pages as one snapshot if either changes while paging.
            </Text>
          ) : null}
          {drillResult ? (
            <Text variant="meta" tone="muted" as="p">
              Current widget value: {String(drillResult.current_widget_value ?? 'unavailable')}. Loaded {drillResult.loaded_count ?? drillResult.items?.length ?? 0} of {drillResult.total_estimate ?? 'an unknown number of'} matching records. The loaded records calculate to {loadedAggregate(drillResult)} ({String(drillResult.calculation.op)}{drillResult.calculation.field ? ` ${drillResult.calculation.field}` : ''}).
              {drillResult.next_cursor ? ' The membership is incomplete; load the remaining governed pages before comparing the full calculation.' : (drillResult.loaded_count ?? drillResult.items?.length ?? 0) !== drillResult.total_estimate ? ' Data or access changed while paging; the loaded pages are not a complete current snapshot.' : ' All matching records have been loaded.'}
              {' '}Refreshed {new Date(drillResult.refreshed_at).toLocaleString()}.
            </Text>
          ) : null}
          {drillMutation.isPending ? (
            <Text variant="body-sm" tone="muted" as="p">Loading matching records…</Text>
          ) : drillMutation.isError ? (
            <Text variant="body-sm" tone="danger" as="p">
              Could not open this result set:{' '}
              {errorMessageFromAxios(
                drillMutation.error,
                'Unable to load matching records. Try again.',
              )}
            </Text>
          ) : null}
          {drillResult?.items?.length ? (
            <div className="max-h-[60vh] overflow-auto">
              <table className="dashboard-table w-full text-left text-sm">
                <thead><tr><th scope="col">Record</th><th scope="col">Track</th><th scope="col">Values used</th></tr></thead>
                <tbody>
                  {drillResult.items.map((item, index) => (
                    <tr key={String(item.id ?? index)}>
                      <td>{String(item.title || 'Untitled record')}</td>
                      <td>{String(item.track_title || 'Track')}</td>
                      <td>{Object.entries(item)
                        .filter(([key]) => key.startsWith('custom_fields.') || ['status', 'created_at', 'updated_at', 'tags'].includes(key))
                        .map(([key, value]) => {
                          const name = key.replace(/^custom_fields\./, '').replace(/_/g, ' ');
                          const label = name.charAt(0).toUpperCase() + name.slice(1);
                          const text = value === null || value === undefined || value === ''
                            ? '—'
                            : typeof value === 'object' ? JSON.stringify(value) : String(value);
                          return `${label}: ${text}`;
                        })
                        .join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {drillResult?.track_navigation ? (
            <Button
              variant="secondary"
              onClick={() => {
                const params = new URLSearchParams();
                params.set('dashboard_filters', JSON.stringify(drillResult.track_navigation?.filters ?? []));
                navigate(`/tracks/${encodeURIComponent(drillResult.track_navigation?.track_id ?? '')}?${params.toString()}`);
              }}
            >Open filtered Track</Button>
          ) : null}
          {drillResult?.next_cursor && drillTarget ? (
            <Button
              variant="secondary"
              disabled={drillMutation.isPending}
              onClick={() => activeDashboard && drillMutation.mutate({
                dashboardId: activeDashboard.id,
                widgetId: drillTarget.widget.id,
                ...(drillTarget.groupKey !== undefined ? { groupKey: drillTarget.groupKey } : {}),
                cursor: drillResult.next_cursor ?? undefined,
              })}
            >Load next page</Button>
          ) : null}
          {drillResult && drillTarget && !drillResult.next_cursor && (drillResult.loaded_count ?? drillResult.items?.length ?? 0) !== drillResult.total_estimate ? (
            <Button
              variant="secondary"
              disabled={drillMutation.isPending}
              icon={<RefreshCw size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />}
              onClick={() => openDrillThrough(drillTarget.widget, drillTarget.groupKey)}
            >Refresh</Button>
          ) : null}
          {drillResult && !drillResult.items?.length ? (
            <Text variant="body-sm" tone="muted" as="p">No matching records in this result set.</Text>
          ) : null}
        </Modal.Body>
      </Modal>
    </section>
  );
}
