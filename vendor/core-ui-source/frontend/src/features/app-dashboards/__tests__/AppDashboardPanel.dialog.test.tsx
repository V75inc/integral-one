import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { listMock, substrateMock, dataMock, drillThroughMock, confirmMock, removeMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  removeMock: vi.fn(),
  listMock: vi.fn(),
  substrateMock: vi.fn(),
  dataMock: vi.fn(),
  drillThroughMock: vi.fn(),
}));

vi.mock('../../../api/dashboards', () => ({
  dashboardsApi: {
    list: listMock,
    getSubstrate: substrateMock,
    getData: dataMock,
    drillThrough: drillThroughMock,
    create: vi.fn(),
    update: vi.fn(),
    remove: removeMock,
    suggest: vi.fn(),
  },
}));

vi.mock('react-grid-layout/legacy', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../DashboardWidgetRegistry', () => ({
  DashboardWidgetRenderer: ({ onDrillThrough }: { onDrillThrough?: (key?: string) => void }) => (
    <button type="button" onClick={() => onDrillThrough?.('active')}>
      Open chart records
    </button>
  ),
  groupWidgetTypes: () => ({}),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../context/ChatPageFocusContext', () => ({
  useChatPageFocus: () => ({ setPageContext: vi.fn() }),
}));

vi.mock('../../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));

import { AppDashboardPanel } from '../AppDashboardPanel';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 34, width: 200, height: 34, toJSON: () => ({}) });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('AppDashboardPanel drill-through dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    listMock.mockResolvedValue([
      {
        id: 'dashboard-1',
        name: 'Revenue',
        app_id: 'app-1',
        layout: { columns: 12, row_height: 80 },
        widgets: [
          {
            id: 'chart-1',
            type: 'chart_bar',
            title: 'Revenue chart',
            grid: { x: 0, y: 0, w: 6, h: 4 },
            config: {},
            data_source: { kind: 'aggregate', op: 'count' },
          },
        ],
        is_default: true,
      },
    ]);
    substrateMock.mockResolvedValue({ widget_types: [] });
    dataMock.mockResolvedValue({ 'chart-1': {} });
    drillThroughMock.mockResolvedValue({
      items: [],
      result_set_id: 'result-1',
      graph_revision: 'revision-1',
      membership_limit: 100,
      membership_scope: {},
      calculation: { op: 'count' },
      refreshed_at: '2026-09-28T00:00:00Z',
      current_widget_value: 0,
    });
  });

  it('uses the standard padded Modal.Body for chart record results', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open chart records' }));
    const calculation = await screen.findByText(/Calculation: count/);
    const modalBody = calculation.parentElement;
    await waitFor(() => expect(drillThroughMock).toHaveBeenCalled());

    expect(modalBody).toHaveClass('px-5', 'sm:px-6', 'py-5', 'space-y-4');
  });

  it('keeps unresolved widgets in a loading state until data arrives', async () => {
    let resolveData!: (value: Record<string, unknown>) => void;
    dataMock.mockReturnValueOnce(new Promise(resolve => { resolveData = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Loading widget data…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chart records' })).not.toBeInTheDocument();
    resolveData({ 'chart-1': {} });
    expect(await screen.findByRole('button', { name: 'Open chart records' })).toBeInTheDocument();
    expect(screen.queryByText('Loading widget data…')).not.toBeInTheDocument();
  });

  it('shows a retry action after a failed data request', async () => {
    dataMock.mockRejectedValueOnce(new Error('Request timed out'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Could not load widget data.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chart records' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Open chart records' })).toBeInTheDocument();
  });

  it('shows the API reason when governed drill-through is refused', async () => {
    drillThroughMock.mockRejectedValueOnce({
      response: {
        data: {
          error_code: 'query_boundary.denied',
          message: 'This App requires a declared query capability',
        },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open chart records' }));

    expect(
      await screen.findByText(
        'Could not open this result set: This App requires a declared query capability',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AxiosError/)).not.toBeInTheDocument();
  });

  it('continues with the governed cursor and appends the next page', async () => {
    drillThroughMock
      .mockResolvedValueOnce({
        items: [{ id: 'entry-1', title: 'Invoice 1', track_id: 'track-1' }],
        result_set_id: 'result-1',
        graph_revision: 'revision-1',
        membership_limit: 1,
        membership_scope: {},
        calculation: { op: 'count' },
        refreshed_at: '2026-09-28T00:00:00Z',
        current_widget_value: 2,
        total_estimate: 2,
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'entry-2', title: 'Invoice 2', track_id: 'track-1' }],
        result_set_id: 'result-2',
        graph_revision: 'revision-1',
        membership_limit: 1,
        membership_scope: {},
        calculation: { op: 'count' },
        refreshed_at: '2026-09-28T00:00:00Z',
        current_widget_value: 2,
        total_estimate: 2,
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open chart records' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load next page' }));

    expect(await screen.findByText('Invoice 2')).toBeInTheDocument();
    expect(await screen.findByText(/All matching records have been loaded/)).toBeInTheDocument();
    expect(drillThroughMock).toHaveBeenNthCalledWith(2, 'app-1', 'dashboard-1', {
      widget_id: 'chart-1',
      group_key: 'active',
      cursor: 'cursor-2',
    });
  });

  it('opens the source Track with the dashboard group filter preserved', async () => {
    drillThroughMock.mockResolvedValueOnce({
      items: [{ id: 'entry-1', title: 'Invoice A', track_id: 'track-1' }],
      result_set_id: 'result-1',
      graph_revision: 'revision-1',
      membership_limit: 100,
      membership_scope: {},
      calculation: { op: 'count' },
      refreshed_at: '2026-09-28T00:00:00Z',
      current_widget_value: 1,
      total_estimate: 1,
      loaded_count: 1,
      track_navigation: {
        track_id: 'track-1',
        filters: [{ field: 'status', op: 'eq', value: 'active' }],
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <LocationProbe />
        <QueryClientProvider client={queryClient}>
          <AppDashboardPanel appId="app-1" canEdit={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open chart records' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open filtered Track' }));

    const location = await screen.findByTestId('location');
    expect(location.textContent).toContain('/tracks/track-1?');
    const query = location.textContent?.split('?')[1] ?? '';
    expect(new URLSearchParams(query).get('dashboard_filters')).toBe(
      JSON.stringify([{ field: 'status', op: 'eq', value: 'active' }]),
    );
  });
});


describe('dashboard deletion confirmation', () => {
  it('does not delete when confirmation is cancelled', async () => {
    removeMock.mockClear();
    confirmMock.mockResolvedValue(false);
    listMock.mockResolvedValue([{ id: 'confirm-board', name: 'Review board', widgets: [], layout: { columns: 12, row_height: 80 } }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><AppDashboardPanel appId="app-1" canEdit /></QueryClientProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Dashboard actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete dashboard' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete dashboard?', confirmLabel: 'Delete dashboard' })));
    expect(removeMock).not.toHaveBeenCalled();
  });
});


describe('streamlined dashboard controls', () => {
  it('keeps selection and editing visible and secondary actions in the menu', async () => {
    listMock.mockResolvedValue([{ id: 'controls-board', name: 'Home', is_default: true, widgets: [], layout: { columns: 12, row_height: 80 } }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><AppDashboardPanel appId="app-1" canEdit /></QueryClientProvider></MemoryRouter>);
    const selector = await screen.findByRole('combobox', { name: 'Dashboard' });
    expect(screen.getByRole('option', { name: 'Home · Default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit layout' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: '__new__' } });
    expect(await screen.findByRole('dialog', { name: 'New dashboard' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard actions' }));
    expect(screen.getByRole('menuitem', { name: 'Default dashboard' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename dashboard' }));
    expect(await screen.findByRole('textbox', { name: 'Dashboard name' })).toHaveValue('Home');
  });
});
