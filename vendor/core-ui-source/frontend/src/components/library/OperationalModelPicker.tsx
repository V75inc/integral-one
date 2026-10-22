import { useMemo, useState } from 'react';
import { Check, Search, Layers, LayoutGrid } from 'lucide-react';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import type { OperationalModelNode } from '../../types';

export interface OperationalModelPickerItem {
  /** Prefixed value: 'manifest:key', 'template:id', 'library:id', or '' for default */
  value: string;
  name: string;
  description?: string;
  entryTypeCount: number;
  viewCount: number;
  /** 'platform' | 'organization' — shown as scope badge on library items */
  scope?: string;
  source: 'default' | 'app' | 'library';
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Label for the "None / Default" option */
  defaultLabel?: string;
  defaultDescription?: string;
  /** App-provided options: manifest tracks + templates (TrackModal only) */
  appSources?: OperationalModelPickerItem[];
  /** All library packages — picker filters by scopeFilter if provided */
  libraryPackages: OperationalModelNode[];
  /** Filter library to only 'track' or 'app' scope packages */
  scopeFilter?: 'track' | 'app';
}

const LINE_STROKE = 1.5;

function scopeBadgeClass(scope?: string): string {
  if (scope === 'organization') {
    return 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] border-[var(--brand-accent-line)]';
  }
  return 'bg-[var(--badge-muted-bg)] text-[var(--text-subtle)] border-[var(--panel-border)]';
}

function scopeBadgeLabel(scope?: string): string {
  if (scope === 'platform') return 'Platform';
  if (scope === 'organization') return 'Organization';
  if (scope === 'community') return 'Community';
  return scope ?? '';
}

export function OperationalModelPicker({
  value,
  onChange,
  defaultLabel = 'None / Default',
  defaultDescription = 'No operational model applied — use base content schema.',
  appSources = [],
  libraryPackages,
  scopeFilter,
}: Props) {
  const [search, setSearch] = useState('');

  // Build library items from packages, filtered by scope if requested
  const libraryItems = useMemo((): OperationalModelPickerItem[] => {
    return libraryPackages
      .filter(pkg => {
        if (!scopeFilter) return true;
        const manifest = (pkg.manifest ?? {}) as Record<string, unknown>;
        const { scopeKind } = summarizeLibraryManifest(manifest);
        return scopeKind === scopeFilter;
      })
      .map(pkg => {
        const manifest = (pkg.manifest ?? {}) as Record<string, unknown>;
        const { entryTypeCount, viewCount } = summarizeLibraryManifest(manifest);
        return {
          value: `library:${pkg.id}`,
          name: pkg.name || 'Untitled model',
          description: pkg.description || undefined,
          entryTypeCount,
          viewCount,
          scope: pkg.scope,
          source: 'library' as const,
        };
      });
  }, [libraryPackages, scopeFilter]);

  const q = search.trim().toLowerCase();

  const filteredApp = useMemo(() => {
    if (!q) return appSources;
    return appSources.filter(
      i => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
    );
  }, [appSources, q]);

  const filteredLib = useMemo(() => {
    if (!q) return libraryItems;
    return libraryItems.filter(
      i => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
    );
  }, [libraryItems, q]);

  function PickerRow({ item }: { item: OperationalModelPickerItem }) {
    const selected = value === item.value;
    return (
      <button
        type="button"
        onClick={() => onChange(item.value)}
        className={`
          w-full text-left rounded-[var(--radius-card)] border px-3 py-2.5
          flex items-start gap-3 transition-colors duration-fast
          ${selected
            ? 'border-[var(--brand-accent-line)] bg-[var(--brand-accent-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--panel-2)] hover:border-[var(--text-muted)]/25'
          }
        `}
      >
        {/* Check or empty circle */}
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]' : 'border-[var(--text-muted)]'}`}>
          {selected && <Check size={10} strokeWidth={3} className="text-white" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--text)] truncate">{item.name}</span>
            {item.scope && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-medium ${scopeBadgeClass(item.scope)}`}>
                {scopeBadgeLabel(item.scope)}
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs text-[var(--text-subtle)] line-clamp-2">{item.description}</p>
          )}
          {(item.entryTypeCount > 0 || item.viewCount > 0) && (
            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
              {item.entryTypeCount > 0 && (
                <span className="flex items-center gap-1">
                  <Layers size={11} strokeWidth={LINE_STROKE} />
                  {item.entryTypeCount} {item.entryTypeCount === 1 ? 'type' : 'types'}
                </span>
              )}
              {item.viewCount > 0 && (
                <span className="flex items-center gap-1">
                  <LayoutGrid size={11} strokeWidth={LINE_STROKE} />
                  {item.viewCount} {item.viewCount === 1 ? 'view' : 'views'}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  }

  const defaultItem: OperationalModelPickerItem = {
    value: '',
    name: defaultLabel,
    description: defaultDescription,
    entryTypeCount: 0,
    viewCount: 0,
    source: 'default',
  };

  const hasApp = filteredApp.length > 0;
  const hasLib = filteredLib.length > 0;
  const hasNoResults = q !== '' && !hasApp && !hasLib;

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          strokeWidth={LINE_STROKE}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
        />
        <input
          type="search"
          aria-label="Filter operational models"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter operational models…"
          className="
            w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
            bg-[var(--panel)] pl-9 pr-3 py-2 text-sm text-[var(--text)]
            placeholder:text-[var(--text-subtle)]
            transition-[border-color,box-shadow] duration-fast
            focus:outline-none focus:border-[var(--brand-accent-line)]
            focus:shadow-[0_0_0_3px_var(--focus-ring-color)]
          "
        />
      </div>

      {/* Scrollable list */}
      <div role="radiogroup" aria-label="Operational Model options" className="flex flex-col gap-2 max-h-96 overflow-y-auto px-2" style={{ scrollbarGutter: 'stable' }}>
        {/* Default option — always shown, not filtered */}
        <PickerRow item={defaultItem} />

        {/* FROM THIS APP section */}
        {hasApp && (
          <>
            <p className="text-xs uppercase tracking-wide font-semibold text-[var(--text-subtle)] mt-1 px-0.5">
              From this app
            </p>
            {filteredApp.map(item => (
              <PickerRow key={item.value} item={item} />
            ))}
          </>
        )}

        {/* LIBRARY section */}
        {hasLib && (
          <>
            <p className="text-xs uppercase tracking-wide font-semibold text-[var(--text-subtle)] mt-1 px-0.5">
              Library
            </p>
            {filteredLib.map(item => (
              <div key={item.value} className="space-y-1">
                <PickerRow item={item} />
              </div>
            ))}
          </>
        )}

        {/* No results */}
        {hasNoResults && (
          <p className="text-sm text-[var(--text-subtle)] py-2 text-center">
            No operational models match.{' '}
            <button
              type="button"
              className="underline text-[var(--link)] hover:no-underline"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
