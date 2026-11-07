import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TrackDetailMainColumn, type TrackDetailMainColumnProps } from '../TrackDetailMainColumn';
import { RecordReadBoundaryNotice } from '../../../entries/RecordReadBoundaryNotice';
import type { Entry, SavedView, Track } from '../../../../types';

vi.mock('../../TrackFilterStrip', () => ({ TrackFilterStrip: () => null }));
vi.mock('../../../entries/EntryComposer', () => ({ EntryComposer: () => null }));
vi.mock('../../../../views', () => ({ ViewRenderer: ({ entries }: { entries: Entry[] }) => (
  <div>{entries.length ? entries.map(entry => <h3 key={entry.id}>{entry.title}</h3>) : 'Legacy widget: no entries to display'}</div>
) }));

function mount({ entries = [], restricted = false, active = true }: {
  entries?: Entry[]; restricted?: boolean; active?: boolean;
} = {}) {
  const noop = () => {};
  const props: TrackDetailMainColumnProps = {
    isPagesView: false, rightRailOpen: false, filterType: '', setFilterType: noop,
    entryTypeSlugs: [], trackSearch: '', setTrackSearch: noop, retrievalMode: 'hybrid',
    runRetrieval: noop, retrievalLoading: false, retrievalError: null, retrievalDegraded: null,
    canCreateEntry: false, track: { id: 'track', title: 'Directory' } as Track,
    activeView: active ? { id: 'view', name: 'Directory', type: 'table' } as SavedView : null,
    kanbanCreateCustomFieldFallback: undefined, kanbanWorkflowEnumLabels: undefined,
    onEntryCreatedFromComposer: noop, semanticMode: true, retrievalMissingCount: 0,
    filteredEntries: entries, retrievalResultsLength: entries.length,
    entriesListError: null, onRetryEntries: noop, entriesPending: false,
    onEntryOpen: noop, onEntryDelete: noop, onEntryDeleteFailed: noop,
    onEntryEdit: noop, onEntryUpdate: noop, onEntryPersist: async () => {},
    onViewUpdate: noop, onKanbanColumnEnumSync: async () => {}, onEntryCreate: noop,
    entryTypes: [], trackEntryTypeFields: [], hasNextPage: false,
    isFetchingNextPage: false, fetchNextPage: noop,
    emptyStateContent: <div>Page fallback: no entries yet</div>,
    recordReadBoundaryNotice: restricted ? <RecordReadBoundaryNotice searching appId="known-app" /> : undefined,
    trackEntriesSentinelRef: { current: null },
  };
  return render(<MemoryRouter><TrackDetailMainColumn {...props} /></MemoryRouter>);
}

describe('Track read coverage across view widgets', () => {
  it.each([true, false])('a restriction replaces empty widget/fallback claims: active view = %s', active => {
    mount({ restricted: true, active });
    expect(screen.getByRole('status', { name: 'App record coverage' })).toBeVisible();
    expect(screen.queryByText(/no entries to display|no entries yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open App' })).toHaveAttribute('href', '/apps/known-app');
  });

  it('preserves admitted rows alongside a partial coverage notice', () => {
    mount({ restricted: true, entries: [{ id: 'visible', title: 'Allowed record' } as Entry] });
    expect(screen.getByRole('heading', { name: 'Allowed record' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'App record coverage' })).toBeVisible();
  });

  it('keeps ordinary empty rendering when there is no restriction', () => {
    mount();
    expect(screen.getByText('Legacy widget: no entries to display')).toBeVisible();
    expect(screen.queryByRole('status', { name: 'App record coverage' })).not.toBeInTheDocument();
  });
});
