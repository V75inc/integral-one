import { type ReactNode, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { TrackFilterStrip } from '../TrackFilterStrip';
import { EntryComposer } from '../../entries/EntryComposer';
import { FilterActionRow, LINE_ICON_STROKE, filterBar } from '../../ui';
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
  filterType: string;
  setFilterType: (v: string) => void;
  entryTypeSlugs: string[];
  trackSearch: string;
  setTrackSearch: (v: string) => void;
  retrievalMode: string;
  runRetrieval: (q: string) => void;
  retrievalLoading: boolean;
  retrievalError: string | null;
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
  onKanbanColumnEnumSync: NonNullable<
    ViewWidgetProps['onKanbanColumnEnumSync']
  >;
  onEntryCreate: NonNullable<ViewWidgetProps['onEntryCreate']>;
  entryTypes: EntryTypeNode[];
  trackEntryTypeFields: OperationalModelFieldSpec[];
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  emptyStateContent: ReactNode;
  trackEntriesSentinelRef: RefObject<HTMLDivElement>;
}

export function TrackDetailMainColumn({
  isPagesView,
  rightRailOpen,
  filterType,
  setFilterType,
  entryTypeSlugs,
  trackSearch,
  setTrackSearch,
  retrievalMode,
  runRetrieval,
  retrievalLoading,
  retrievalError,
  canCreateEntry,
  track,
  activeView,
  kanbanCreateCustomFieldFallback,
  kanbanWorkflowEnumLabels,
  onEntryCreatedFromComposer,
  semanticMode,
  retrievalMissingCount,
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
  onEntryCreate,
  entryTypes,
  trackEntryTypeFields,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  emptyStateContent,
  trackEntriesSentinelRef,
}: TrackDetailMainColumnProps) {
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
          <FilterActionRow>
            <div className="w-full max-w-xl min-w-[min(100%,18rem)]">
              <TrackFilterStrip
                filterType={filterType}
                setFilterType={setFilterType}
                entryTypeSlugs={entryTypeSlugs}
                search={trackSearch}
                setSearch={setTrackSearch}
                retrievalActive={retrievalMode !== 'graph'}
                onRetrievalSearch={runRetrieval}
                retrievalLoading={retrievalLoading}
                retrievalError={retrievalError}
              />
            </div>
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

          {semanticMode && retrievalMissingCount > 0 ? (
            <div className="mb-3 text-xs text-[color:var(--text-subtle)]">
              Showing {filteredEntries.length} of {retrievalResultsLength}{' '}
              matches.{' '}
              <span className="text-[color:var(--text-muted)]">
                {retrievalMissingCount} additional match
                {retrievalMissingCount === 1 ? ' is' : 'es are'} loading…
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

      {activeView ? (
        <>
          <ViewRenderer
            view={activeView}
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
            onEntryCreate={onEntryCreate}
            entryTypeSlugs={entryTypeSlugs}
            entryTypes={entryTypes}
            trackDefaultEntryTypeKey={
              track?.operational_model_defaults?.default_entry_type
            }
            fields={trackEntryTypeFields}
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
