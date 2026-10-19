/**
 * ResourceTagPopover — # picker for apps and tracks in the active workspace.
 *
 * Provides a visible, modal/card-style menu with:
 *  - Full list of available Apps and Tracks (no 12-item truncation).
 *  - App filtering: filter content associated with a specific App.
 *  - Automatic prioritization of tracks related to previously tagged apps at the top.
 *  - Viewport boundary detection and clamping to prevent offscreen clipping.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Boxes,
  Filter,
  FolderGit2,
  Sparkles,
  X,
} from 'lucide-react';

import { appsApi } from '../../api/apps';
import { tracksApi } from '../../api/tracks';
import { useScope } from '../../context/ScopeContext';
import type { App, Track } from '../../types';
import type { ChatEntityRef } from '../../types/chatEntityRefs';
import { normalizeEntityRef } from './chatEntityTokens';

export interface ResourceTagCandidate {
  kind: 'app' | 'track';
  id: string;
  label: string;
  subtitle?: string;
  app?: App;
  track?: Track;
  isPrioritized?: boolean;
}

export interface ResourceTagPopoverPosition {
  top: number;
  left: number;
  transform?: string;
  maxHeight?: number;
  placement?: 'above' | 'below';
}

interface ResourceTagPopoverProps {
  query: string;
  position: ResourceTagPopoverPosition;
  highlightIndex: number;
  zIndex?: number;
  previouslyTaggedAppIds?: string[];
  onCandidatesChange: (items: ResourceTagCandidate[]) => void;
  onSelect: (item: ResourceTagCandidate) => void;
  onDismiss: () => void;
}

type TabFilter = 'all' | 'apps' | 'tracks';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function matchesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase());
}

export function resourceCandidateToEntityRef(
  item: ResourceTagCandidate,
): ChatEntityRef {
  return normalizeEntityRef({
    kind: item.kind,
    id: item.id,
    label: item.label.trim(),
    subtitle: item.subtitle,
  });
}

// Module-level cache so typing # in the active workspace loads instantaneously (0ms)
const resourceCache: {
  workspaceId: string | null;
  apps: App[];
  tracks: Track[];
  timestamp: number;
} = {
  workspaceId: null,
  apps: [],
  tracks: [],
  timestamp: 0,
};

const CACHE_TTL_MS = 60_000;

export function clearResourceCache() {
  resourceCache.workspaceId = null;
  resourceCache.apps = [];
  resourceCache.tracks = [];
  resourceCache.timestamp = 0;
}

export function prefetchTagResources(workspaceId: string | null) {
  if (
    resourceCache.workspaceId === workspaceId &&
    resourceCache.apps.length + resourceCache.tracks.length > 0 &&
    Date.now() - resourceCache.timestamp < CACHE_TTL_MS
  ) {
    return;
  }
  void Promise.all([
    appsApi.list(),
    tracksApi.list({
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      skipEntryCounts: true,
    }),
  ])
    .then(([appList, trackList]) => {
      const wsApps = workspaceId
        ? appList.filter(a => a.workspace_id === workspaceId)
        : appList;
      resourceCache.workspaceId = workspaceId;
      resourceCache.apps = wsApps;
      resourceCache.tracks = trackList;
      resourceCache.timestamp = Date.now();
    })
    .catch(() => {});
}

export function ResourceTagPopover({
  query,
  position,
  highlightIndex,
  zIndex = 60,
  previouslyTaggedAppIds = [],
  onCandidatesChange,
  onSelect,
  onDismiss,
}: ResourceTagPopoverProps) {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? null;

  const hasCachedData =
    resourceCache.workspaceId === workspaceId &&
    resourceCache.apps.length + resourceCache.tracks.length > 0;

  const [apps, setApps] = useState<App[]>(() =>
    hasCachedData ? resourceCache.apps : [],
  );
  const [tracks, setTracks] = useState<Track[]>(() =>
    hasCachedData ? resourceCache.tracks : [],
  );
  const [loading, setLoading] = useState(!hasCachedData);
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [selectedAppFilter, setSelectedAppFilter] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const activeItemRef = useRef<HTMLLIElement | null>(null);

  const [adjustedCoords, setAdjustedCoords] = useState<{
    left?: number;
    top?: number;
  }>({});

  const debouncedQuery = useDebounced(query, 100);

  useEffect(() => {
    let cancelled = false;
    const isFresh =
      resourceCache.workspaceId === workspaceId &&
      resourceCache.timestamp > 0 &&
      Date.now() - resourceCache.timestamp < CACHE_TTL_MS &&
      (resourceCache.apps.length > 0 || resourceCache.tracks.length > 0);

    if (isFresh) {
      setLoading(false);
      return;
    }

    if (!hasCachedData) {
      setLoading(true);
    }

    void (async () => {
      try {
        const [appList, trackList] = await Promise.all([
          appsApi.list(),
          tracksApi.list({
            ...(workspaceId ? { workspace_id: workspaceId } : {}),
            skipEntryCounts: true,
          }),
        ]);
        if (cancelled) return;
        const wsApps = workspaceId
          ? appList.filter(a => a.workspace_id === workspaceId)
          : appList;

        resourceCache.workspaceId = workspaceId;
        resourceCache.apps = wsApps;
        resourceCache.tracks = trackList;
        resourceCache.timestamp = Date.now();

        setApps(wsApps);
        setTracks(trackList);
      } catch {
        if (!cancelled) {
          if (!hasCachedData) {
            setApps([]);
            setTracks([]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, hasCachedData]);

  const appNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of apps) {
      if (a.id && a.name) m.set(a.id, a.name);
    }
    return m;
  }, [apps]);

  const selectedAppName = useMemo(() => {
    if (!selectedAppFilter) return null;
    return appNameById.get(selectedAppFilter) || null;
  }, [selectedAppFilter, appNameById]);

  // Build candidate items based on query, tab filter, app filter, and previously tagged apps.
  const candidates = useMemo(() => {
    const q = debouncedQuery.trim();
    const prevAppSet = new Set(previouslyTaggedAppIds);

    const appCandidates: ResourceTagCandidate[] = [];
    const trackCandidates: ResourceTagCandidate[] = [];

    // Map which apps match query
    const matchingAppIds = new Set<string>();
    for (const app of apps) {
      const label = app.name || 'Untitled app';
      if (!q || matchesQuery(label, q)) {
        matchingAppIds.add(app.id);
        if (tabFilter !== 'tracks') {
          // If filtering by a specific app, only include that app
          if (!selectedAppFilter || selectedAppFilter === app.id) {
            appCandidates.push({
              kind: 'app',
              id: app.id,
              label,
              subtitle: 'App',
              app,
            });
          }
        }
      }
    }

    // Process tracks
    for (const track of tracks) {
      if (tabFilter === 'apps') continue;

      const trackAppId = track.app?.id || (track as unknown as { app_id?: string }).app_id;
      const parentAppName =
        track.app?.name ?? (trackAppId ? appNameById.get(trackAppId) : undefined);

      // If user selected an app filter, only show tracks for that app
      if (selectedAppFilter && trackAppId !== selectedAppFilter) {
        continue;
      }

      const label = track.title || 'Untitled track';
      const matchesDirect = !q || matchesQuery(label, q);
      const matchesViaParentApp =
        Boolean(q) &&
        Boolean(trackAppId && matchingAppIds.has(trackAppId)) &&
        !matchesDirect;

      if (matchesDirect || matchesViaParentApp) {
        const isFromTargetApp = Boolean(
          trackAppId &&
            (prevAppSet.has(trackAppId) ||
              (selectedAppFilter && trackAppId === selectedAppFilter)),
        );

        trackCandidates.push({
          kind: 'track',
          id: track.id,
          label,
          subtitle: parentAppName ? `Track · ${parentAppName}` : 'Track',
          track,
          isPrioritized: isFromTargetApp,
        });
      }
    }

    // Sort:
    // When previously tagged apps or an app filter exist, show their tracks at the top of the list!
    const prioritizedTracks = trackCandidates.filter(t => t.isPrioritized);
    const regularTracks = trackCandidates.filter(t => !t.isPrioritized);

    prioritizedTracks.sort((a, b) => a.label.localeCompare(b.label));
    regularTracks.sort((a, b) => a.label.localeCompare(b.label));
    appCandidates.sort((a, b) => a.label.localeCompare(b.label));

    let finalItems: ResourceTagCandidate[];

    if (tabFilter === 'tracks') {
      finalItems = [...prioritizedTracks, ...regularTracks];
    } else if (tabFilter === 'apps') {
      finalItems = appCandidates;
    } else {
      // In 'all' tab:
      // If there are prioritized tracks (from filtered app or previously tagged apps), put them at the very top!
      if (prioritizedTracks.length > 0) {
        finalItems = [...prioritizedTracks, ...regularTracks, ...appCandidates];
      } else {
        finalItems = [...appCandidates, ...regularTracks];
      }
    }

    return finalItems;
  }, [
    apps,
    tracks,
    debouncedQuery,
    tabFilter,
    selectedAppFilter,
    previouslyTaggedAppIds,
    appNameById,
  ]);

  useEffect(() => {
    onCandidatesChange(candidates);
  }, [candidates, onCandidatesChange]);

  // Autoscroll to active row when highlightIndex changes
  useEffect(() => {
    if (activeItemRef.current?.scrollIntoView) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  // Dismiss on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-resource-tag-popover]')) return;
      if (target.closest('[data-mention-host]')) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Viewport collision and boundary clamping
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let targetLeft = position.left;
    if (targetLeft + rect.width > vw - 12) {
      targetLeft = Math.max(12, vw - rect.width - 12);
    }
    if (targetLeft < 12) targetLeft = 12;

    let targetTop = position.top;
    if (position.placement === 'below' && targetTop + rect.height > vh - 12) {
      targetTop = Math.max(12, vh - rect.height - 12);
    }

    setAdjustedCoords({
      left: targetLeft,
      top: targetTop,
    });
  }, [position, candidates.length]);

  if (typeof document === 'undefined') return null;

  const currentTop = adjustedCoords.top ?? position.top;
  const currentLeft = adjustedCoords.left ?? position.left;
  const maxAvailableHeight = position.maxHeight ?? 380;

  return createPortal(
    <div
      ref={popoverRef}
      data-resource-tag-popover
      role="listbox"
      aria-label="App and track selector"
      style={{
        position: 'fixed',
        top: currentTop,
        left: currentLeft,
        transform: position.transform,
        zIndex,
        maxHeight: `${maxAvailableHeight}px`,
      }}
      className="
        min-w-[340px] max-w-[440px] w-[90vw]
        flex flex-col
        rounded-[var(--radius-card)]
        bg-[var(--panel)] border border-[var(--panel-border)]
        shadow-[var(--shadow-pop)]
        animate-fade-in select-none
        overflow-hidden
      "
    >
      {/* Header bar with title and filter tabs */}
      <div className="flex flex-col border-b border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2 gap-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-[var(--brand-accent)]" />
            <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
              Select App or Track
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition"
          >
            <X size={13} />
          </button>
        </div>

        {/* Tab filters */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTabFilter('all')}
            className={`
              px-2 py-0.5 rounded text-[11px] font-medium transition
              ${
                tabFilter === 'all'
                  ? 'bg-[var(--panel)] text-[var(--brand-accent)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]'
              }
            `}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTabFilter('apps')}
            className={`
              px-2 py-0.5 rounded text-[11px] font-medium transition
              ${
                tabFilter === 'apps'
                  ? 'bg-[var(--panel)] text-[var(--brand-accent)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]'
              }
            `}
          >
            Apps ({apps.length})
          </button>
          <button
            type="button"
            onClick={() => setTabFilter('tracks')}
            className={`
              px-2 py-0.5 rounded text-[11px] font-medium transition
              ${
                tabFilter === 'tracks'
                  ? 'bg-[var(--panel)] text-[var(--brand-accent)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]'
              }
            `}
          >
            Tracks ({tracks.length})
          </button>
        </div>

        {/* Active App Filter Indicator */}
        {selectedAppFilter && (
          <div className="flex items-center justify-between rounded bg-[var(--brand-accent-soft)] px-2 py-1 text-[11px] text-[var(--text)]">
            <span className="truncate">
              Filtering content in: <strong>{selectedAppName || selectedAppFilter}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedAppFilter(null)}
              className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--brand-accent)] hover:underline"
            >
              <X size={11} /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Candidate List */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-color:var(--scrollbar-thumb)_transparent]">
        {loading && candidates.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--text-subtle)]">
            Loading apps and tracks…
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--text-subtle)]">
            {query ? `No matches for “${query}”` : 'No apps or tracks available.'}
            {selectedAppFilter ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAppFilter(null)}
                  className="text-xs text-[var(--brand-accent)] hover:underline"
                >
                  Clear App filter
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <ul ref={listRef} className="flex flex-col py-1">
            {candidates.map((item, idx) => {
              const active = idx === highlightIndex;
              const isApp = item.kind === 'app';
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  ref={active ? activeItemRef : null}
                >
                  <div
                    role="option"
                    aria-selected={active}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => onSelect(item)}
                    className={`
                      w-full text-left flex items-center justify-between gap-2.5 px-3 py-2
                      cursor-pointer transition-colors duration-fast
                      ${active ? 'bg-[var(--panel-2)]' : 'hover:bg-[var(--panel-2)]'}
                    `}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`
                          shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold
                          tracking-wide
                          ${
                            isApp
                              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          }
                        `}
                      >
                        {isApp ? (
                          <>
                            <Boxes size={11} />
                            App
                          </>
                        ) : (
                          <>
                            <FolderGit2 size={11} />
                            Track
                          </>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-[var(--text)] truncate">
                            {item.label}
                          </span>
                          {item.isPrioritized && (
                            <span className="shrink-0 text-[10px] rounded px-1 py-0.2 bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] font-medium">
                              Tagged App
                            </span>
                          )}
                        </div>
                        {item.subtitle ? (
                          <div className="text-[11px] text-[var(--text-subtle)] truncate">
                            {item.subtitle}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* App-specific filter action */}
                    {isApp && (
                      <button
                        type="button"
                        title={`Filter tracks in ${item.label}`}
                        aria-label={`Filter tracks in ${item.label}`}
                        onMouseDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedAppFilter(item.id);
                        }}
                        className={`
                          shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
                          transition border border-transparent
                          ${
                            selectedAppFilter === item.id
                              ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] border-[var(--brand-accent-line)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] hover:border-[var(--border-subtle)]'
                          }
                        `}
                      >
                        <Filter size={10} />
                        Filter
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer status / shortcut hint */}
      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)] shrink-0">
        <span>
          {candidates.length} option{candidates.length === 1 ? '' : 's'} available
        </span>
        <span className="flex items-center gap-1">
          <kbd className="font-sans px-1 rounded bg-[var(--panel-2)]">↑↓</kbd> navigate ·{' '}
          <kbd className="font-sans px-1 rounded bg-[var(--panel-2)]">⏎</kbd> select
        </span>
      </div>
    </div>,
    document.body,
  );
}
