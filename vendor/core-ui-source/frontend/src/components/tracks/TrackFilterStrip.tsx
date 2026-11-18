import type { Entry } from '../../types';
import { TrackTagFilters } from './TrackTagFilters';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import { ColumnFilterMenu } from '../views/ColumnFilterMenu';
import { onField, type ColumnFilterSpec } from '../views/columnFilterModel';
import type { FieldFilter } from './fieldFilters';
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { useLiveKeywordSearch } from '../../hooks/useLiveKeywordSearch';

/**
 * TrackFilterStrip — search + filters cluster for the Track Detail
 * page. Visually mirrors `FeedFilterStrip` (same bordered-fill search
 * input, same Filters popover button, same Clear text-link) so a user
 * who knows the feed filter row recognizes the controls instantly.
 *
 * Track-scoped differences from FeedFilterStrip:
 *   - No "All apps" dropdown (the track is already context).
 *   - The Filters popover contains entry types and entry-tag choices
 *     (track is fixed by route). The header is reserved for Track metadata.
 *
 * The retrieval Mode dropdown that previously lived inline was retired
 * in favor of a global Settings → Search → Mode picker.
 */

interface TrackFilterStripProps {
  filterType: string;
  setFilterType: (slug: string) => void;
  entryTypeSlugs: string[];
  /** Filters typed into the table's column headings (applied by the server): how many, and how to clear them. */
  /** Every field of the Track that can be filtered, the filters on them, and how to change them (the server applies them). */
  filterSpecs?: ColumnFilterSpec[];
  fieldFilters?: FieldFilter[];
  onFieldFiltersChange?: (next: FieldFilter[]) => void;
  tagEntries?: Entry[];
  selectedTags?: string[];
  onTagsChange?: (value: string[]) => void;
  search: string;
  setSearch: (q: string) => void;
  /** True when the global Settings → Search → Mode is set to a
   *  retrieval (non-graph) mode. Renders the primary Search submit
   *  button and routes Enter through ``onRetrievalSearch``. */
  retrievalActive?: boolean;
  liveKeywordSearch?: boolean;
  /** Submit handler invoked when the user presses Enter in the search
   *  input OR clicks the primary Search button. */
  onRetrievalSearch?: (query: string) => void;
  retrievalLoading?: boolean;
  retrievalError?: string | null;
  retrievalDegraded?: string | null;
}

function filterTypeChipClass(active: boolean) {
  return [
    /* Padding is supplied by the caller so the popover variant can
       enlarge for touch. */
    'rounded-full border text-xs font-medium transition-colors duration-fast',
    active
      ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
      : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
  ].join(' ');
}

export function TrackFilterStrip({
  filterType,
  setFilterType,
  entryTypeSlugs,
  filterSpecs = [],
  fieldFilters = [],
  onFieldFiltersChange,
  tagEntries = [],
  selectedTags = [],
  onTagsChange,
  search,
  setSearch,
  retrievalActive = false,
  liveKeywordSearch = false,
  onRetrievalSearch,
  retrievalLoading = false,
  retrievalError = null,
  retrievalDegraded = null,
}: TrackFilterStripProps) {
  const submitSearch = useLiveKeywordSearch(search, retrievalActive && liveKeywordSearch, onRetrievalSearch);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<CSSProperties>({});

  // Outside click + Escape close the granular-filters popover.
  useEffect(() => {
    if (!popoverOpen) { setEditingField(null); return; }
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (e.target instanceof Node && popoverRef.current.contains(e.target))
        return;
      setPopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverOpen(false);
        filterButtonRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const granularActiveCount = (filterType ? 1 : 0) + selectedTags.length + new Set(fieldFilters.map(f => f.field)).size;
  const anyActive = Boolean(search.trim() || granularActiveCount);

  // Count badges and Clear can move the trigger on narrow screens. Keep the
  // panel inside the viewport after selection, resize and page scrolling.
  useLayoutEffect(() => {
    if (!popoverOpen) return;
    const position = () => {
      const anchor = filterButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.max(0, Math.min(352, window.innerWidth - 24));
      const top = Math.max(
        12,
        Math.min(anchor.bottom + 12, window.innerHeight - 160),
      );
      setPopoverPosition({
        width,
        top,
        left: Math.max(
          12,
          Math.min(anchor.right - width, window.innerWidth - width - 12),
        ),
        maxHeight: Math.max(0, window.innerHeight - top - 12),
      });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [popoverOpen, granularActiveCount]);

  const clearAll = () => {
    setSearch('');
    setFilterType('');
    onTagsChange?.([]);
    onFieldFiltersChange?.([]);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && retrievalActive && onRetrievalSearch) {
      e.preventDefault();
      submitSearch(search);
    }
  };

  return (
    /* Single inline row at every width: [search...] [Search] [Filters ▾] [Clear].
       The primary Search button only renders when the global Settings
       mode is set to a retrieval (non-graph) mode. */
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-row items-center gap-2 sm:gap-3 min-w-0">
        {/* Search dominates the left edge and grows to fill remaining
            space. Bordered fill matches the composer's surface chrome —
            identical to FeedFilterStrip. */}
        <div className="relative flex-1 min-w-0">
          <Search
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={
              retrievalActive ? 'Search this track' : 'Search this track…'
            }
            aria-label="Search the track"
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

        {/* Primary Search submit — icon-only Button primary, matching
            the "New track" button. ``aria-label`` carries semantics. */}
        {retrievalActive && onRetrievalSearch ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={retrievalLoading}
            onClick={() => submitSearch(search)}
            disabled={!search.trim()}
            aria-label={retrievalLoading ? 'Searching' : 'Search'}
            className="shrink-0 self-stretch !px-3 !py-0"
          >
            {!retrievalLoading ? (
              <Search size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            ) : null}
          </Button>
        ) : null}

        {/* Filter cluster — pushed to the right edge, matching button-pill
          chrome so the row reads as siblings of the search input. */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap text-sm">
          <div ref={popoverRef} className="relative">
            <button
              type="button"
              ref={filterButtonRef}
              onClick={() => setPopoverOpen((o) => !o)}
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
                  className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-[var(--panel-border)] text-[var(--text)] text-[11px] font-semibold leading-none tabular-nums"
                >
                  {granularActiveCount}
                </span>
              )}
            </button>
            {popoverOpen && (
              <div
                role="dialog"
                aria-label="Filter entries"
                style={popoverPosition}
                className="
                fixed z-50
                overflow-auto
                rounded-[var(--radius-card)] border border-[var(--panel-border)]
                bg-[var(--panel)] shadow-[var(--shadow-pop)]
                p-4 sm:p-5 space-y-4
                animate-fade-in
              "
              >
                {entryTypeSlugs.length > 1 && (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">
                    Entry type
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Filter entries by type"
                  >
                    <button
                      type="button"
                      onClick={() => setFilterType('')}
                      /* Slightly larger touch target on mobile so chip
                       selection feels confident; tightens at sm+. */
                      className={`px-3 py-2 sm:px-2.5 sm:py-1 ${filterTypeChipClass(filterType === '')}`}
                      aria-pressed={filterType === ''}
                    >
                      All types
                    </button>
                    {entryTypeSlugs.map((slug) => (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => setFilterType(slug)}
                        className={`capitalize px-3 py-2 sm:px-2.5 sm:py-1 ${filterTypeChipClass(filterType === slug)}`}
                        aria-pressed={filterType === slug}
                      >
                        {humanizeEnumValue(slug)}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                {onTagsChange && (
                  <TrackTagFilters
                    entries={tagEntries}
                    selected={selectedTags}
                    onChange={onTagsChange}
                  />
                )}
                {onFieldFiltersChange && filterSpecs.length > 0 && (
                  <div className="space-y-2" role="group" aria-label="Filter by field">
                    {editingField ? (
                      <>
                        <button type="button" className="text-xs text-[var(--link)] hover:underline" onClick={() => setEditingField(null)}>‹ All fields</button>
                        <ColumnFilterMenu
                          spec={filterSpecs.find(f => f.field === editingField)!}
                          filters={fieldFilters}
                          onChange={onFieldFiltersChange}
                          onClose={() => setEditingField(null)}
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.08em]">Fields</p>
                        <ul className="max-h-52 space-y-0.5 overflow-auto">
                          {filterSpecs.map(spec => (
                            <li key={spec.field}>
                              <button type="button" onClick={() => setEditingField(spec.field)}
                                className="flex w-full items-center justify-between rounded-[var(--radius-input)] px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)]">
                                <span>{spec.label}</span>
                                {onField(fieldFilters, spec.field).length > 0 ? <span className="text-xs text-[var(--link)]">on</span> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {entryTypeSlugs.length > 1 && filterType && (
                  <button
                    type="button"
                    onClick={() => setFilterType('')}
                    className="text-xs text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                  >
                    Reset entry-type filter
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
      {retrievalDegraded && !retrievalError ? (
        <p role="status" className="text-xs text-[var(--text-muted)]">
          {retrievalDegraded}
        </p>
      ) : null}
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
