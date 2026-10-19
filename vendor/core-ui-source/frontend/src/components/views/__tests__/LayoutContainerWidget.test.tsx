import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockGet = vi.fn();
const mockEntryTypesList = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: { ...actual.entriesApi, get: (id: string) => mockGet(id), list: async () => [] },
    entryTypesApi: { ...actual.entryTypesApi, list: (p?: unknown) => mockEntryTypesList(p) },
    tracksApi: { ...actual.tracksApi, list: async () => [] },
  };
});

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Stub the nested ComposableViewSlot so this test proves LayoutContainerWidget's
// own dispatch (which trackId/viewKey/bindings it passes down for a
// kind:'view' child) rather than re-testing ComposableViewSlot's own fetch
// logic, which has no dedicated coverage of its own to lean on here.
vi.mock('../ComposableViewSlot', () => ({
  ComposableViewSlot: ({ trackId, viewKey }: { trackId: string; viewKey: string }) => (
    <div data-testid="stub-view-slot">{`${trackId}:${viewKey}`}</div>
  ),
}));

import { LayoutContainerWidget } from '../LayoutContainerWidget';
import type { SavedView } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entryType = {
  id: 'et-1',
  name: 'schedule',
  form_schema: {
    _manifest_entry_type_key: 'nis_schedule',
    fields: [{ key: 'employer_name', name: 'Employer Name', type: 'text' }],
  },
};

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'container-1',
    name: 'Schedule Header',
    type: 'layout_container',
    track_id: 'track-1',
    default_entry_type_key: 'nis_schedule',
    config,
  };
}

describe('LayoutContainerWidget', () => {
  it('stack mode: renders a kind:view child as a nested ComposableViewSlot scoped to its own track', () => {
    render(
      <LayoutContainerWidget
        view={baseView({
          mode: 'stack',
          regions: [{ key: 'lines', kind: 'view', title: 'Lines', view: 'lines_table' }],
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    const slot = screen.getByTestId('stub-view-slot');
    expect(slot).toHaveTextContent('track-1:lines_table');
  });

  it('stack mode: renders a kind:form child via FormRegionWidget', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { employer_name: 'Acme Co' },
    });

    render(
      <LayoutContainerWidget
        view={baseView({
          mode: 'stack',
          regions: [{ key: 'header', kind: 'form', title: 'Header', fields: ['employer_name'] }],
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Co')).toBeInTheDocument();
    });
  });

  it('tabs mode: switches which region is visible on click', () => {
    render(
      <LayoutContainerWidget
        view={baseView({
          mode: 'tabs',
          regions: [
            { key: 'a', kind: 'view', title: 'Tab A', view: 'view_a' },
            { key: 'b', kind: 'view', title: 'Tab B', view: 'view_b' },
          ],
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    expect(screen.getByTestId('stub-view-slot')).toHaveTextContent('track-1:view_a');
    fireEvent.click(screen.getByText('Tab B'));
    expect(screen.getByTestId('stub-view-slot')).toHaveTextContent('track-1:view_b');
  });

  it('accordion mode: renders every region and toggles visibility on trigger click', () => {
    render(
      <LayoutContainerWidget
        view={baseView({
          mode: 'accordion',
          regions: [
            { key: 'a', kind: 'view', title: 'Section A', view: 'view_a' },
            { key: 'b', kind: 'view', title: 'Section B', view: 'view_b' },
          ],
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    const slots = screen.getAllByTestId('stub-view-slot');
    expect(slots).toHaveLength(2);
    fireEvent.click(screen.getByText('Section A'));
    // After collapsing section A, only section B's content remains rendered.
    expect(screen.getAllByTestId('stub-view-slot')).toHaveLength(1);
  });

  it('stack mode: a field committed in one form region updates a sibling form region\'s visible_if immediately, with no reload', async () => {
    // Regression for the exact bug reported live: NIS's "Schedule Header"
    // (schedule_type) and "Pay Period Dates" (period_2..5, each gated on
    // schedule_type === Weekly) are two SIBLING regions — each is its own
    // FormRegionWidget instance with its own independently-fetched entry
    // snapshot. Before the shared live-values channel, editing schedule_type
    // in one region never reached the other's visible_if check; only a full
    // page reload (re-fetching both fresh) picked it up.
    const twoFieldEntryType = {
      id: 'et-2',
      name: 'schedule',
      form_schema: {
        _manifest_entry_type_key: 'nis_schedule',
        fields: [
          { key: 'schedule_type', name: 'Schedule Type', type: 'text' },
          { key: 'period_2_date', name: 'Period 2', type: 'text' },
        ],
      },
    };
    mockEntryTypesList.mockResolvedValue([twoFieldEntryType]);
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { schedule_type: 'Monthly', period_2_date: '' },
    });

    render(
      <LayoutContainerWidget
        view={baseView({
          mode: 'stack',
          regions: [
            { key: 'header', kind: 'form', title: 'Header', fields: ['schedule_type'] },
            {
              key: 'periods',
              kind: 'form',
              title: 'Periods',
              fields: [
                { key: 'period_2_date', visible_if: { field: 'schedule_type', equals: 'Weekly' } },
              ],
            },
          ],
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Monthly')).toBeInTheDocument();
    });
    // Gated field starts hidden — schedule_type is Monthly, not Weekly.
    expect(screen.queryByLabelText('Period 2')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Monthly'), { target: { value: 'Weekly' } });

    // No new mockGet call needed — the sibling region picks this up purely
    // through the live-values channel, synchronously with the commit.
    await waitFor(() => {
      expect(screen.getByLabelText('Period 2')).toBeInTheDocument();
    });
  });

  it('renders nothing when no regions are configured', () => {
    const { container } = render(
      <LayoutContainerWidget
        view={baseView({ regions: [] })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
