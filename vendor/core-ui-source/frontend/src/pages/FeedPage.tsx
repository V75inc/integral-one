import { selectedTagIds, withTagFilters, toggleTagFilter } from '../utils/tagFilters';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Inbox, Loader2, MessageSquare } from 'lucide-react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { appsApi, tracksApi, entriesApi, tagsApi } from '../api';
import { feedApi, type FeedEntriesPage } from '../api/feed';
import { notifyApiFailure } from '../components/system';
import { EntryCard } from '../components/entries/EntryCard';
import { EntryComposer } from '../components/entries/EntryComposer';
import { EntryDetail } from '../components/entries/EntryDetail';
import { FeedFilterStrip } from '../components/feed/FeedFilterStrip';
import { useRetrieve } from '../hooks/useRetrieve';
import { useSearchResultEntries } from '../hooks/useSearchResultEntries';
import { useOpenEntryModalRefetch } from '../hooks/useOpenEntryModalRefetch';
import {
  CardSkeleton,
  EmptyState,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  filterBar,
  FilterActionRow,
  Button,
} from '../components/ui';
import type { Entry, App, Track } from '../types';
import { BASE_ENTRY_TYPE_SLUGS } from '../utils';
import {
  canCreateEntryForRole,
  resolveTrackRoleForUser,
} from '../utils/entryEditRights';
import { isTrackNavVisible } from '../utils/trackNav';
import {
  FEED_ENTRIES_QUERY_KEY_ROOT,
  invalidateFeedCaches,
  tracksListQueryKey,
  tagsForWorkspaceQueryKey,
} from '../queryKeys';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useChatPageFocus } from '../context/ChatPageFocusContext';
import { useAssistantDockOptional } from '../context/AssistantDockContext';
import { formatShortRelativeTime } from '../utils';

// Local alias for the shared root (now defined in ``queryKeys.ts``
// so EntryCard can invalidate without importing this page). The
// alias keeps existing call sites in this file unchanged.
const feedEntriesQueryKeyRoot = FEED_ENTRIES_QUERY_KEY_ROOT;

function mergeDedupedEntries(pages: FeedEntriesPage[]): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const p of pages) {
    for (const e of p.entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

export function FeedPage() {
  const { scope } = useScope();
  const { user } = useAuth();
  const workspaceId = scope?.workspaceId ?? '__none__';
  const [searchParams, setSearchParams] = useSearchParams();
  const appIdFromQuery = searchParams.get('app')?.trim() || '';
  const entryIdForDeepLink = searchParams.get('entry')?.trim() || '';
  // Tag and author filters live in the URL so any link in the app
  // (feed-card pill, detail-popup chip, etc.) can route to a filtered
  // view by hyperlink alone — no parent-prop wiring needed.
  const filterTags = useMemo(() => selectedTagIds(searchParams), [searchParams]);
  const filterAuthor = searchParams.get('author')?.trim() || '';
  const navigate = useNavigate();
  const dock = useAssistantDockOptional();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const feedLoadSentinelRef = useRef<HTMLDivElement>(null);
  const feedEntryRedirectRef = useRef(0);

  const [apps, setApps] = useState<App[]>([]);
  const [appName, setAppName] = useState<string | null>(null);
  const [entryModal, setEntryModal] = useState<{
    entry: Entry;
    focusComments?: boolean;
    initialEditMode?: boolean;
  } | null>(null);
  const [filterTrack, setFilterTrack] = useState('');
  const [filterType, setFilterType] = useState('');
  const [feedSearch, setFeedSearch] = useState('');
  const { setPageContext, clearPageContext } = useChatPageFocus();

  // Retrieval — Feed search is GLOBAL: even when the page is filtered
  // to a specific space, the search itself spans the entire workspace
  // so the user surfaces matches regardless of which app they're
  // currently viewing. Track-detail search is app-/track-scoped (see
  // TrackDetailPage). Mode is read from global Settings (Settings →
  // Search → Mode); ``semantic`` is the v1.1 default.
  const {
    mode: retrievalMode,
    results: retrievalResults,
    loading: retrievalLoading,
    error: retrievalError,
    run: runRetrieval,
    reset: resetRetrieval,
  } = useRetrieve({ scope: undefined, authorityKey: `${workspaceId}:${user?.id}` });

  // URL-write helpers for the tag/author filters. Toggling matches the
  // existing pattern (click the active filter again → clear).
  const setFilterTags = useCallback(
    (ids: string[]) => setSearchParams(previous => withTagFilters(previous, ids), { replace: true }),
    [setSearchParams],
  );
  const setFilterAuthor = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set('author', id);
      else next.delete('author');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (!entryIdForDeepLink) return;
    const myReq = ++feedEntryRedirectRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const entry = await entriesApi.get(entryIdForDeepLink);
        if (cancelled || myReq !== feedEntryRedirectRef.current) return;
        navigate(
          `/tracks/${entry.track_id}?entry=${encodeURIComponent(entry.id)}`,
          { replace: true }
        );
      } catch {
        if (cancelled || myReq !== feedEntryRedirectRef.current) return;
        showToast('Could not open this entry', 'error');
        setSearchParams(
          prev => {
            const n = new URLSearchParams(prev);
            n.delete('entry');
            return n;
          },
          { replace: true }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryIdForDeepLink, navigate, setSearchParams, showToast]);

  const { data: workspaceTags = [], isError: tagsError } = useQuery({
    queryKey: tagsForWorkspaceQueryKey(workspaceId),
    queryFn: () => tagsApi.list(),
    enabled: workspaceId !== '__none__',
  });

  const feedQueryKey = useMemo(
    () =>
      [...feedEntriesQueryKeyRoot, workspaceId, appIdFromQuery, filterTrack, filterTags] as const,
    [workspaceId, appIdFromQuery, filterTrack, filterTags]
  );

  const {
    data: feedData,
    error: feedError,
    isLoading: feedLoading,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch: refetchFeed,
  } = useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      feedApi.getEntriesPage({
        include_total: false,
        ...(filterTrack ? { track_id: filterTrack } : {}),
        ...(appIdFromQuery ? { app_id: appIdFromQuery } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(filterTags.length ? { tag_ids: filterTags.join(',') } : {}),
      }),
    retry: (attempt, error) =>
      (error as { response?: { status?: number } }).response?.status !== 429 && attempt < 1,
    getNextPageParam: last =>
      last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });

  const { data: tracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: [...tracksListQueryKey(appIdFromQuery), workspaceId] as const,
    queryFn: () =>
      appIdFromQuery
        ? appsApi.listTracks(appIdFromQuery)
        : tracksApi.list({ limit: 100 }),
  });

  const navTracks = useMemo(
    () => (tracks as Track[]).filter(isTrackNavVisible),
    [tracks],
  );

  const creatableTracks = useMemo(
    () =>
      navTracks.filter(t =>
        canCreateEntryForRole(resolveTrackRoleForUser(user, t)),
      ),
    [navTracks, user],
  );

  const semanticMode =
    retrievalMode === 'semantic' || retrievalMode === 'hybrid';
  const retrievalIdOrder = useMemo(
    () => retrievalResults.map(r => r.entry_id),
    [retrievalResults]
  );
  const retrievalIdSet = useMemo(
    () => new Set(retrievalIdOrder),
    [retrievalIdOrder]
  );
  // Hydrate the bounded ranked selection directly. Walking every feed page
  // to find twenty IDs creates request bursts and can loop forever on 429.
  const {
    data: matchedPage,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
    patchPage: patchMatchingEntries,
  } = useSearchResultEntries({
    entryIds: retrievalIdOrder,
    workspaceId,
    principalId: user?.id,
    enabled: semanticMode,
    params: {
      ...(filterTrack ? { track_id: filterTrack } : {}),
      ...(appIdFromQuery ? { app_id: appIdFromQuery } : {}),
      ...(filterTags.length ? { tag_ids: filterTags.join(',') } : {}),
    },
  });

  const allEntries = useMemo(
    () => mergeDedupedEntries([...(matchedPage ? [matchedPage] : []), ...(feedData?.pages ?? [])]),
    [feedData, matchedPage]
  );
  const openModalEntryId = entryModal?.entry.id;

  useEffect(() => {
    if (!openModalEntryId) return;
    const latest = allEntries.find(e => e.id === openModalEntryId);
    if (!latest) return;
    setEntryModal(prev => {
      if (!prev || prev.entry.id !== openModalEntryId) return prev;
      if (prev.entry === latest) return prev;
      return { ...prev, entry: latest };
    });
  }, [allEntries, openModalEntryId]);

  const handleOpenEntryRefetched = useCallback((fresh: Entry) => {
    setEntryModal(prev => {
      if (!prev || prev.entry.id !== fresh.id) return prev;
      return { ...prev, entry: fresh };
    });
  }, []);

  useOpenEntryModalRefetch(openModalEntryId, handleOpenEntryRefetched);

  const hasCachedFeedPages = Boolean(feedData?.pages?.length);
  const isInitialFeedLoading = feedLoading && !hasCachedFeedPages;
  // Infinite scrolling avoids an audience-wide count before showing a page.
  // Older endpoints may still supply an exact total.
  const totalEntryCount = useMemo(() => {
    const pages = feedData?.pages || [];
    for (const p of pages) {
      if (typeof p.total === 'number') return p.total;
    }
    return undefined;
  }, [feedData]);

  // Page-level error → upgrade the global system-bar notification with
  // a Retry handler that re-runs the feed query. Successful refetch
  // auto-clears the bar via the axios success interceptor.
  useEffect(() => {
    if (feedError) {
      notifyApiFailure(feedError, {
        context: 'loading your feed',
        onRetry: () => { void refetchFeed(); },
      });
    }
  }, [feedError, refetchFeed]);

  const typeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of allEntries) s.add(e.type);
    const arr = [...s].sort();
    return arr.length ? arr : [...BASE_ENTRY_TYPE_SLUGS];
  }, [allEntries]);

  // Workspace scope is enforced server-side via X-Integral-Scope on
  // /feed and /entries (see backend/app/api/feed.py + entries.py),
  // so we no longer re-filter by workspace here.
  //
  // Semantic / hybrid mode: when /api/retrieve returned results, narrow
  // the in-memory list to those entry IDs in the order returned by the
  // ranker. Tag/author/type filters still apply on top so the user can
  // refine a retrieval result. Graph mode keeps the existing in-memory
  // search behavior.
  const entries = useMemo(() => {
    let list: Entry[];
    if (semanticMode && retrievalResults.length > 0) {
      // Index by id to preserve ranker order.
      const byId = new Map(allEntries.map(e => [e.id, e]));
      list = retrievalIdOrder
        .map(id => byId.get(id))
        .filter((e): e is Entry => Boolean(e));
    } else {
      list = allEntries;
    }
    if (filterType) {
      list = list.filter(e => e.type === filterType);
    }
    if (filterTags.length) {
      list = list.filter(e => filterTags.every(id => e.tags?.some(t => t.id === id)));
    }
    if (filterAuthor) {
      list = list.filter(e => e.author_id === filterAuthor);
    }
    const useInMemorySearch =
      !semanticMode ||
      Boolean(retrievalError) ||
      (semanticMode &&
        retrievalResults.length === 0 &&
        feedSearch.trim().length > 0);
    if (useInMemorySearch) {
      const q = feedSearch.trim().toLowerCase();
      if (q) {
        list = list.filter(e => {
          const title = (e.title || '').toLowerCase();
          const body = (e.body || '').toLowerCase();
          const type = (e.type || '').toLowerCase();
          const trackTitle = (e.track?.title || '').toLowerCase();
          return (
            title.includes(q) ||
            body.includes(q) ||
            type.includes(q) ||
            trackTitle.includes(q)
          );
        });
      }
    }
    return list;
  }, [
    allEntries,
    filterType,
    filterTags,
    filterAuthor,
    feedSearch,
    semanticMode,
    retrievalError,
    retrievalIdOrder,
    retrievalResults.length,
  ]);

  useEffect(() => {
    setPageContext({
      pageKind: 'feed',
      visibleData: {
        entries: entries.map(e => ({
          id: e.id,
          title: e.title || undefined,
          status: e.status || undefined,
          entry_type: e.type || undefined,
        })),
      },
      metadata: {
        app_filter: appIdFromQuery || undefined,
        track_filter: filterTrack || undefined,
        type_filter: filterType || undefined,
        tag_filters: filterTags.length ? filterTags : undefined,
        author_filter: filterAuthor || undefined,
      },
    });
    return () => clearPageContext();
  }, [
    entries,
    appIdFromQuery,
    filterTrack,
    filterType,
    filterTags,
    filterAuthor,
    setPageContext,
    clearPageContext,
  ]);

  // Count of retrieval matches not yet in the in-memory cache —
  // surfaces as a hint so the user knows the page is showing a subset.
  const retrievalMissingCount = useMemo(() => {
    if (!semanticMode || retrievalResults.length === 0) return 0;
    const inMemoryIds = new Set(allEntries.map(e => e.id));
    let missing = 0;
    for (const id of retrievalIdSet) {
      if (!inMemoryIds.has(id)) missing += 1;
    }
    return missing;
  }, [semanticMode, retrievalResults.length, retrievalIdSet, allEntries]);

  // Prefer catalog labels so selected tags remain recognizable even
  // when their intersection has no matching rows.
  const activeTagLabels = useMemo(() => filterTags.map(id => ({
    id,
    label: workspaceTags.find(tag => tag.id === id)?.name?.trim()
      || allEntries.flatMap(entry => entry.tags ?? []).find(tag => tag.id === id)?.name?.trim()
      || 'Selected tag',
  })), [filterTags, workspaceTags, allEntries]);

  const activeAuthorLabel = useMemo(() => {
    if (!filterAuthor) return null;
    for (const e of allEntries) {
      if (e.author_id === filterAuthor) {
        return (
          e.author?.display_name?.trim() ||
          `Member ${filterAuthor.slice(-6)}`
        );
      }
    }
    return null;
  }, [allEntries, filterAuthor]);

  useEffect(() => {
    const el = feedLoadSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([first]) => {
        if (
          first?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError &&
          !(semanticMode && feedSearch.trim())
        ) {
          fetchNextPage();
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // ``entries.length`` is in the dep list so the effect re-runs when the
    // empty-state branch unmounts the sentinel and the list branch mounts
    // it (and vice versa) — without this, the observer is permanently
    // attached to a stale (or null) node and infinite scroll dies in
    // semantic mode where the initial render is often empty.
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, entries.length, semanticMode, feedSearch]);

  const invalidateFeedEntries = useCallback(() => {
    // Invalidate the entire ['feed'] prefix so Mission Control's
    // dashboardPreview cache refreshes alongside FeedPage's own
    // infinite-query cache (both derive from the same backend data).
    void invalidateFeedCaches(queryClient);
  }, [queryClient]);

  // Publish breadcrumbs to the TopBar.
  useSetCrumbs(
    appIdFromQuery && appName
      ? [
          { label: appName, to: `/apps/${appIdFromQuery}` },
          { label: 'Feed' },
        ]
      : [{ label: 'Feed' }]
  );

  useEffect(() => {
    let cancelled = false;
    appsApi
      .list()
      .then(list => {
        if (!cancelled)
          setApps(
            [...list].sort((a, b) =>
              (a.name || '').localeCompare(b.name || '', undefined, {
                sensitivity: 'base',
              })
            )
          );
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Workspace switch: drop filters that only make sense in the prior scope.
  const previousWorkspaceIdRef = useRef(workspaceId);
  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) return;
    previousWorkspaceIdRef.current = workspaceId;
    setFilterTrack('');
    setFilterType('');
    setFeedSearch('');
    resetRetrieval();
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('app');
        next.delete('tag');
        next.delete('author');
        return next;
      },
      { replace: true }
    );
  }, [workspaceId, resetRetrieval, setSearchParams]);

  const setAppFilter = useCallback(
    (appId: string) => {
      const next = new URLSearchParams(searchParams);
      if (appId) next.set('app', appId);
      else next.delete('app');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const clearAllFilters = useCallback(() => {
    setFeedSearch('');
    setFilterTrack('');
    setFilterType('');
    // Drop any ranker output too — otherwise the in-memory list would
    // still be narrowed to the previous semantic match set after the
    // user cleared the search box.
    resetRetrieval();
    const next = new URLSearchParams(searchParams);
    next.delete('app');
    next.delete('tag');
    next.delete('author');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, resetRetrieval]);

  // Empty search field → wipe ranker output so the in-memory list
  // falls back to the unfiltered feed. Mirrors the clearAll path for
  // the common case where the user just deletes the text by hand.
  useEffect(() => {
    if (!feedSearch.trim()) {
      resetRetrieval();
    }
  }, [feedSearch, resetRetrieval]);

  useEffect(() => {
    if (!appIdFromQuery) {
      setAppName(null);
      return;
    }
    let cancelled = false;
    appsApi
      .get(appIdFromQuery)
      .then(s => {
        if (!cancelled) setAppName(s.name || null);
      })
      .catch(() => {
        if (!cancelled) setAppName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appIdFromQuery]);

  useEffect(() => {
    setFilterTrack('');
  }, [appIdFromQuery]);

  // Stable handlers so the memoized EntryCards don't re-render on every feed
  // state change (search typing, modal open, infinite-scroll appends). Filter
  // toggles use functional updates so the callbacks need no changing deps.
  const handleEntryOpen = useCallback(
    (e: Entry, opts?: { focusComments?: boolean }) =>
      setEntryModal({ entry: e, focusComments: opts?.focusComments }),
    [],
  );
  const handleEntryEdit = useCallback(
    (e: Entry) => setEntryModal({ entry: e, initialEditMode: true }),
    [],
  );
  const handleTypeClick = useCallback(
    (slug: string) => setFilterType(prev => (prev === slug ? '' : slug)),
    [],
  );
  const handleTagClick = useCallback(
    (id: string) => setSearchParams(previous => withTagFilters(previous, toggleTagFilter(selectedTagIds(previous), id)), { replace: true }),
    [setSearchParams],
  );
  const handleAuthorClick = useCallback(
    (id: string) => setFilterAuthor(filterAuthor === id ? '' : id),
    [filterAuthor, setFilterAuthor],
  );

  const handleDelete = useCallback(
    (id: string) => {
      patchMatchingEntries(page => ({ ...page, entries: page.entries.filter(entry => entry.id !== id) }));
      // Optimistic: drop the entry from the cached pages so the row
      // disappears IMMEDIATELY — before EntryCard awaits the
      // backend (which on tagged entries currently takes ~5s).
      queryClient.setQueryData<InfiniteData<FeedEntriesPage>>(
        feedQueryKey,
        old => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(p => ({
              ...p,
              entries: p.entries.filter(e => e.id !== id),
            })),
          };
        }
      );
      // Previously this also called ``invalidateQueries(...)`` to
      // refetch the entire feed. That fired hundreds of ms of DB
      // IO on the backend (full page refetch of 1000+ entries) on
      // every delete — exactly the "lots of db io happening" the
      // user observed. Skip it: the local cache is already
      // consistent (one row removed) and the next natural refresh
      // (filter change, page nav, manual refresh) will pull a
      // fresh page anyway. EntryCard handles the rollback
      // (it invalidates on backend failure to restore the row).
    },
    [queryClient, feedQueryKey, patchMatchingEntries]
  );

  const handleUpdate = useCallback(
    (updated: Entry) => {
      patchMatchingEntries(page => ({ ...page, entries: page.entries.map(entry => entry.id === updated.id ? updated : entry) }));
      queryClient.setQueryData<InfiniteData<FeedEntriesPage>>(
        feedQueryKey,
        old => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(p => ({
              ...p,
              entries: p.entries.map(e =>
                e.id === updated.id ? updated : e
              ),
            })),
          };
        }
      );
    },
    [queryClient, feedQueryKey, patchMatchingEntries]
  );

  return (
    /* PageShell owns vertical rhythm; each PageSection re-applies
       the gutter + max-w-page cap so the full-bleed separator below
       can span the main column edge-to-edge. */
    <PageShell>
      <PageSection>
        <section className="min-w-0">
          {/* Editorial header — display title and a tight meta row. The
              meta row is small, single-line, sits beneath the title like
              a bibliographic note. No prose lede, no hairline divider. */}
          <header className="mb-8 md:mb-10">
            <PageHeading>
              {appIdFromQuery ? appName || 'App feed' : 'Feed'}
            </PageHeading>
            {/* Shared metadata scale, with separators that wrap alongside the facts. */}
            <PageMeta>
              <span>
                {totalEntryCount ?? entries.length}{' '}
                {(totalEntryCount ?? entries.length) === 1 ? 'entry' : 'entries'}
                {totalEntryCount === undefined && hasNextPage ? ' loaded' : ''}
              </span>
              {entries[0]?.created_at ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    Updated {formatShortRelativeTime(entries[0].created_at)} ago
                  </span>
                </>
              ) : null}
              {appIdFromQuery ? (
                <>
                  <span aria-hidden>·</span>
                  <Link
                    to={`/apps/${appIdFromQuery}`}
                    className="text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
                  >
                    {appName || 'this App'}
                  </Link>
                  <span aria-hidden>·</span>
                  <Link
                    to="/feed"
                    className="text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
                  >
                    See all activity
                  </Link>
                </>
              ) : null}
            </PageMeta>
          </header>
        </section>
      </PageSection>

      {/* Full-bleed section divider — spans the main column edge to
          edge (sidebar boundary → viewport right edge). */}
      <PageSection.Separator />

      <PageSection className={filterBar.sectionTop}>
        <section className="min-w-0">
          {/* Feed load errors surface through the global system-bar
              (axios interceptor → notifyApiFailure). We no longer render
              a duplicate page-level error banner here. */}

          {/* Action + filter row — search/filters left, primary create action right (better UX flow). */}
          <FilterActionRow>
            <div className="w-full max-w-xl min-w-[min(100%,18rem)]">
              <FeedFilterStrip
                appIdFromQuery={appIdFromQuery}
                setAppFilter={setAppFilter}
                apps={apps}
                appName={appName}
                filterTrack={filterTrack}
                setFilterTrack={setFilterTrack}
                tracks={navTracks}
                filterType={filterType}
                setFilterType={setFilterType}
                typeOptions={typeOptions}
                feedSearch={feedSearch}
                setFeedSearch={setFeedSearch}
                tagTracks={tracks}
                tags={workspaceTags.filter(tag => !appIdFromQuery || tag.app_id === appIdFromQuery || tracks.some(track => track.id === tag.track_id))}
                tagsError={tagsError}
                filterTags={filterTags}
                setFilterTags={setFilterTags}
                filterAuthor={filterAuthor}
                setFilterAuthor={setFilterAuthor}
                onClearAll={clearAllFilters}
                retrievalActive={retrievalMode !== 'graph'}
                onRetrievalSearch={runRetrieval}
                retrievalLoading={retrievalLoading}
                retrievalError={retrievalError}
              />
            </div>
            {creatableTracks.length > 0 ? (
              <EntryComposer
                tracks={creatableTracks}
                tracksListLoading={feedLoading || tracksLoading}
                onCreated={invalidateFeedEntries}
              />
            ) : null}
          </FilterActionRow>

          {isInitialFeedLoading || retrievalLoading || (retrievalResults.length > 0 && matchesLoading && entries.length === 0) ? (
            <div className="mt-8 space-y-10">
              {[1, 2, 3, 4].map(i => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="mt-12">
              <EmptyState
                surface="card"
                icon={
                  <IconWell size="lg" aria-hidden>
                    <Inbox size={22} strokeWidth={LINE_ICON_STROKE} />
                  </IconWell>
                }
                title={
                  semanticMode && feedSearch.trim()
                    ? 'No matches'
                    : feedSearch.trim() && allEntries.length
                      ? 'No matching entries'
                      : 'Nothing here yet'
                }
                description={
                  semanticMode && feedSearch.trim()
                    ? `No entries matched "${feedSearch.trim()}". Try different words, or change the search mode in Settings → Search.`
                    : feedSearch.trim() && allEntries.length
                      ? 'Try different words or clear the search box.'
                      : tracks.length === 0
                        ? 'Create or join a track to start sharing updates here.'
                        : 'Share an update to start the conversation.'
                }
                action={
                  !feedSearch.trim() ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={
                        <MessageSquare
                          size={14}
                          strokeWidth={LINE_ICON_STROKE}
                        />
                      }
                      onClick={() => {
                        if (dock) {
                          dock.openDock({ view: 'chat' });
                          return;
                        }
                        navigate('/agent');
                      }}
                    >
                      Ask Integral for help
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-8">
              {/* Missing ranked records use one bounded read with explicit retry. */}
              {semanticMode && retrievalMissingCount > 0 ? (
                <div className="mb-3 text-xs text-[var(--text-subtle)]">
                  Showing {entries.length} of {retrievalResults.length} {retrievalResults.length === 1 ? 'match' : 'matches'}.{' '}
                  <span className="text-[var(--text-muted)]">
                    {matchesLoading
                      ? 'Loading matching entries…'
                      : matchesError
                        ? 'Some matches could not be loaded.'
                        : 'Some matches are no longer available.'}
                    {matchesError && <Button variant="ghost" size="sm" onClick={() => { void refetchMatches(); }}>Retry</Button>}
                  </span>
                </div>
              ) : null}
              {/* Individual removable selections complement the tag menu. */}
              {filterTags.length > 0 || filterAuthor ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-subtle)]">
                  <span>Filtered by</span>
                  {filterAuthor && activeAuthorLabel ? (
                    <button
                      type="button"
                      onClick={() => setFilterAuthor('')}
                      className="
                        inline-flex items-center gap-1
                        rounded-full px-3 py-1
                        bg-[var(--panel)] border border-[var(--panel-border)]
                        text-[var(--text)]
                        hover:border-[var(--text-subtle)]
                        transition-colors duration-fast
                      "
                      aria-label={`Clear author filter (${activeAuthorLabel})`}
                    >
                      <span>{activeAuthorLabel}</span>
                      <span aria-hidden className="text-[var(--text-subtle)]">×</span>
                    </button>
                  ) : null}
                  {activeTagLabels.map(({ id, label }) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setFilterTags(filterTags.filter(tag => tag !== id))}
                      className="
                        inline-flex items-center gap-1
                        rounded-full px-3 py-1
                        bg-[var(--panel)] border border-[var(--panel-border)]
                        text-[var(--text)]
                        hover:border-[var(--text-subtle)]
                        transition-colors duration-fast
                      "
                      aria-label={`Clear tag filter (${label})`}
                    >
                      <span>#{label}</span>
                      <span aria-hidden className="text-[var(--text-subtle)]">×</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {/* Background refresh failures route through the global
                  system-bar; the cached posts below stay visible. */}
              {entries.map(entry => (
                <div key={entry.id} className="cv-auto">
                  <EntryCard
                    entry={entry}
                    showTrackChip
                    onOpen={handleEntryOpen}
                    onDelete={handleDelete}
                    onEdit={handleEntryEdit}
                    onTypeClick={handleTypeClick}
                    activeTypeFilter={filterType}
                    onTagClick={handleTagClick}
                    activeTagFilters={filterTags}
                    onAuthorClick={handleAuthorClick}
                    activeAuthorFilter={filterAuthor}
                  />
                </div>
              ))}
              {isFetchingNextPage ? (
                <div className="flex justify-center py-4 text-[var(--text-muted)]">
                  <Loader2
                    size={22}
                    strokeWidth={LINE_ICON_STROKE}
                    className="animate-spin"
                    aria-label="Loading more entries"
                  />
                </div>
              ) : null}
              <div
                ref={feedLoadSentinelRef}
                className="h-px w-full shrink-0"
                aria-hidden
              />
            </div>
          )}
        </section>
      </PageSection>

      {entryModal && (
        <EntryDetail
          key={entryModal.entry.id}
          entry={entryModal.entry}
          initialFocusComments={entryModal.focusComments}
          initialEditMode={entryModal.initialEditMode}
          onClose={() => setEntryModal(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </PageShell>
  );
}
