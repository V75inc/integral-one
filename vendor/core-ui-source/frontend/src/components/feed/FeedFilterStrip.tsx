import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { AppSelect } from '../ui/AppSelect';
import { Button } from '../ui/Button';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import type { App, Track, Tag } from '../../types';

/**
 * FeedFilterStrip — horizontal filter bar that replaces the right-rail
 * `FeedFiltersCard` on the Feed page (Phase B rework). All controls
 * preserved verbatim — same set of filter dimensions (search, app,
 * track, entry type) — only the layout changes from a stacked sidebar
 * card to an inline strip with the most-used controls always visible
 * and the granular ones tucked behind a popover.
 *
 * Layout:
 *   [search input          ] [Search button] [Filters ▾] [✕ clear]
 *
 * The retrieval Mode dropdown that previously lived inline was retired
 * in favor of a global Settings → Search → Mode picker. The strip now
 * sees only ``retrievalActive`` (semantic / hybrid → API mode) and
 * ``onRetrievalSearch`` to dispatch the query.
 *
 * The "Filters" popover holds the per-track + per-entry-type dimensions
 * since they're used less often than search and app.
 */
interface FeedFilterStripProps {
  appIdFromQuery: string;
  setAppFilter: (appId: string) => void;
  apps: App[];
  appName: string | null;
  filterTrack: string;
  setFilterTrack: (id: string) => void;
  tracks: Track[];
  tagTracks?: Track[];
  filterType: string;
  setFilterType: (t: string) => void;
  typeOptions: string[];
  feedSearch: string;
  setFeedSearch: (q: string) => void;
  /** Row-derived filters owned by the parent (tag and author come from
   *  EntryCard clicks rather than FilterStrip dropdowns). When provided,
   *  the strip's "Clear all" extends to wipe these too — otherwise the
   *  user would still see chips after clearing. */
  tags?: Tag[];
  tagsError?: boolean;
  filterTag?: string;
  setFilterTag?: (id: string) => void;
  filterAuthor?: string;
  setFilterAuthor?: (id: string) => void;
  /** Atomic clear-all callback that clears every filter dimension in a
   *  single URL update — avoids the stale-closure race when individual
   *  URL-param setters are called sequentially. */
  onClearAll?: () => void;
  /** True when the global Settings → Search → Mode is set to a
   *  retrieval (non-graph) mode. Renders the primary Search submit
   *  button and routes Enter through ``onRetrievalSearch``. When false
   *  the strip degrades to a pure in-memory filter. */
  retrievalActive?: boolean;
  /** Submit handler invoked when the user presses Enter in the search
   *  input OR clicks the primary Search button. Receives the raw query —
   *  the consumer trims and calls /api/retrieve. */
  onRetrievalSearch?: (query: string) => void;
  /** Loading flag — disables the search button while a retrieval request
   *  is in-flight. */
  retrievalLoading?: boolean;
  /** Error envelope surfaced beneath the strip when a retrieval request
   *  fails. The strip renders it inline so the user sees the failure at
   *  the search site. */
  retrievalError?: string | null;
}

export function FeedFilterStrip({
  appIdFromQuery,
  setAppFilter,
  apps,
  appName,
  filterTrack,
  setFilterTrack,
  tracks,
  tagTracks = tracks,
  filterType,
  setFilterType,
  typeOptions,
  feedSearch,
  setFeedSearch,
  tags = [],
  tagsError = false,
  filterTag = '',
  setFilterTag,
  filterAuthor = '',
  setFilterAuthor,
  onClearAll,
  retrievalActive = false,
  onRetrievalSearch,
  retrievalLoading = false,
  retrievalError = null,
}: FeedFilterStripProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close the granular-filters popover on outside click / Esc.
  useEffect(() => {
    if (!popoverOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[role="listbox"]')) return;
      setPopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const appSelectOptions = useMemo(() => {
    const fromApps = apps.map(s => ({ value: s.id, label: s.name }));
    const orphan =
      appIdFromQuery && !apps.some(s => s.id === appIdFromQuery)
        ? [
            {
              value: appIdFromQuery,
              label: appName || 'Selected app',
            },
          ]
        : [];
    return [{ value: '', label: 'All Apps' }, ...orphan, ...fromApps];
  }, [apps, appIdFromQuery, appName]);

  const trackSelectOptions = useMemo(
    () => [
      { value: '', label: 'All tracks' },
      ...tracks.map(t => ({ value: t.id, label: t.title })),
    ],
    [tracks]
  );

  const entryTypeSelectOptions = useMemo(
    () => [
      { value: '', label: 'All types' },
      ...typeOptions.map(t => ({
        value: t,
        label: (
          <span className="capitalize">
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        ),
      })),
    ],
    [typeOptions]
  );

  const granularActiveCount =
    (appIdFromQuery ? 1 : 0) + (filterTrack ? 1 : 0) + (filterType ? 1 : 0) + (filterTag ? 1 : 0);
  const anyActive = Boolean(
    feedSearch.trim() ||
      appIdFromQuery ||
      filterTrack ||
      filterType ||
      filterTag ||
      filterAuthor
  );

  const clearAll = onClearAll ?? (() => {
    setFeedSearch('');
    setAppFilter('');
    setFilterTrack('');
    setFilterType('');
    setFilterTag?.('');
    setFilterAuthor?.('');
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && retrievalActive && onRetrievalSearch) {
      e.preventDefault();
      onRetrievalSearch(feedSearch);
    }
  };

  // B-FEED-01: debounced live retrieval search. Previously the input only
  // fired the retrieval query on Enter or button click — typing alone did
  // nothing, which most users read as "search broken". 350ms debounce
  // balances responsiveness with not hammering the retrieval endpoint.
  const lastLiveQueryRef = useRef<string>('');
  useEffect(() => {
    if (!retrievalActive || !onRetrievalSearch) return;
    const trimmed = feedSearch.trim();
    if (trimmed === lastLiveQueryRef.current) return;
    if (trimmed === '') {
      lastLiveQueryRef.current = '';
      return;
    }
    const handle = window.setTimeout(() => {
      lastLiveQueryRef.current = trimmed;
      onRetrievalSearch(feedSearch);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [feedSearch, retrievalActive, onRetrievalSearch]);

  return (
    /* Single inline row at every width: [search...] [Search] [Filters ▾] [Clear].
       The primary Search button only renders when the global Settings
       mode is set to a retrieval (non-graph) mode. In graph mode the
       strip is a pure in-memory filter and the search input dispatches
       on every keystroke. */
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-row items-center gap-2 sm:gap-3 min-w-0">
        {/* Search dominates the left edge and grows to fill remaining
            space. Bordered fill matches the composer's surface chrome. */}
        <div className="relative flex-1 min-w-0">
          <Search
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden
          />
          <input
            value={feedSearch}
            onChange={e => setFeedSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={
              retrievalActive
                ? 'Search across the workspace'
                : 'Search the feed…'
            }
            aria-label="Search the feed"
            className="
              w-full bg-[var(--panel)]
              border border-[var(--panel-border)]
              rounded-[var(--radius-input)]
              py-2 pl-9 pr-3 text-sm
              text-[var(--text)] placeholder:text-[var(--text-subtle)]
              transition-colors duration-fast
              hover:border-[var(--text-subtle)]
              focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel-2)]
            "
          />
        </div>

        {/* Primary Search submit — icon-only Button primary (CTA token:
            white-in-dark / black-in-light), matching the "New track"
            button so every primary action reads uniformly. Label is
            ``aria-label`` only; the search-glyph carries the meaning. */}
        {retrievalActive && onRetrievalSearch ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={retrievalLoading}
            onClick={() => onRetrievalSearch(feedSearch)}
            disabled={!feedSearch.trim()}
            aria-label={retrievalLoading ? 'Searching' : 'Search'}
            className="shrink-0 self-stretch !px-3 !py-0"
          >
            {!retrievalLoading ? (
              <Search size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            ) : null}
          </Button>
        ) : null}

      {/* Filter cluster — pushed to the right edge, matching button-pill
          chrome so the row reads as siblings of the search input.
          App / Track / Entry type all live inside the popover so the
          visible strip stays at two controls regardless of viewport. */}
      <div className="flex items-center gap-2 shrink-0 text-sm">
        {/* Granular filters — bordered fill button, matching the strip's
            other controls. Active state shows in --text + count badge. */}
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setPopoverOpen(o => !o)}
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            className={[
              'inline-flex items-center gap-1.5',
              'rounded-[var(--radius-input)]',
              'border bg-[var(--panel)]',
              'px-3 py-2 text-sm',
              'transition-colors duration-fast',
              granularActiveCount > 0
                ? 'border-[var(--text-subtle)] text-[var(--text)]'
                : 'border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)]',
            ].join(' ')}
          >
            <Filter size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            <span>Filters</span>
            {granularActiveCount > 0 && (
              <span
                aria-label={`${granularActiveCount} active filter${granularActiveCount === 1 ? '' : 's'}`}
                className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-[var(--panel-border)] text-[var(--text)] text-[12px] font-semibold leading-none tabular-nums"
              >
                {granularActiveCount}
              </span>
            )}
          </button>
          {popoverOpen && (
            <div
              role="dialog"
              aria-label="Feed filters"
              /* Popover sized for thumb-friendly selection on mobile.
                 `w-[22rem]` gives the field labels and values room to
                 breathe; `max-w-[calc(100vw-1rem)]` keeps it inside the
                 viewport at 360px. Section spacing (`space-y-4`) and
                 increased label/control padding make the popover feel
                 like a proper filter sheet rather than a cramped menu. */
              className="
                absolute right-0 top-full mt-2 z-50
                w-[22rem] max-w-[calc(100vw-1rem)]
                overflow-auto max-h-[calc(100vh-8rem)]
                rounded-[var(--radius-card)] border border-[var(--panel-border)]
                bg-[var(--panel)] shadow-[var(--shadow-pop)]
                p-4 sm:p-5 space-y-4
                animate-fade-in
              "
            >
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">
                  App
                </label>
                <AppSelect
                  value={appIdFromQuery}
                  onValueChange={setAppFilter}
                  options={appSelectOptions}
                  aria-label="Filter feed by app"
                  className="app-input text-sm py-2.5 w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">
                  Track
                </label>
                <AppSelect
                  value={filterTrack}
                  onValueChange={setFilterTrack}
                  options={trackSelectOptions}
                  aria-label="Filter feed by track"
                  className="app-input text-sm py-2.5 w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">
                  Entry type
                </label>
                <AppSelect
                  value={filterType}
                  onValueChange={setFilterType}
                  options={entryTypeSelectOptions}
                  aria-label="Filter feed by entry type"
                  className="app-input text-sm py-2.5 w-full"
                />
              </div>
              {setFilterTag && <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">Tag</label>
                <AppSelect value={filterTag} onValueChange={setFilterTag}
                  aria-label="Filter feed by tag" className="app-input text-sm py-2.5 w-full"
                  options={[
                    { value: '', label: 'All tags' },
                    ...tags.filter(tag => !filterTrack || tag.track_id === filterTrack || tag.id === filterTag).map(tag => ({
                      value: tag.id,
                      label: `${tag.name} · ${tagTracks.find(track => track.id === tag.track_id)?.title ?? apps.find(app => app.id === tag.app_id)?.name ?? (tag.track_id ? 'Track tag' : 'App tag')}`,
                    })),
                    ...(filterTag && !tags.some(tag => tag.id === filterTag) ? [{ value: filterTag, label: 'Selected tag' }] : []),
                  ]} />
                {tagsError && <p role="status" className="text-xs text-[var(--text-muted)]">Could not load tags. Reopen the page to retry.</p>}
              </div>}
              {(appIdFromQuery || filterTrack || filterType || filterTag) && (
                <button
                  type="button"
                  onClick={() => {
                    setAppFilter('');
                    setFilterTrack('');
                    setFilterType('');
                    setFilterTag?.('');
                  }}
                  className="text-xs text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>
          )}
        </div>

        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Clear all filters"
            className="
              inline-flex items-center gap-1 text-sm
              text-[var(--text-subtle)]
              hover:text-[var(--text)]
              transition-colors duration-fast
            "
          >
            <X size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            Clear
          </button>
        )}
        </div>
      </div>

      {/* Retrieval error envelope — rendered beneath the strip so the
          failure surfaces at the search site instead of as a toast. */}
      {retrievalError ? (
        <div
          role="alert"
          className="
            rounded-[var(--radius-input)]
            bg-[var(--danger-bg)] text-[var(--danger-fg)]
            border border-[color:var(--danger-fg)]/20
            px-3 py-2 text-xs
          "
        >
          {retrievalError}
        </div>
      ) : null}
    </div>
  );
}
