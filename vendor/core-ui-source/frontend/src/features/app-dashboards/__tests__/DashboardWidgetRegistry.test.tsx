import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  ChartBarWidget,
  ChartPieWidget,
  DashboardWidgetRenderer,
  MetricCardWidget,
} from '../DashboardWidgetRegistry';

vi.mock('recharts', async () => {
  const React = await import('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-mock">{children}</div>
  );
  return {
    ResponsiveContainer: passthrough,
    BarChart: passthrough,
    Bar: () => <div data-testid="bar" />,
    LineChart: passthrough,
    Line: () => null,
    PieChart: passthrough,
    Pie: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="pie">{children}</div>
    ),
    Cell: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => <div data-testid="chart-legend" />,
  };
});

describe('DashboardWidgetRenderer', () => {
  it('renders selected record fields, unknown values and optional details', () => {
    render(<MemoryRouter><DashboardWidgetRenderer type="record_summary" title="Current work"
      data={{ records: [{ id: 'n.Entry.1', title: 'My record', fields: { step: 'Explore', next: null, brief: 'A concise brief' } }], total_matched: 2 }}
      config={{ fields: [{ field: 'step', label: 'Step' }, { field: 'next', label: 'Next action' }, { field: 'brief', label: 'Brief', detail: true }] }}
    /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'My record' })).toHaveAttribute('href', '/entries/n.Entry.1');
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Not yet set')).toBeInTheDocument();
    expect(screen.getByText('A concise brief').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Showing 1 of 2 records.')).toBeInTheDocument();
  });

  it('keeps the configured empty state separate from a failed query', () => {
    const config = { fields: [{ field: 'step', label: 'Step' }], empty_message: 'Bring an idea or explore your interests.' };
    const { rerender } = render(<DashboardWidgetRenderer type="record_summary" title="Current work" data={{ records: [] }} config={config} />);
    expect(screen.getByText('Bring an idea or explore your interests.')).toBeInTheDocument();
    rerender(<DashboardWidgetRenderer type="record_summary" title="Current work" data={{ error: 'declared_query_failed' }} config={config} />);
    expect(screen.queryByText('Bring an idea or explore your interests.')).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load: declared_query_failed")).toBeInTheDocument();
  });

  it('does not treat a returned URL as a record navigation target', () => {
    render(<MemoryRouter><DashboardWidgetRenderer type="record_summary" title="Current work"
      data={{ records: [{ id: 'https://external.example', title: 'Unlinked record', fields: { step: 'Test' } }] }}
      config={{ fields: [{ field: 'step', label: 'Step' }] }}
    /></MemoryRouter>);
    expect(screen.getByText('Unlinked record')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders metric_card with value', () => {
    render(
      <MetricCardWidget title="Open items" data={{ value: 42 }} />,
    );
    expect(screen.getByText('Open items')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders metric_card suffix from config', () => {
    render(
      <MetricCardWidget
        title="Revenue"
        data={{ value: 1200 }}
        config={{ suffix: 'USD' }}
      />,
    );
    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('renders aggregate progress against its target', () => {
    render(
      <DashboardWidgetRenderer
        type="progress"
        title="Monthly revenue"
        data={{ value: '2500' }}
        config={{ target: 5000, suffix: 'GYD' }}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2500');
    expect(screen.getByText('2,500 / 5,000 GYD')).toBeInTheDocument();
  });

  it('renders table_widget using the matching record rows', () => {
    render(
      <DashboardWidgetRenderer
        type="table_widget"
        title="Latest invoices"
        data={{ entries: [{ id: 'e1', title: 'Invoice 1042', status: 'Open', updated_at: '2026-09-28T12:00:00Z' }] }}
      />,
    );
    expect(screen.getByText('Invoice 1042')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('2026-09-28')).toBeInTheDocument();
  });

  it.each(['table_widget', 'recent_entries'])('links %s records to their entry dialog', type => {
    render(<MemoryRouter><DashboardWidgetRenderer type={type} title="Jobs" data={{entries: [{id: 'entry-1', track_id: 'track-1', title: 'Repair the tap'}]}} /></MemoryRouter>);
    expect(screen.getByRole('link', {name: 'Repair the tap'})).toHaveAttribute('href', '/tracks/track-1?entry=entry-1');
  });

  it('shows error state when data.error is set', () => {
    render(
      <MetricCardWidget
        title="Broken"
        data={{ error: 'track not found' }}
      />,
    );
    expect(screen.getByText(/Couldn't load/)).toBeInTheDocument();
    expect(screen.getByText(/track not found/)).toBeInTheDocument();
  });

  it('renders horizontal bar chart with legend when configured', () => {
    const onDrillThrough = vi.fn();
    render(
      <ChartBarWidget
        title="Statuses"
        config={{ orientation: 'horizontal', show_legend: true }}
        onDrillThrough={onDrillThrough}
        data={{
          series: [
            { label: 'Open', value: 3 },
            { label: 'Done', value: 7 },
          ],
        }}
      />,
    );
    expect(screen.getByText('Statuses')).toBeInTheDocument();
    expect(screen.getByTestId('chart-legend')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Open: 3' }).click();
    expect(onDrillThrough).toHaveBeenCalledWith('Open');
  });

  it('renders pie chart legend by default', () => {
    render(
      <ChartPieWidget
        title="Mix"
        data={{
          series: [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('chart-legend')).toBeInTheDocument();
  });

  it('falls back for unknown widget type', () => {
    render(
      <DashboardWidgetRenderer
        type="unknown_widget"
        title="Test"
        data={{}}
      />,
    );
    expect(screen.getByText(/Unknown widget/)).toBeInTheDocument();
  });

  it('hides Entry drill-through for declared query aggregates', () => {
    render(
      <DashboardWidgetRenderer
        type="metric_card"
        title="Assets"
        data={{ value: 3, drill_through_supported: false }}
        onDrillThrough={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'View contributing records' })).not.toBeInTheDocument();
  });
});
