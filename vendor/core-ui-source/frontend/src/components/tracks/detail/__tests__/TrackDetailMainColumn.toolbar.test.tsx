import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TrackDetailMainColumn, type TrackDetailMainColumnProps } from '../TrackDetailMainColumn';
import type { SavedView, Track } from '../../../../types';

// The App's defaults.toolbar.show_search_and_filters decides whether the search box and Filters show.
vi.mock('../../TrackFilterStrip', () => ({ TrackFilterStrip: () => <div>search and filters</div> }));
vi.mock('../../../entries/EntryComposer', () => ({ EntryComposer: () => <button type="button">Add</button> }));
vi.mock('../../../../views', () => ({ ViewRenderer: () => <div>view</div> }));

function mount(showSearchAndFilters?: boolean, canCreateEntry = true) {
  const noop = () => {};
  const props: TrackDetailMainColumnProps = {
    isPagesView: false, rightRailOpen: false, filterType: '', setFilterType: noop,
    entryTypeSlugs: [], trackSearch: '', setTrackSearch: noop, retrievalMode: 'graph',
    runRetrieval: noop, retrievalLoading: false, retrievalError: null, retrievalDegraded: null,
    canCreateEntry, track: { id: 'track', title: 'Settings' } as Track,
    activeView: { id: 'view', name: 'Settings', type: 'table' } as SavedView,
    kanbanCreateCustomFieldFallback: undefined, kanbanWorkflowEnumLabels: undefined,
    onEntryCreatedFromComposer: noop, semanticMode: false, retrievalMissingCount: 0,
    filteredEntries: [], retrievalResultsLength: 0,
    entriesListError: null, onRetryEntries: noop, entriesPending: false,
    onEntryOpen: noop, onEntryDelete: noop, onEntryDeleteFailed: noop,
    onEntryEdit: noop, onEntryUpdate: noop, onEntryPersist: async () => {},
    onViewUpdate: noop, onKanbanColumnEnumSync: async () => {}, onEntryCreate: noop,
    entryTypes: [], trackEntryTypeFields: [], fieldFilters: [], setFieldFilters: vi.fn(), hasNextPage: false,
    isFetchingNextPage: false, fetchNextPage: noop,
    emptyStateContent: <div>empty</div>,
    trackEntriesSentinelRef: { current: null },
    ...(showSearchAndFilters === undefined ? {} : { showSearchAndFilters }),
  };
  return render(<MemoryRouter><TrackDetailMainColumn {...props} /></MemoryRouter>);
}

describe('App-declared track toolbar', () => {
  it('shows search and filters by default', () => {
    mount();
    expect(screen.getByText('search and filters')).toBeInTheDocument();
  });

  it('hides search and filters when the App turns them off, and keeps Add', () => {
    mount(false);
    expect(screen.queryByText('search and filters')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('renders no toolbar row at all when search is hidden and nothing can be added', () => {
    const { container } = mount(false, false);
    expect(screen.queryByText('search and filters')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    // The row (search slot + actions) is gone, so it leaves no gap above the view.
    expect(container.querySelector('.mb-12')).toBeNull();
    expect(screen.getByText('view')).toBeInTheDocument();
  });
});
