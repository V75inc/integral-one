import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mockEntriesGet = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: { ...actual.entriesApi, get: (id: string) => mockEntriesGet(id) },
  };
});

// group_by relation-id resolution goes through useRelationLabels ->
// relationTargetLoader, which batches into POST /entry-lookup via
// apiClient directly (not entriesApi/tracksApi) — same boundary
// useRelationLabels.test.tsx mocks, mirrored here rather than reinvented.
vi.mock('../../../api/client', () => ({ default: { post: vi.fn() } }));

import { ChartRegionWidget } from '../ChartRegionWidget';
import apiClient from '../../../api/client';
import type { OperationalModelFieldSpec, Entry, SavedView } from '../../../types';

type PostMock = ReturnType<typeof vi.fn>;

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/** Every render needs a QueryClientProvider now that the widget resolves
 *  relation-typed group_by values via useRelationLabels (useQueries). */
function renderChart(ui: ReactElement) {
  const client = makeClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  // recharts' ResponsiveContainer needs ResizeObserver, which jsdom doesn't
  // implement — same stub pattern already used by DatePicker.test.tsx.
  // recharts 3's ResponsiveContainer waits on the observer callback itself
  // (not just the synchronous getBoundingClientRect below) before it sizes
  // its children — a no-op observe() left every chart permanently 0x0 and
  // no bars/points ever rendered. Firing the callback synchronously on
  // observe() with the same stubbed rect below mirrors what a real
  // ResizeObserver does on initial layout.
  class MockResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element) {
      this.callback(
        [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  // ResponsiveContainer reads the container's initial size synchronously via
  // getBoundingClientRect() (not just the ResizeObserver callback) — jsdom's
  // real implementation always returns 0x0, so the chart never mounts its
  // children without this.
  //
  // recharts 3 also calls getBoundingClientRect() on a hidden offscreen
  // <span> (`#recharts_measurement_span`, in util/DOMUtils.js) to measure
  // each axis tick label's real pixel width for its tick-collision
  // avoidance. A blanket 800x240 stub here made every label look 800px
  // wide, so recharts concluded any two ticks would overlap and silently
  // dropped all but one — assertions on axis tick text (below) always saw
  // just the last label. Give the measurement span a size proportional to
  // its own text instead, and reserve the wide stub for the chart's own
  // container element.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element
  ) {
    if (this.id === 'recharts_measurement_span') {
      const text = this.textContent ?? '';
      return {
        width: text.length * 7,
        height: 14,
        top: 0,
        left: 0,
        bottom: 14,
        right: text.length * 7,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    }
    return {
      width: 400,
      height: 240,
      top: 0,
      left: 0,
      bottom: 240,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;
  });
  // Default: resolve any /entry-lookup call to id-derived titles; the
  // relation-group test below overrides this with real department names.
  (apiClient.post as PostMock).mockImplementation(
    async (_url: string, body: { ids: string[]; kind: 'entry' | 'track' }) => ({
      data: { targets: body.ids.map(id => ({ id, title: `Entry ${id}`, body: '' })) },
    })
  );
});

afterEach(async () => {
  cleanup();
  // Recharts' Redux store batches notifications on animation frames. Drain
  // those callbacks while jsdom still owns cancelAnimationFrame, rather than
  // letting its fallback timer fire after the environment has been removed.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Headcount by Department',
    type: 'chart_region',
    track_id: 'track-employees',
    config,
  };
}

const trackEntries = [
  { id: 'a', title: 'a', custom_fields: { department: 'Eng' } },
  { id: 'b', title: 'b', custom_fields: { department: 'Eng' } },
  { id: 'c', title: 'c', custom_fields: { department: 'Sales' } },
] as unknown as Entry[];

describe('ChartRegionWidget', () => {
  it('source:track + bar renders one bar per aggregated group', async () => {
    const { container } = renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'bar',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={trackEntries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByTestId('chart-region-widget')).toBeInTheDocument();
    // recharts renders axis tick text inside nested <tspan>s that RTL's
    // getByText doesn't reliably match in jsdom — assert on the bar
    // rectangles themselves instead (one per group: Eng, Sales), and on the
    // per-datapoint `name` attribute recharts attaches to each cell.
    // ResponsiveContainer sizes itself on a post-mount effect, so this
    // settles a tick after the initial render (same reason the source:self
    // test below awaits rather than asserting synchronously).
    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    });
    // recharts 3 no longer forwards each data point's `name` onto its
    // rendered rect as a raw DOM attribute (recharts 2 did, incidentally —
    // this test used to key off that leak); assert on the axis tick text
    // itself instead. Plain textContent rather than getByText because the
    // label sits inside a nested <tspan> that RTL's text matcher doesn't
    // reliably match.
    expect(container.textContent).toContain('Eng');
    expect(container.textContent).toContain('Sales');
  });

  it('source:track + line renders without crashing', () => {
    renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'line',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={trackEntries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByTestId('chart-region-widget')).toBeInTheDocument();
  });

  it('source:track + pie renders without crashing', () => {
    renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'pie',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={trackEntries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByTestId('chart-region-widget')).toBeInTheDocument();
  });

  it('source:track + donut renders without crashing', () => {
    renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'donut',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={trackEntries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByTestId('chart-region-widget')).toBeInTheDocument();
  });

  it('source:self fetches the bound entry and plots configured fields as points', async () => {
    mockEntriesGet.mockResolvedValue({
      id: 'filing-1',
      title: 'NIS Schedule',
      custom_fields: { employer_contribution: 700, employee_contribution: 300 },
    });

    const { container } = renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'bar',
          source: 'self',
          fields: [
            { key: 'custom_fields.employer_contribution', label: 'Employer' },
            { key: 'custom_fields.employee_contribution', label: 'Employee' },
          ],
          __bindings: { entryId: 'filing-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
    });
    expect(container.textContent).toContain('Employer');
    expect(container.textContent).toContain('Employee');
    expect(mockEntriesGet).toHaveBeenCalledWith('filing-1');
  });

  it('renders an empty-state message when there is no data', () => {
    renderChart(
      <ChartRegionWidget
        view={baseView({ chart_type: 'bar', source: 'track', group_by: 'custom_fields.department' })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByText('No data to chart.')).toBeInTheDocument();
  });

  it('resolves a relation-typed group_by to display labels, not raw entry ids', async () => {
    (apiClient.post as PostMock).mockImplementation(
      async (_url: string, body: { ids: string[]; kind: 'entry' | 'track' }) => ({
        data: {
          targets: body.ids.map(id => ({
            id,
            title: id === 'n.Entry.dept-eng' ? 'Engineering' : 'Sales',
            body: '',
          })),
        },
      })
    );

    const relationEntries = [
      { id: 'a', title: 'a', custom_fields: { department: 'n.Entry.dept-eng' } },
      { id: 'b', title: 'b', custom_fields: { department: 'n.Entry.dept-eng' } },
      { id: 'c', title: 'c', custom_fields: { department: 'n.Entry.dept-sales' } },
    ] as unknown as Entry[];
    const departmentField: OperationalModelFieldSpec = {
      key: 'department',
      name: 'Department',
      type: 'relation',
      relation: { target: 'entry' },
    };

    const { container } = renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'bar',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={relationEntries}
        fields={[departmentField]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(container.textContent).toContain('Engineering');
    });
    expect(container.textContent).toContain('Sales');
    // The raw ids must never appear as axis labels once resolution succeeds.
    expect(container.textContent).not.toContain('n.Entry.dept-eng');
    expect(container.textContent).not.toContain('n.Entry.dept-sales');
  });

  it('falls back to the raw id if relation-label resolution fails', async () => {
    (apiClient.post as PostMock).mockRejectedValue(new Error('lookup failed'));

    const relationEntries = [
      { id: 'a', title: 'a', custom_fields: { department: 'n.Entry.dept-unknown' } },
    ] as unknown as Entry[];
    const departmentField: OperationalModelFieldSpec = {
      key: 'department',
      name: 'Department',
      type: 'relation',
      relation: { target: 'entry' },
    };

    const { container } = renderChart(
      <ChartRegionWidget
        view={baseView({
          chart_type: 'bar',
          source: 'track',
          group_by: 'custom_fields.department',
          aggregate: 'count',
        })}
        entries={relationEntries}
        fields={[departmentField]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    // Never blank/crash — renders something for the one group either way.
    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(1);
    });
  });
});
