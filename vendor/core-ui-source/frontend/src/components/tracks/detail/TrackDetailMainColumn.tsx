import { type ReactNode, type RefObject, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { TrackFilterStrip } from '../TrackFilterStrip';
import type { FieldFilter } from '../fieldFilters';
import { ListPager } from '../../ui/ListPager';
import { FilterChips } from '../../views/FilterChips';
import { trackFilterSpecs } from '../../views/columnFilterModel';
import { EntryComposer } from '../../entries/EntryComposer';
import { FilterActionRow, LINE_ICON_STROKE, filterBar } from '../../ui';
import { Surface } from '../../../ui';
import { ViewRenderer } from '../../../views';
import type { ViewWidgetProps } from '../../../views/types';
import type {
  OperationalModelFieldSpec,
  Entry,
  EntryTypeNode,
  SavedView,
  Track,
} from '../../../types';

export interface TrackDetailMainColumnProps {
  isPagesView: boolean;
  rightRailOpen: boolean;
  /** The App's ``defaults.toolbar.show_search_and_filters``. False hides the search box and Filters. Default true. */
  showSearchAndFilters?: boolean;
  filterType: string;
  setFilterType: (v: string) => void;
  entryTypeSlugs: string[];
  tagFilterEntries?: Entry[];
  filterTags?: string[];
  setFilterTags?: (value: string[]) => void;
  trackSearch: string;
  setTrackSearch: (v: string) => void;
  retrievalMode: string;
  runRetrieval: (q: string) => void;
  retrievalLoading: boolean;
  retrievalError: string | null;
  retrievalDegraded: string | null;
  canCreateEntry: boolean;
  track: Track;
  activeView: SavedView | null;
  kanbanCreateCustomFieldFallback:
    | (() => Record<string, unknown> | undefined)
    | undefined;
  kanbanWorkflowEnumLabels:
    | Record<string, Record<string, string>>
    | undefined;
  onEntryCreatedFromComposer: (entry?: Entry) => void;
  semanticMode: boolean;
  retrievalMissingCount: number;
  matchesLoading?: boolean;
  matchesError?: boolean;
  onRetryMatches?: () => void;
  filteredEntries: Entry[];
  retrievalResultsLength: number;
  entriesListError: string | null;
  onRetryEntries: () => void;
  entriesPending: boolean;
  onEntryOpen: ViewWidgetProps['onEntryOpen'];
  onEntryDelete: NonNullable<ViewWidgetProps['onEntryDelete']>;
  onEntryDeleteFailed: () => void;
  onEntryEdit: NonNullable<ViewWidgetProps['onEntryEdit']>;
  onEntryUpdate: NonNullable<ViewWidgetProps['onEntryUpdate']>;
  onEntryPersist: NonNullable<ViewWidgetProps['onEntryPersist']>;
  onViewUpdate: NonNullable<ViewWidgetProps['onViewUpdate']>;
  onKanbanColumnRemove?: ViewWidgetProps['onKanbanColumnRemove'];
  onKanbanColumnEnumSync: NonNullable<
    ViewWidgetProps['onKanbanColumnEnumSync']
  >;
  onEntryCreate: NonNullable<ViewWidgetProps['onEntryCreate']>;
  entryTypes: EntryTypeNode[];
  trackEntryTypeFields: OperationalModelFieldSpec[];
  fieldFilters: FieldFilter[];
  setFieldFilters: (value: FieldFilter[]) => void;
  /** Table lists: the server's order for the whole list, the exact total, and the page controls. */
  sort?: { field: string; path?: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (next: { field: string; path?: string; dir: 'asc' | 'desc' }) => void;
  entriesTotal?: number;
  pager?: { page: number; pageSize: number; total: number; busy?: boolean; onPage: (page: number) => void; onPageSize: (size: number) => void };
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  emptyStateContent: ReactNode;
  recordReadBoundaryNotice?: ReactNode;
  trackEntriesSentinelRef: RefObject<HTMLDivElement>;
}

export function TrackDetailMainColumn({
  isPagesView,
  rightRailOpen,
  showSearchAndFilters = true,
  filterType,
  setFilterType,
  entryTypeSlugs,
  tagFilterEntries,
  filterTags,
  setFilterTags,
  trackSearch,
  setTrackSearch,
  retrievalMode,
  runRetrieval,
  retrievalLoading,
  retrievalError,
  retrievalDegraded,
  canCreateEntry,
  track,
  activeView,
  kanbanCreateCustomFieldFallback,
  kanbanWorkflowEnumLabels,
  onEntryCreatedFromComposer,
  semanticMode,
  retrievalMissingCount,
  matchesLoading,
  matchesError,
  onRetryMatches,
  filteredEntries,
  retrievalResultsLength,
  entriesListError,
  onRetryEntries,
  entriesPending,
  onEntryOpen,
  onEntryDelete,
  onEntryDeleteFailed,
  onEntryEdit,
  onEntryUpdate,
  onEntryPersist,
  onViewUpdate,
  onKanbanColumnEnumSync,
  onKanbanColumnRemove,
  onEntryCreate,
  entryTypes,
  trackEntryTypeFields,
  fieldFilters,
  setFieldFilters,
  sort,
  onSortChange,
  entriesTotal,
  pager,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  emptyStateContent,
  recordReadBoundaryNotice,
  trackEntriesSentinelRef,
}: TrackDetailMainColumnProps) {
  const filterSpecs = useMemo(() => trackFilterSpecs(trackEntryTypeFields, track?.id), [trackEntryTypeFields, track?.id]);
  return (
    <section
      className={`min-w-0 ${
        isPagesView ? 'pt-0' : filterBar.sectionTopPad
      } ${
        rightRailOpen && !isPagesView
          ? 'xl:pr-16'
          : isPagesView && rightRailOpen
            ? 'xl:pr-0'
            : ''
      }`}
    >
      {!isPagesView ? (
        <>
          {/* A track that hides search and Filters, with nothing to add here,
              gets no toolbar row at all: an empty row only left a gap. */}
          {showSearchAndFilters || canCreateEntry ? (
          <FilterActionRow>
            {showSearchAndFilters ? (
            <div className="w-full max-w-xl min-w-[min(100%,18rem)]">
              <TrackFilterStrip
                filterType={filterType}
                setFilterType={setFilterType}
                entryTypeSlugs={entryTypeSlugs}
                filterSpecs={filterSpecs}
                fieldFilters={fieldFilters}
                onFieldFiltersChange={setFieldFilters}
                tagEntries={tagFilterEntries}
                selectedTags={filterTags}
                onTagsChange={setFilterTags}
                search={trackSearch}
                setSearch={setTrackSearch}
                retrievalActive={retrievalMode !== 'graph'}
                liveKeywordSearch={retrievalMode === 'lexical'}
                onRetrievalSearch={runRetrieval}
                retrievalLoading={retrievalLoading}
                retrievalError={retrievalError}
                retrievalDegraded={retrievalDegraded}
              />
            </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            <div className="flex items-center gap-2 shrink-0">
              {canCreateEntry ? (
                <EntryComposer
                  track={track}
                  viewEntryTypeKeys={activeView?.entry_type_keys}
                  viewDefaultEntryTypeKey={
                    activeView?.default_entry_type_key ??
                    track?.operational_model_defaults?.default_entry_type
                  }
                  createCustomFieldFallback={kanbanCreateCustomFieldFallback}
                  workflowEnumLabels={kanbanWorkflowEnumLabels}
                  onCreated={onEntryCreatedFromComposer}
                />
              ) : null}
            </div>
          </FilterActionRow>
          ) : null}

          {semanticMode && retrievalMissingCount > 0 ? (
            <div className="mb-3 text-xs text-[color:var(--text-subtle)]">
              Showing {filteredEntries.length} of {retrievalResultsLength}{' '}
              matches.{' '}
              <span className="text-[color:var(--text-muted)]">
                {matchesLoading ? 'Loading matching records…' : matchesError ? 'Matching records could not be loaded.' : 'Some matches are outside the current filters or no longer available.'}
                {matchesError && <button type="button" className="ml-2 underline" onClick={onRetryMatches}>Retry</button>}
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {entriesListError ? (
        <div
          className="mb-4 rounded-[var(--radius-card)] p-3 text-xs text-[var(--danger-fg)] bg-[var(--danger-bg)] border border-[color:var(--danger-fg)]/20"
          role="alert"
        >
          {entriesListError}{' '}
          <button
            type="button"
            className="underline ml-1"
            onClick={onRetryEntries}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!isPagesView && fieldFilters.length > 0 ? (
        <Surface tone="panel" border="entry-table" radius="card" padding="none" className="mb-3 overflow-hidden">
          <FilterChips specs={filterSpecs} filters={fieldFilters} onChange={setFieldFilters} total={entriesTotal} />
        </Surface>
      ) : null}
      {recordReadBoundaryNotice}
      {recordReadBoundaryNotice && filteredEntries.length === 0 ? null : activeView ? (
        <>
          <ViewRenderer
            view={activeView}
            viewContext="track-list"
            entries={filteredEntries}
            isLoading={entriesPending}
            onEntryOpen={onEntryOpen}
            onEntryDelete={onEntryDelete}
            onEntryDeleteFailed={onEntryDeleteFailed}
            onEntryEdit={onEntryEdit}
            onEntryUpdate={onEntryUpdate}
            onEntryPersist={onEntryPersist}
            onViewUpdate={onViewUpdate}
            onKanbanColumnEnumSync={onKanbanColumnEnumSync}
            onKanbanColumnRemove={onKanbanColumnRemove}
            onEntryCreate={onEntryCreate}
            entryTypeSlugs={entryTypeSlugs}
            entryTypes={entryTypes}
            trackDefaultEntryTypeKey={
              track?.operational_model_defaults?.default_entry_type
            }
            fields={trackEntryTypeFields}
            columnFilters={fieldFilters}
            onColumnFiltersChange={setFieldFilters}
            totalCount={entriesTotal}
            sort={sort}
            onSortChange={onSortChange}
            filterType={filterType}
            onFilterChange={setFilterType}
            fetchMore={
              hasNextPage && !isFetchingNextPage
                ? () => fetchNextPage()
                : undefined
            }
            hasNextPage={hasNextPage}
            isFetchingNext={isFetchingNextPage}
            emptyState={emptyStateContent || undefined}
            isEditor={canCreateEntry}
            track={track ?? undefined}
          />
          {pager ? (
            <ListPager
              page={pager.page}
              pageSize={pager.pageSize}
              total={pager.total}
              busy={pager.busy}
              onPageChange={pager.onPage}
              onPageSizeChange={pager.onPageSize}
              label="entries"
            />
          ) : null}
          {isFetchingNextPage ? (
            <div className="flex justify-center py-4 text-[color:var(--text-muted)]">
              <Loader2
                size={22}
                strokeWidth={LINE_ICON_STROKE}
                className="animate-spin"
                aria-label="Loading more entries"
              />
            </div>
          ) : null}
          <div
            ref={trackEntriesSentinelRef}
            className="h-px w-full shrink-0"
            aria-hidden
          />
        </>
      ) : (
        emptyStateContent
      )}

    </section>
  );
}
