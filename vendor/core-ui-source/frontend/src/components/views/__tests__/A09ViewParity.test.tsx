import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import fixture from '../../../fixtures/a09QueryProjectionFixture.json';
import type { Entry, OperationalModelFieldSpec, SavedView } from '../../../types';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import { ToastProvider } from '../../../context/ToastContext';
import { CalendarWidget } from '../CalendarWidget';
import { KanbanWidget } from '../KanbanWidget';
import { TableWidget } from '../TableWidget';
import { MetricCardWidget } from '../../../features/app-dashboards/DashboardWidgetRegistry';

const stableRelationResult = vi.hoisted(() => ({
  targets: [], loading: false, error: null,
}));
const stableMemberLabels = vi.hoisted(() => ({
  resolveMemberLabel: () => undefined, loading: false,
}));

// The projection contract is independent of pointer collision physics.  The
// real board is rendered below with a no-op DnD transport so 101 cards remain
// a focused assertion about grouping rather than a jsdom layout benchmark.
vi.mock('@dnd-kit/core', () => {
  const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DndContext: PassThrough,
    DragOverlay: PassThrough,
    KeyboardSensor: class {},
    MouseSensor: class {},
    TouchSensor: class {},
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
    useSensor: () => ({}),
    useSensors: () => [],
    closestCenter: () => [],
    pointerWithin: () => [],
    rectIntersection: () => [],
    getFirstCollision: () => undefined,
  };
});

vi.mock('@dnd-kit/sortable', () => {
  const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    SortableContext: PassThrough,
    verticalListSortingStrategy: () => null,
    horizontalListSortingStrategy: () => null,
    useSortable: () => ({
      attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null,
      transition: undefined, isDragging: false,
    }),
    sortableKeyboardCoordinates: () => null,
    arrayMove: <T,>(items: T[]) => items,
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('../../entries/relations', () => ({
  useRelationLabels: () => stableRelationResult,
}));

vi.mock('../../entries/members/useWorkspaceMemberLabelMap', () => ({
  useWorkspaceMemberLabelMap: () => stableMemberLabels,
}));

const fields: OperationalModelFieldSpec[] = [
  { key: 'fixture_key', name: 'Fixture key', type: 'text' },
  { key: 'lifecycle', name: 'Lifecycle', type: 'select', enum: ['available'] },
  { key: 'service_due', name: 'Service due', type: 'date' },
];

const entries: Entry[] = fixture.entries.map((item, index) => ({
  id: item.fixture_key,
  title: item.title,
  track_id: 'a09-assets',
  type: 'Entry',
  author_id: 'a09-test-user',
  custom_fields: item.custom_fields,
  created_at: `2026-09-01T00:00:${String(index).padStart(2, '0')}Z`,
}));

const noop = () => {};

function view(type: SavedView['type'], config: Record<string, unknown>): SavedView {
  return {
    id: `a09-${type}`,
    name: `A09 ${type}`,
    type,
    track_id: 'a09-assets',
    config,
  } as SavedView;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('A09 shared query and projection fixture', () => {
  it('renders every one of the 101 boundary-qualified rows in the table', () => {
    render(
      <TableWidget
        view={view('table', {
          columns: [
            { field: 'title', label: 'Asset' },
            { field: 'custom_fields.service_due', label: 'Service due' },
          ],
        })}
        entries={entries}
        fields={fields}
        isLoading={false}
        onEntryOpen={noop}
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(fixture.eligible_count + 1);
    expect(screen.getAllByText('A09 Asset 001')).toHaveLength(2);
    expect(screen.getAllByText('A09 Asset 101')).toHaveLength(2);
  });

  it('projects the same 101 records into one board column', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConfirmProvider>
          <ToastProvider>
            <KanbanWidget
              view={view('kanban', {
                group_by: 'custom_fields.lifecycle',
                kanban_columns: [{ key: 'available', label: 'Available' }],
              })}
              entries={entries}
              fields={fields}
              isLoading={false}
              isEditor={false}
              onEntryOpen={noop}
            />
          </ToastProvider>
        </ConfirmProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('A09 Asset 101')).toBeInTheDocument();
  });

  it('preserves both date-boundary totals in the calendar overflow indicators', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    render(
      <CalendarWidget
        view={view('calendar', {
          calendar_mapping: { date_field: 'custom_fields.service_due' },
        })}
        entries={entries}
        fields={fields}
        isLoading={false}
        isEditor={false}
        onEntryOpen={noop}
      />,
    );

    expect(screen.getByText('+48 more')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('+47 more')).toBeInTheDocument();
  });

  it('renders the dashboard aggregate produced by the same fixture', () => {
    render(
      <MetricCardWidget
        title="Assets due in the selected window"
        data={{ value: fixture.eligible_count, total_matched: fixture.eligible_count }}
      />,
    );

    expect(screen.getByText('Assets due in the selected window')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });
});
