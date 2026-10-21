import { useDeployment } from '../hooks/useDeployment';
import type { EntryCreateInput } from '../views/types';
import { entriesMatchingTags } from '../components/tracks/TrackTagFilters';
/* patch:kanban-hire-intercept */
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { useParams, Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import {
  Sparkles,
} from 'lucide-react';
import { operationalModelsApi } from '../api/operationalModels';
import { sharingApi } from '../api/sharing';
import { DeriveLibraryPackageModal } from '../components/library/DeriveLibraryPackageModal';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData
} from '@tanstack/react-query';
import { tracksApi, entryTypesApi, trackViewsApi, entriesApi } from '../api';
import {
  invalidateFeedCaches,
  invalidateWorkspaceListCaches,
  entryTypesForTrackQueryKey,
  trackAttachedOperationalModelQueryKey,
  viewsForTrackQueryKey
} from '../queryKeys';
import { errorMessageFromAxios } from '../api/helpers';
import { resolveDocumentTemplatesTrackRedirect } from '../features/documents/documentTemplatesRouting';
import { pathAfterTrackDelete } from '../utils/pathAfterTrackDelete';
import type { TrackDetailBundle, TrackEntriesPage } from '../api/tracks';
import {
  EntryComposeModal,
  type EntryComposeSeed
} from '../components/entries/EntryComposer';
import { useRetrieve } from '../hooks/useRetrieve';
import { useOpenEntryModalRefetch } from '../hooks/useOpenEntryModalRefetch';
import { EntryDetail } from '../components/entries/EntryDetail';
import { diffCustomFields } from '../components/entries/entryFormCustomFields';
import { TrackModal } from '../components/tracks/TrackModal';
import { TrackShareModal } from '../components/tracks/TrackShareModal';
import {
  Button,
  CardSkeleton,
  EmptyState,
  PageShell,
  PageSection,
  Skeleton,
  IconWell,
  LINE_ICON_STROKE,
  filterBar,
} from '../components/ui';
import type { ViewTabOption } from '../components/ui';
import { savedViewTabs } from '../utils/savedViewTabs';
import {
  mergeDedupedTrackEntryPages,
  useTrackDetailRightRail,
  TrackDetailHeader,
  TrackDetailViewChrome,
  TrackDetailMainColumn,
  TrackDetailRightRail,
  TrackCollaboratorsModal,
} from '../components/tracks/detail';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useScope } from '../context/ScopeContext';
import { useWorkspaceCrumbPrefix } from '../hooks/useWorkspaceCrumbPrefix';
import { buildTrackBreadcrumbs } from '../utils/buildTrackBreadcrumbs';
import { useRecents } from '../hooks/useRecents';
import { getWidget } from '../views';
import {
  entryTypeMatchesSlug,
  resolveKanbanCreateCustomFieldFallback,
  resolveKanbanGroupBy,
  resolveKanbanWorkflowEnumLabelsForTrack,
  resolveKanbanWriteFieldKey,
  shouldRouteKanbanQuickAddToCompose,
  slugifyKanbanColumnKey,
  slugMatchesAllowedEntryTypes
} from '../components/views/kanbanColumnUtils';
import {
  BASE_ENTRY_TYPE_SLUGS,
  dedupeCollaborators,
  isSamePrincipal
} from '../utils';
import {
  getDisallowedCustomFieldKeys,
  getMissingRequiredFields
} from '../utils/entryMetaFields';
import { useTrackPermissions } from '../utils/entryEditRights';
import { entryPagePath } from '../utils/resourcePaths';
import { useAuth } from '../context/AuthContext';
import { useChatPageFocus } from '../context/ChatPageFocusContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import type {
  OperationalModelFieldSpec,
  Entry,
  EntryTypeNode,
  SavedView,
  Track,
  User
} from '../types';
import { slugTagProfileKey } from '../utils/tagProfile';
import { Text } from '../ui';
import { isViewDesignerEnabled, ViewDesignerShell } from '../features/view-designer';

export function TrackDetailPage() {
  const { collaboration } = useDeployment();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryIdFromQuery = searchParams.get('entry')?.trim() || '';
  const requestedViewId = searchParams.get('view_id')?.trim() || '';
  const dashboardFiltersParam = searchParams.get('dashboard_filters');
  const dashboardFilters = useMemo(() => {
    if (!dashboardFiltersParam) return undefined;
    try {
      const parsed: unknown = JSON.parse(dashboardFiltersParam);
      return Array.isArray(parsed) && parsed.length <= 8 ? parsed as Array<{ field: string; op: string; value: unknown }> : undefined;
    } catch {
      return undefined;
    }
  }, [dashboardFiltersParam]);
  const { user } = useAuth();
  const { visit: visitRecent } = useRecents();
  useEffect(() => {
    if (id) visitRecent('track', id);
  }, [id, visitRecent]);
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { setPageContext, clearPageContext } = useChatPageFocus();
  const queryClient = useQueryClient();
  const trackEntriesSentinelRef = useRef<HTMLDivElement>(null);
  const viewInitFromMetaRef = useRef(false);
  const deeplinkReqIdRef = useRef(0);

  const [track, setTrack] = useState<Track | null>(null);
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<{ trackId: string; viewId: string } | null>(null);
  const [entryModal, setEntryModal] = useState<{
    entry: Entry;
    focusComments?: boolean;
    initialEditMode?: boolean;
  } | null>(null);
  const [composeModal, setComposeModal] = useState<EntryComposeSeed | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [collaboratorsModalOpen, setCollaboratorsModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // Plan 08-04 — derive-library-package modal for SET-05 (action mounts in the
  // header action cluster below). The modal calls
  // operationalModelsApi.deriveFromTrack on submit and invalidates the library
  // query so the new package appears under Settings → Library on next visit.
  const [deriveModalOpen, setDeriveModalOpen] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  useEffect(() => setFilterTags([]), [id]);
  const [trackSearch, setTrackSearch] = useState('');
  // Right rail collapsed by default. Two mutually exclusive modes:
  //   'activity' — ChangeEvent feed for this track
  //   'config'   — TrackConfigPanel (entry types / tags / views / schema)
  // Mutually exclusive keeps the configuration rail singular and predictable.
  const [rightRailMode, setRightRailMode] = useState<
    null | 'activity' | 'config'
  >(null);
  const trackActivityOpen = rightRailMode === 'activity';
  const trackConfigOpen = rightRailMode === 'config';
  const rightRailOpen = rightRailMode !== null;
  const setTrackActivityOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setRightRailMode(prev => {
      const cur = prev === 'activity';
      const nextVal = typeof next === 'function' ? next(cur) : next;
      return nextVal ? 'activity' : prev === 'activity' ? null : prev;
    });
  const setTrackConfigOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setRightRailMode(prev => {
      const cur = prev === 'config';
      const nextVal = typeof next === 'function' ? next(cur) : next;
      return nextVal ? 'config' : prev === 'config' ? null : prev;
    });

  const {
    rightRailWidth,
    asideMaxH,
    asideRef,
    handleRailPointerDown,
    handleRailPointerMove,
    handleRailPointerUp,
  } = useTrackDetailRightRail({
    rightRailOpen,
    trackActivityOpen,
    trackConfigOpen,
  });

  // Retrieval — Track-detail search is SCOPED TO THIS TRACK (Feed
  // search is global; see FeedPage). Mode is read from global Settings
  // (Settings → Search → Mode); ``semantic`` is the v1.1 default and
  // surfaces matches across this track by similarity; ``hybrid``
  // RRF-fuses vector + traversal; ``graph`` keeps the in-memory
  // substring filter on the loaded entries.
  const {
    mode: retrievalMode,
    results: retrievalResults,
    loading: retrievalLoading,
    error: retrievalError,
    run: runRetrieval,
    reset: resetRetrieval
  } = useRetrieve({ scope: id ? `track:${id}` : undefined });
  const feedFallbackView = useMemo<SavedView | null>(
    () =>
      id
        ? {
            id: '',
            name: 'Feed',
            type: 'feed',
            track_id: id,
            is_default: true,
            config: { view_type: 'feed' }
          }
        : null,
    [id]
  );

  const closeEntryModal = useCallback(() => {
    // Invalidate an outstanding deep-link read before dismissing. A late
    // result must not recreate the sheet after its URL has been cleared.
    deeplinkReqIdRef.current += 1;
    setEntryModal(null);
    setSearchParams(
      prev => {
        const n = new URLSearchParams(prev);
        n.delete('entry');
        n.delete('from_entry');
        n.delete('from_track');
        n.delete('from_title');
        return n;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const openEntryModal = useCallback(
    (
      entry: Entry,
      opts?: { focusComments?: boolean; initialEditMode?: boolean }
    ) => {
      setEntryModal({
        entry,
        focusComments: opts?.focusComments,
        initialEditMode: opts?.initialEditMode
      });
      setSearchParams(
        prev => {
          const n = new URLSearchParams(prev);
          n.set('entry', entry.id);
          // In-track opens are not relation drill-ins — drop parent context.
          n.delete('from_entry');
          n.delete('from_track');
          n.delete('from_title');
          return n;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const prevTrackRouteIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only reset local track state when the route track id actually changes.
    // Do NOT call closeEntryModal here — it races with openEntryModal when
    // ?entry= is set on the same track, and it breaks cross-track deeplinks
    // that navigate to /tracks/{id}?entry={id}. Relation links dismiss the
    // dialog via RelationValue.onNavigate before routing away.
    if (prevTrackRouteIdRef.current === id) return;
    prevTrackRouteIdRef.current = id;
    setTrack(null);
    viewInitFromMetaRef.current = false;
  }, [id]);

  const trackDetailQuery = useQuery({
    queryKey: ['track', id, 'detail'],
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) throw new Error('Missing track id');
      return tracksApi.getDetail(id);
    }
  });

  const { scope, setScope, workspaces } = useScope();
  const trackWorkspaceAccentColor = workspaces.find(w => w.id === (
    trackDetailQuery.data?.track.app?.workspace_id || trackDetailQuery.data?.track.workspace_id
  ))?.accent_color;
  const detailTrackWorkspaceId =
    trackDetailQuery.data?.track.app?.workspace_id ||
    trackDetailQuery.data?.track.workspace_id ||
    null;

  // Resolve the active workspace from the Track detail response before any
  // workspace-scoped follow-up queries (notably entry-type hydration) run.
  // Track links can come from global surfaces while another workspace is
  // active, so starting the entry query from the route id alone can send those
  // requests with a stale X-Integral-Scope header.
  useEffect(() => {
    if (
      detailTrackWorkspaceId &&
      scope?.workspaceId !== detailTrackWorkspaceId
    ) {
      setScope({ workspaceId: detailTrackWorkspaceId });
    }
  }, [detailTrackWorkspaceId, scope?.workspaceId, setScope]);

  useEffect(() => {
    if (!id || !trackDetailQuery.data) return;
    const d = trackDetailQuery.data;
    const trackWithCollab = {
      ...d.track,
      collaborators: d.collaborators as User[],
      collaborator_effective_total: d.collaborator_effective_total,
      collaborator_inherited_truncated: d.collaborator_inherited_truncated,
      collaborator_visibility_grant: d.collaborator_visibility_grant,
      caller_role: d.caller_role ?? null
    };
    setTrack(trackWithCollab);
    queryClient.setQueryData(['track', id, 'meta'], { track: trackWithCollab });
    queryClient.setQueryData(entryTypesForTrackQueryKey(id), d.entry_types);
    queryClient.setQueryData(viewsForTrackQueryKey(id), d.views as SavedView[]);
  }, [id, queryClient, trackDetailQuery.data]);

  const documentTemplatesRedirect = useMemo(
    () =>
      track ? resolveDocumentTemplatesTrackRedirect(track, searchParams) : null,
    [track, searchParams],
  );

  // Track + collaborators (separate from entry types / views so that
  // schema mutations from TrackConfigPanel invalidate ONLY the
  // canonical entry-type / view caches without forcing a full track
  // refetch, and so that mutating those caches propagates into the
  // page automatically — no bespoke ['track', id, 'meta'] bundle.
  const fetchTrackMeta = useCallback(async () => {
    if (!id) throw new Error('Missing track id');
    try {
      const [t, collabResp] = await Promise.all([
        tracksApi.get(id),
        tracksApi.getCollaboratorsDetailed(id).catch(() => ({
          collaborators: [] as unknown[],
          effective_total: 0,
          inherited_truncated: false,
          visibility_grant: null as string | null,
          caller_role: null as string | null
        })),
      ]);
      return {
        track: {
          ...t,
          collaborators: collabResp.collaborators as User[],
          collaborator_effective_total: collabResp.effective_total,
          collaborator_inherited_truncated: collabResp.inherited_truncated,
          collaborator_visibility_grant: collabResp.visibility_grant,
          caller_role: collabResp.caller_role ?? null
        }
      };
    } catch (err: unknown) {
      showToast(errorMessageFromAxios(err, 'Failed to load track'), 'error');
      throw err;
    }
  }, [id, showToast]);

  const trackMetaQuery = useQuery({
    queryKey: ['track', id, 'meta'],
    enabled: Boolean(id && trackDetailQuery.data),
    queryFn: fetchTrackMeta,
    // getDetail seeds this cache. Keep the bootstrap result fresh so opening
    // a track does not immediately repeat the track + collaborator request.
    staleTime: 30_000,
  });

  const publicShareCallerRole = String(
    trackDetailQuery.data?.caller_role || ''
  ).toLowerCase();
  const canFetchPublicShare =
    collaboration && (publicShareCallerRole === 'owner' || publicShareCallerRole === 'admin');

  const publicShareQuery = useQuery({
    queryKey: ['track', id, 'public-share-settings'],
    enabled: Boolean(id && trackDetailQuery.data && canFetchPublicShare),
    queryFn: () => sharingApi.getPublicTrackSettings(id!),
    retry: false,
  });

  const trackWatchersQuery = useQuery({
    queryKey: ['track', id, 'watchers'],
    enabled: Boolean(id && trackDetailQuery.data),
    queryFn: () => tracksApi.getWatchers(id!)
  });

  // Canonical entry types — same query key SchemaSection / EntryFormExpanded
  // / EntryCard read from. Schema edits invalidate this key, and this
  // page re-renders the composer + tab strip with the fresh slugs.
  const entryTypesQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(id ?? ''),
    enabled: Boolean(id && trackDetailQuery.data),
    queryFn: () => entryTypesApi.list({ track_id: id! }).catch(() => []),
    // The detail bundle already populated this query key.
    staleTime: 30_000,
  });

  // Stable wrappers so memoized entry cards/rows don't re-render on every parent
  // state change (search typing, modal open, infinite-scroll appends).
  const handleEntryOpen = useCallback(
    (entry: Entry, opts?: { focusComments?: boolean }) => {
      // Opt-in per entry type (form_schema.open_as_page) to navigate to the
      // dedicated full page instead of the default modal overlay.
      const entryTypes = (entryTypesQuery.data ?? []) as EntryTypeNode[];
      const matchingType = entryTypes.find(et =>
        entryTypeMatchesSlug(et.name || '', entry.type || '')
      );
      if (matchingType?.form_schema?.open_as_page) {
        navigate(entryPagePath(entry.id));
        return;
      }
      openEntryModal(entry, { focusComments: opts?.focusComments });
    },
    [openEntryModal, entryTypesQuery.data, navigate]
  );
  const handleEntryEdit = useCallback(
    (entry: Entry) => openEntryModal(entry, { initialEditMode: true }),
    [openEntryModal]
  );

  // Canonical saved views — TrackConfigPanel mutates this key when the
  // owner adds / removes / re-sorts / re-defaults views.
  const viewsQuery = useQuery({
    queryKey: viewsForTrackQueryKey(id ?? ''),
    enabled: Boolean(id && trackDetailQuery.data),
    queryFn: () => trackViewsApi.list(id!).catch(() => [] as SavedView[]),
    // Avoid a second views query immediately after the detail bundle.
    staleTime: 30_000,
  });

  useEffect(() => {
    const data = trackMetaQuery.data;
    if (!data) return;
    setTrack(data.track);
  }, [trackMetaQuery.data]);

  // Initial-view selection runs once per track id, AFTER both the track
  // (for default_view preference) and the views list (for the candidate
  // set) have resolved at least once. Subsequent view mutations don't
  // re-trigger this (viewInitFromMetaRef guards) — they just refresh
  // the cache, which the tab strip reads live.
  useEffect(() => {
    const t = trackMetaQuery.data?.track;
    const typedViews = viewsQuery.data;
    if (!t || !typedViews) return;
    if (viewInitFromMetaRef.current) return;
    viewInitFromMetaRef.current = true;
    const defaultViewKey =
      t.operational_model_defaults?.default_view?.trim() || '';
    const defaultViewKeySlug = defaultViewKey
      ? slugTagProfileKey(defaultViewKey)
      : '';
    // Initial-view candidates exclude hidden views (disabled by config,
    // must never auto-select) and `scope: 'entry'` view types (action_bar,
    // summary_tiles, etc. — meaningless with no specific entry to bind to;
    // see the `savedViews` filter above for the full rationale).
    const visibleTypedViews = typedViews.filter(
      v => !v.hidden && getWidget(v.type)?.scope !== 'entry'
    );
    let defaultView: SavedView | null = visibleTypedViews.find(v => v.id === requestedViewId) || null;
    if (!defaultView && defaultViewKeySlug) {
      defaultView =
        visibleTypedViews.find(v => {
          const raw = String(v.config?._manifest_view_key || '').trim();
          return raw && slugTagProfileKey(raw) === defaultViewKeySlug;
        }) || null;
    }
    if (!defaultView) {
      defaultView =
        visibleTypedViews.find(v => v.is_default) ||
        visibleTypedViews[0] ||
        feedFallbackView;
    }
    if (defaultView) {
      setActiveView(defaultView);
    }
  }, [trackMetaQuery.data, viewsQuery.data, feedFallbackView, requestedViewId]);

  // A tool may select another saved view without leaving this collection.
  useEffect(() => {
    if (!requestedViewId) return;
    const requested = viewsQuery.data?.find(v => v.id === requestedViewId && !v.hidden && getWidget(v.type)?.scope !== 'entry');
    if (requested) setActiveView(requested);
  }, [requestedViewId, viewsQuery.data]);

  // Re-route activeView if the user hides it from the config panel — pick
  // up the latest copy from cache and swap to a visible default if hidden.
  // Also merge rename/config edits from the shared views cache (e.g.
  // ViewSettingsModal) so activeView stays in sync with the tab strip.
  useEffect(() => {
    if (!activeView?.id) return;
    const latest = viewsQuery.data?.find(v => v.id === activeView.id);
    if (!latest) return;
    if (latest.hidden) {
      const next =
        viewsQuery.data?.find(v => v.is_default && !v.hidden) ||
        viewsQuery.data?.find(v => !v.hidden) ||
        feedFallbackView;
      if (next) setActiveView(next);
      return;
    }
    if (
      latest.updated_at !== activeView.updated_at ||
      latest.name !== activeView.name
    ) {
      setActiveView(latest);
    }
  }, [
    viewsQuery.data,
    activeView?.id,
    activeView?.updated_at,
    activeView?.name,
    feedFallbackView,
  ]);

  const {
    data: entriesData,
    error: entriesError,
    isPending: entriesPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchEntries
  } = useInfiniteQuery({
    queryKey: ['track', id, 'entries', dashboardFiltersParam ?? activeView?.id],
    enabled: Boolean(
      id &&
      trackDetailQuery.data &&
      (!detailTrackWorkspaceId || scope?.workspaceId === detailTrackWorkspaceId)
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!id) throw new Error('Missing track id');
      return tracksApi.getEntriesPage(id, {
        ...(dashboardFilters ? { dashboard_filters: JSON.stringify(dashboardFilters) } : activeView?.id ? { view_id: activeView.id } : {}),
        ...(pageParam ? { cursor: pageParam } : {})
      });
    },
    getNextPageParam: last =>
      last.hasMore && last.nextCursor ? last.nextCursor : undefined
  });

  const allSavedViews = useMemo(
    () => (viewsQuery.data ?? []) as SavedView[],
    [viewsQuery.data],
  );
  // Tab strip + active-view selection use ONLY non-hidden views. Hidden
  // views remain in `allSavedViews` so TrackConfigPanel (same query cache)
  // can list + re-enable them.
  const savedViews = useMemo(
    () =>
      allSavedViews
        .filter(v => {
          const manifestKey = String(v.config?._manifest_view_key || '').trim();
          // Pay Run Workflow is intentionally embedded in the Pay Run
          // overview. Keep the legacy standalone view available to admins
          // for configuration, but never expose it as a duplicate tab even
          // if an older API payload has not carried the hidden flag yet.
          if (manifestKey === 'pay_run_workflow') return false;
          return !v.hidden && getWidget(v.type)?.scope !== 'entry';
        })
        .sort((a, b) => {
          const ao = typeof a.config?.order === 'number' ? a.config.order : Number.MAX_SAFE_INTEGER;
          const bo = typeof b.config?.order === 'number' ? b.config.order : Number.MAX_SAFE_INTEGER;
          return ao - bo || a.name.localeCompare(b.name);
        }),
    [allSavedViews]
  );
  const entryTypeSlugs = useMemo<string[]>(() => {
    const list = entryTypesQuery.data ?? [];
    const slugs = (list as { name?: string }[])
      .map(x => slugifyKanbanColumnKey(x.name || ''))
      .filter(Boolean);
    return slugs.length ? [...new Set(slugs)] : [...BASE_ENTRY_TYPE_SLUGS];
  }, [entryTypesQuery.data]);

  // Union of field specs across every active entry type on this track —
  // widgets (table, kanban, composable list/grid) use these to identify
  // relation-typed columns and resolve ids to labels via RelationValue.
  // First occurrence by ``key`` wins so we keep the declaration order
  // EntryComposer / EntryDetail already follow.
  const trackEntryTypeFields = useMemo<OperationalModelFieldSpec[]>(() => {
    const seen = new Map<string, OperationalModelFieldSpec>();
    const list = (entryTypesQuery.data ?? []) as EntryTypeNode[];
    for (const et of list) {
      const fields = (et.form_schema?.fields ?? []) as OperationalModelFieldSpec[];
      for (const f of fields) {
        if (f && f.key && !seen.has(f.key)) seen.set(f.key, f);
      }
    }
    return Array.from(seen.values());
  }, [entryTypesQuery.data]);

  // Different names/configurations represent different user-defined views,
  // including extensions sharing one renderer and entry-type slice.
  const dedupedTabViews = useMemo(
    () => savedViewTabs(savedViews), [savedViews],
  );

  const viewTabOptions = useMemo<ViewTabOption[]>(
    () =>
      dedupedTabViews.map(v => {
        const reg = getWidget(v.type);
        const Icon = reg?.meta.icon;
        const label = v.name || reg?.meta.label || v.type;
        return {
          value: v.id,
          label,
          icon: Icon ? <Icon size={14} /> : undefined,
          title: `${label} (${reg?.meta.label || v.type})`,
        };
      }),
    [dedupedTabViews]
  );

  /** Pages view (`view_type` alias: `wiki`). */
  const isPagesView = activeView?.type === 'wiki';

  const allEntries = useMemo(
    () => mergeDedupedTrackEntryPages(entriesData?.pages ?? []),
    [entriesData]
  );
  const openModalEntryId = entryModal?.entry.id;
  const openModalEntryIdRef = useRef(openModalEntryId);
  openModalEntryIdRef.current = openModalEntryId;

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

  useEffect(() => {
    if (!id) return;
    if (!entryIdFromQuery) {
      setEntryModal(null);
      return;
    }
    // openEntryModal (card click) already set the modal — avoid a refetch
    // that may navigate away when list cache track_id differs from URL id.
    if (openModalEntryIdRef.current === entryIdFromQuery) {
      return;
    }

    const myReq = ++deeplinkReqIdRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const entry = await entriesApi.get(entryIdFromQuery);
        if (cancelled || myReq !== deeplinkReqIdRef.current) return;
        if (entry.track_id !== id) {
          navigate(
            `/tracks/${entry.track_id}?entry=${encodeURIComponent(entryIdFromQuery)}`,
            { replace: true }
          );
          return;
        }
        setEntryModal({ entry });
      } catch {
        if (cancelled || myReq !== deeplinkReqIdRef.current) return;
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
  }, [
    id,
    entryIdFromQuery,
    navigate,
    setSearchParams,
    showToast,
  ]);

  const entriesTotal =
    entriesData?.pages?.[0]?.total ?? allEntries.length;

  const loadError =
    trackDetailQuery.isError && trackDetailQuery.error
      ? errorMessageFromAxios(trackDetailQuery.error, 'Failed to load track')
      : null;

  const entriesListError =
    entriesError && !trackDetailQuery.isError
      ? errorMessageFromAxios(entriesError, 'Could not load entries')
      : null;

  /** Re-fetch track + collaborator metadata and push into local state + cache.

  Uses ``fetchQuery`` (not ``invalidateQueries`` alone) so collaborator
  mutations refresh immediately even when ``trackMetaQuery`` is disabled
  after the initial ``trackDetailQuery`` bundle load. ``staleTime: 0``
  overrides the global 30s default so a just-mutated collaborator list
  is never served from cache. */
  const invalidateTrackMeta = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: ['track', id, 'meta'] });
    await queryClient.invalidateQueries({ queryKey: ['track', id, 'permissions'] });
    await queryClient.invalidateQueries({ queryKey: ['track', id, 'edit-rights'] });
    const meta = await queryClient.fetchQuery({
      queryKey: ['track', id, 'meta'],
      queryFn: fetchTrackMeta,
      staleTime: 0
    });
    setTrack({ ...meta.track, collaborators: [...(meta.track.collaborators ?? [])] });
    queryClient.setQueryData(
      ['track', id, 'detail'],
      (old: TrackDetailBundle | undefined) =>
        old
          ? {
              ...old,
              collaborators: meta.track.collaborators ?? [],
              collaborator_effective_total:
                meta.track.collaborator_effective_total ?? 0,
              collaborator_inherited_truncated:
                meta.track.collaborator_inherited_truncated ?? false,
              collaborator_visibility_grant:
                meta.track.collaborator_visibility_grant ?? null,
              caller_role: meta.track.caller_role ?? null
            }
          : old,
    );
  }, [id, queryClient, fetchTrackMeta]);

  const invalidateTrackEntries = useCallback(() => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: ['track', id, 'entries'] });
    // Mission Control's dashboardPreview cache derives from the same
    // backend entries — keep it in step so the cross-workspace tallies
    // (entries-today, active-tracks, last-activity) update when the
    // user adds or deletes a track entry.
    void invalidateFeedCaches(queryClient);
  }, [id, queryClient]);

  useEffect(() => {
    const el = trackEntriesSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([first]) => {
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const metaLoading = trackDetailQuery.isPending;
  const loadedEntryPageCount =
    entriesData == null ? 0 : entriesData.pages.length;
  const entriesBootstrapping =
    Boolean(id) && entriesPending && loadedEntryPageCount === 0;
  const loading = metaLoading;

  // Semantic / hybrid mode replaces the in-memory list with ranker-
  // ordered results from /api/retrieve. Graph mode keeps the existing
  // in-memory search behavior. Type filter still composes on top so
  // the user can refine a retrieval result by entry type.
  const semanticMode =
    retrievalMode === 'semantic' || retrievalMode === 'hybrid';
  const retrievalIdOrder = useMemo(
    () => retrievalResults.map(r => r.entry_id),
    [retrievalResults]
  );

  const filteredEntries = useMemo(() => {
    let list: Entry[];
    if (semanticMode && retrievalResults.length > 0) {
      const byId = new Map(allEntries.map(e => [e.id, e]));
      list = retrievalIdOrder
        .map(eid => byId.get(eid))
        .filter((e): e is Entry => Boolean(e));
    } else {
      list = allEntries;
    }
    if (filterType) {
      list = list.filter(e => e.type === filterType);
    }
    const viewTypeKeys = dashboardFilters ? undefined : activeView?.entry_type_keys;
    if (viewTypeKeys?.length) {
      const allowed = new Set(viewTypeKeys.map(k => k.toLowerCase().trim()));
      list = list.filter(e => allowed.has((e.type || '').toLowerCase().trim()));
    }
    const useInMemorySearch =
      !semanticMode ||
      Boolean(retrievalError) ||
      (semanticMode &&
        retrievalResults.length === 0 &&
        trackSearch.trim().length > 0);
    if (useInMemorySearch) {
      const q = trackSearch.trim().toLowerCase();
      if (q) {
        list = list.filter(e => {
          const title = (e.title || '').toLowerCase();
          const body = (e.body || '').toLowerCase();
          const type = (e.type || '').toLowerCase();
          return title.includes(q) || body.includes(q) || type.includes(q);
        });
      }
    }
    return entriesMatchingTags(list, isPagesView ? [] : filterTags);
  }, [
    allEntries,
    filterTags,
    isPagesView,
    filterType,
    trackSearch,
    semanticMode,
    retrievalError,
    retrievalIdOrder,
    retrievalResults.length,
    activeView?.entry_type_keys,
    dashboardFilters,
  ]);

  useEffect(() => {
    if (!id) {
      clearPageContext();
      return;
    }
    setPageContext({
      pageKind: 'track_detail',
      focusedTrackId: id,
      focusedViewId: activeView?.id ?? null,
      focusedAppId: track?.app?.id ?? null,
      visibleData: {
        entries: filteredEntries.map(e => ({
          id: e.id,
          title: e.title || undefined,
          status: e.status || undefined,
          entry_type: e.type || undefined
        }))
      },
      metadata: {
        view_name: activeView?.name,
        view_type: activeView?.type,
        group_by: typeof activeView?.config?.group_by === 'string' ? activeView.config.group_by : undefined,
        entry_type_filter: filterType || undefined,
        track_title: track?.title
      }
    });
    return () => clearPageContext();
  }, [
    id,
    activeView?.id,
    activeView?.name,
    activeView?.type,
    activeView?.config,
    track?.app?.id,
    filteredEntries,
    filterType,
    track?.title,
    setPageContext,
    clearPageContext,
  ]);

  // Surface count of retrieval matches not yet in cache so the user
  // knows the visible list is a subset of the full ranker output.
  const retrievalMissingCount = useMemo(() => {
    if (!semanticMode || retrievalResults.length === 0) return 0;
    const inMemoryIds = new Set(allEntries.map(e => e.id));
    let missing = 0;
    for (const r of retrievalResults) {
      if (!inMemoryIds.has(r.entry_id)) missing += 1;
    }
    return missing;
  }, [semanticMode, retrievalResults, allEntries]);

  // Semantic-mode auto-loader — when the ranker returned IDs the track-
  // entries cache has not yet caught up to, eagerly pull more pages until
  // every retrieval match is materialized or the track is exhausted.
  // Without this, "Showing X of N — scroll to load more" is a lie: the
  // missing IDs may sit dozens of pages deep and the user has to scroll
  // manually past every page. ``top_n`` caps semantic results at 20 at
  // the backend (no offset/cursor yet — follow-up plan), so the loop
  // terminates quickly. Mirrors FeedPage.
  useEffect(() => {
    if (!semanticMode) return;
    if (retrievalMissingCount === 0) return;
    if (!hasNextPage) return;
    if (isFetchingNextPage) return;
    fetchNextPage();
  }, [
    semanticMode,
    retrievalMissingCount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  // Empty search field → wipe ranker output so the in-memory list
  // falls back to the unfiltered track entries.
  useEffect(() => {
    if (!trackSearch.trim()) {
      resetRetrieval();
    }
  }, [trackSearch, resetRetrieval]);

  const handleDeleteTrack = async () => {
    if (!track) return;
    const ok = await confirm({
      title: 'Delete track',
      message: `Delete "${track.title}"? This cannot be undone.`,
      confirmLabel: 'Delete track',
      variant: 'danger'
    });
    if (!ok) return;
    const destination = pathAfterTrackDelete(track);
    try {
      await tracksApi.delete(track.id);
      // Refresh Mission Control's per-workspace track aggregation and
      // the feed-derived activity stats so the dashboard reflects the
      // deletion immediately.
      void invalidateWorkspaceListCaches(queryClient);
      void invalidateFeedCaches(queryClient);
      showToast('Track deleted', 'success');
      navigate(destination);
    } catch {
      showToast('Failed to delete track', 'error');
    }
  };

  const handleToggleTrackWatch = async () => {
    if (!id || !trackWatchersQuery.data) return;
    try {
      const isWatching = trackWatchersQuery.data.is_watching;
      if (isWatching) {
        await tracksApi.unwatch(id);
        showToast('Stopped watching track', 'success');
      } else {
        await tracksApi.watch(id);
        showToast('Watching track for updates', 'success');
      }
      await trackWatchersQuery.refetch();
    } catch {
      showToast('Failed to toggle watch status', 'error');
    }
  };

  /** Must match ``useInfiniteQuery`` key (includes active saved view). */
  const trackEntriesInfiniteQueryKey = useMemo(
    () => ['track', id, 'entries', activeView?.id] as const,
    [id, activeView?.id]
  );

  const patchEntriesCache = useCallback(
    (fn: (page: TrackEntriesPage) => TrackEntriesPage) => {
      if (!id) return;
      queryClient.setQueryData<InfiniteData<TrackEntriesPage>>(
        trackEntriesInfiniteQueryKey,
        old => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(fn)
          };
        }
      );
    },
    [id, queryClient, trackEntriesInfiniteQueryKey]
  );

  /** When composing on a kanban view, default empty workflow field to the first column. */
  const kanbanCreateCustomFieldFallback = useMemo(() => {
    if (!activeView || activeView.type !== 'kanban') return undefined;
    const fallback = resolveKanbanCreateCustomFieldFallback(
      activeView,
      trackEntryTypeFields
    );
    if (!fallback) return undefined;
    return () => fallback;
  }, [activeView, trackEntryTypeFields]);

  /** Prefer ``activeView`` over cached views list — column renames update
   *  ``activeView`` optimistically before the views query refetches. */
  const viewsForKanbanLabels = useMemo(() => {
    if (!activeView?.id) return allSavedViews;
    const inList = allSavedViews.some(v => v.id === activeView.id);
    if (!inList) return [...allSavedViews, activeView];
    return allSavedViews.map(v => (v.id === activeView.id ? activeView : v));
  }, [allSavedViews, activeView]);

  /** Kanban column labels for workflow select fields (status / stage / group_by target). */
  const kanbanWorkflowEnumLabels = useMemo(
    () =>
      resolveKanbanWorkflowEnumLabelsForTrack(
        viewsForKanbanLabels,
        trackEntryTypeFields,
        activeView?.id
      ),
    [viewsForKanbanLabels, trackEntryTypeFields, activeView?.id]
  );

  const handleEntryCreatedFromComposer = useCallback(
    (created?: Entry) => {
      if (created?.id) {
        patchEntriesCache(p => ({
          ...p,
          entries: [created, ...p.entries.filter(e => e.id !== created.id)]
        }));
      }
      invalidateTrackEntries();
      // Belt-and-suspenders on top of invalidateTrackEntries(): invalidate
      // only forces a refetch for a query React Query currently considers
      // "active" — with a multi-step modal (CreateWizardModal's period ->
      // employees -> confirm flow) still unwinding/closing at this exact
      // moment, the underlying list can transiently read as inactive and
      // silently skip the auto-refetch, leaving the new Pay Run invisible
      // until a manual reload (found live: "Create Pay Run" wizard's new
      // entry never appeared in the Pay Runs table on its own). `refetch()`
      // is unconditional — same call the page's own "Retry" button already
      // uses — so the list is guaranteed current the moment the wizard's
      // batch of writes (entry + its on_create_tool populate call) settles.
      void refetchEntries();
    },
    [patchEntriesCache, invalidateTrackEntries, refetchEntries]
  );

  const handleEntryDelete = useCallback(
    (entryId: string) => {
      // Optimistic only — do not invalidate here. EntryDetail (and
      // EntryCard on the feed) await the DELETE after this callback;
      // an immediate refetch races the backend and can re-hydrate the
      // row while the entry still exists server-side (kanban “flash
      // back”). Rollback invalidates on API failure in those callers.
      patchEntriesCache(p => ({
        ...p,
        entries: p.entries.filter(e => e.id !== entryId)
      }));
    },
    [patchEntriesCache]
  );

  const handleEntryUpdate = useCallback(
    (u: Entry) => {
      patchEntriesCache(p => ({
        ...p,
        entries: p.entries.map(e => (e.id === u.id ? u : e))
      }));
    },
    [patchEntriesCache]
  );

  /** Persist an entry mutation owned by a view widget (Kanban drag,
   *  Calendar drop, etc.). Optimistically syncs the cache first, then
   *  PATCHes the backend with just the fields a widget can drive — the
   *  custom_fields blob plus a small allowlist of top-level columns
   *  commonly used as kanban/board axes. */
  const handleEntryPersist = useCallback(
    async (u: Entry) => {
      let previous: Entry | undefined;
      patchEntriesCache(p => {
        previous = p.entries.find(e => e.id === u.id);
        return p;
      });
      patchEntriesCache(p => ({
        ...p,
        entries: p.entries.map(e => (e.id === u.id ? u : e))
      }));
      const payload: Record<string, unknown> = {};
      // Send only the custom fields the widget actually changed. Re-sending the
      // whole blob (as the kanban drag's patched entry carries) trips Core's
      // protected-field guard on any App-protected field it happens to include
      // (e.g. `owner`), which rejects the entire update.
      if (u.custom_fields !== undefined) {
        const changed = diffCustomFields(
          u.custom_fields as Record<string, unknown>,
          (previous?.custom_fields || {}) as Record<string, unknown>
        );
        if (Object.keys(changed).length > 0) payload.custom_fields = changed;
      }
      const top = u as unknown as Record<string, unknown>;
      for (const key of ['status', 'priority', 'due_date', 'assignee', 'bucket', 'start_date']) {
        if (top[key] !== undefined) payload[key] = top[key];
      }
      if (Object.keys(payload).length === 0) return;
      try {
        const updated = await entriesApi.update(u.id, payload);
        // Refresh cache with the canonical server response so timestamps
        // and any server-side derived fields stay in sync.
        patchEntriesCache(p => ({
          ...p,
          entries: p.entries.map(e => (e.id === updated.id ? updated : e))
        }));
        return updated;
      } catch (err) {
        showToast(errorMessageFromAxios(err, 'Failed to save changes'), 'error');
        invalidateTrackEntries();
      }
    },
    [patchEntriesCache, invalidateTrackEntries, showToast]
  );

  /** View-config persistence (kanban columns, card_fields, density, etc.).
   *  Optimistic: swap activeView immediately, fire PUT in background. On
   *  failure we toast and reload the meta query so the cache rebases on
   *  whatever the backend actually stored. */
  const handleViewUpdate = useCallback(
    (next: SavedView) => {
      setActiveView(next);
      if (id) {
        queryClient.setQueryData(
          viewsForTrackQueryKey(id),
          (old: SavedView[] | undefined) => {
            if (!old?.length) return old;
            const idx = old.findIndex(v => v.id === next.id);
            if (idx < 0) return [...old, next];
            return old.map(v => (v.id === next.id ? { ...v, ...next } : v));
          }
        );
      }
      void trackViewsApi
        .update(next.id, {
          name: next.name,
          type: next.type,
          config: next.config,
          is_default: next.is_default
        })
        .catch(() => {
          showToast('Failed to save view changes', 'error');
          invalidateTrackMeta();
        });
    },
    [id, queryClient, invalidateTrackMeta, showToast]
  );

  const handleKanbanColumnRemove = useCallback(async (viewId: string, columnKey: string) => {
    if (!id) return;
    try {
      await trackViewsApi.removeKanbanColumn(viewId, columnKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: viewsForTrackQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: entryTypesForTrackQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: trackAttachedOperationalModelQueryKey(id) }),
      ]);
    } catch (error) {
      showToast(errorMessageFromAxios(error, 'Could not remove this column.'), 'error');
      throw error;
    }
  }, [id, queryClient, showToast]);

  /** Append a kanban column key to profile select enums when ``group_by``
   *  targets a schema field (e.g. Pipeline ``stage``). */
  const handleKanbanColumnEnumSync = useCallback(
    async ({ fieldKey, columnKey }: { fieldKey: string; columnKey: string }) => {
      if (!id) return;
      const entryTypes = (entryTypesQuery.data ?? []) as EntryTypeNode[];
      const viewTypeKeys = (activeView?.entry_type_keys ?? [])
        .map(s => String(s || '').toLowerCase().trim())
        .filter(Boolean);
      const defaultSlug = slugifyKanbanColumnKey(
        activeView?.default_entry_type_key ||
          track?.operational_model_defaults?.default_entry_type ||
          ''
      );

      const scoped = entryTypes.filter(et => {
        const slug = slugifyKanbanColumnKey(et.name || '');
        if (viewTypeKeys.length) return viewTypeKeys.includes(slug);
        if (defaultSlug) return slug === defaultSlug;
        return true;
      });

      const updates: Array<Promise<EntryTypeNode>> = [];
      for (const et of scoped) {
        const fields = (et.form_schema?.fields ?? []) as OperationalModelFieldSpec[];
        const idx = fields.findIndex(f => f.key === fieldKey);
        if (idx < 0) continue;
        const field = fields[idx];
        const ftype = String(field.type || '').toLowerCase();
        if (ftype !== 'select' && ftype !== 'multi_select') continue;
        const enumVals = Array.isArray(field.enum)
          ? field.enum.map(v => String(v))
          : [];
        if (enumVals.includes(columnKey)) continue;
        const nextFields = fields.map((f, i) =>
          i === idx ? { ...f, enum: [...enumVals, columnKey] } : f
        );
        updates.push(
          entryTypesApi.update(et.id, {
            form_schema: { ...(et.form_schema ?? {}), fields: nextFields }
          })
        );
      }

      if (updates.length === 0) return;

      const scopedIds = new Set(scoped.map(et => et.id));
      queryClient.setQueryData(
        entryTypesForTrackQueryKey(id),
        (old: EntryTypeNode[] | undefined) => {
          if (!old?.length) return old;
          return old.map(et => {
            if (!scopedIds.has(et.id)) return et;
            const fields = (et.form_schema?.fields ?? []) as OperationalModelFieldSpec[];
            const idx = fields.findIndex(f => f.key === fieldKey);
            if (idx < 0) return et;
            const field = fields[idx];
            const ftype = String(field.type || '').toLowerCase();
            if (ftype !== 'select' && ftype !== 'multi_select') return et;
            const enumVals = Array.isArray(field.enum)
              ? field.enum.map(v => String(v))
              : [];
            if (enumVals.includes(columnKey)) return et;
            const nextFields = fields.map((f, i) =>
              i === idx ? { ...f, enum: [...enumVals, columnKey] } : f
            );
            return {
              ...et,
              form_schema: { ...(et.form_schema ?? {}), fields: nextFields }
            };
          });
        }
      );

      try {
        await Promise.all(updates);
        await queryClient.invalidateQueries({
          queryKey: entryTypesForTrackQueryKey(id)
        });
        await queryClient.invalidateQueries({
          queryKey: trackAttachedOperationalModelQueryKey(id)
        });
      } catch (err) {
        await queryClient.invalidateQueries({
          queryKey: entryTypesForTrackQueryKey(id)
        });
        showToast(
          errorMessageFromAxios(err, 'Failed to update column options'),
          'error'
        );
        throw err;
      }
    },
    [
      id,
      activeView?.entry_type_keys,
      activeView?.default_entry_type_key,
      track?.operational_model_defaults?.default_entry_type,
      entryTypesQuery.data,
      queryClient,
      showToast,
    ]
  );

  /** Inline entry creation (e.g. kanban column quick-add). Picks the
   *  track's default entry type when caller doesn't override. View
   *  constraints filter what the view *displays*, not what the user can
   *  post from the track composer. */
  const handleEntryCreate = useCallback(
    async (input: EntryCreateInput) => {
      if (!id) return;
      const allowed = new Set(
        entryTypeSlugs.map(s => slugifyKanbanColumnKey(s)).filter(Boolean)
      );
      const candidates = [
        input.type,
        activeView?.default_entry_type_key,
        track?.operational_model_defaults?.default_entry_type,
        ...(activeView?.entry_type_keys ?? []),
        ...entryTypeSlugs,
        'post',
      ]
        .map(s => slugifyKanbanColumnKey(String(s || '')))
        .filter(Boolean);
      let slug = 'post';
      for (const c of candidates) {
        if (c === 'item' && !slugMatchesAllowedEntryTypes('item', allowed)) continue;
        if (slugMatchesAllowedEntryTypes(c, allowed)) {
          slug = c;
          break;
        }
      }

      const entryTypes = (entryTypesQuery.data ?? []) as EntryTypeNode[];
      let matchingType = entryTypes.find(et =>
        entryTypeMatchesSlug(et.name || '', slug)
      );
      if (!matchingType && input.custom_fields) {
        const seededKeys = Object.keys(input.custom_fields).filter(
          k => !k.startsWith('_')
        );
        if (seededKeys.length) {
          matchingType = entryTypes.find(et => {
            const fieldKeys = new Set(
              ((et.form_schema?.fields ?? []) as OperationalModelFieldSpec[]).map(
                f => f.key
              )
            );
            return seededKeys.every(k => fieldKeys.has(k));
          });
          if (matchingType) {
            slug = slugifyKanbanColumnKey(matchingType.name || '');
          }
        }
      }
      if (matchingType) {
        slug = slugifyKanbanColumnKey(matchingType.name || '');
      }
      const typeFields = (matchingType?.form_schema?.fields ??
        []) as OperationalModelFieldSpec[];
      const missingRequired = getMissingRequiredFields(
        typeFields,
        input.custom_fields
      );
      const disallowed = getDisallowedCustomFieldKeys(
        typeFields,
        input.custom_fields
      );
      // A calendar date click starts a draft. Creating first and opening an
      // edit dialog would leave a placeholder record behind when canceled.
      if (input.source === 'calendar' || missingRequired.length > 0 || disallowed.length > 0) {
        setComposeModal({
          title: input.source === 'calendar' && input.title === 'New event' ? '' : input.title,
          type: slug,
          custom_fields: input.custom_fields
        });
        return;
      }

      if (activeView?.type === 'kanban') {
        const groupBy = resolveKanbanGroupBy(
          (activeView.config as Record<string, unknown> | undefined)?.group_by
        );
        const groupWriteFieldKey = resolveKanbanWriteFieldKey(groupBy, typeFields);
        if (
          shouldRouteKanbanQuickAddToCompose(
            typeFields,
            groupWriteFieldKey,
            input.custom_fields
          )
        ) {
          setComposeModal({
            title: input.title,
            type: slug,
            custom_fields: input.custom_fields
          });
          return;
        }
      }

      try {
        const created = await entriesApi.create({
          track_id: id,
          type: slug,
          title: input.title,
          custom_fields: input.custom_fields
        });
        patchEntriesCache(p => ({
          ...p,
          entries: [created, ...p.entries.filter(e => e.id !== created.id)]
        }));
        invalidateTrackEntries();
        return created;
      } catch (err) {
        const msg = errorMessageFromAxios(err, 'Failed to create entry');
        const hint =
          msg.toLowerCase().includes('target entry type') ||
          msg.toLowerCase().includes('parent')
            ? ' Re-apply the Operational Model on this track (Operational Models → Personal Knowledge Base → Apply) if the error persists.'
            : '';
        showToast(`${msg}${hint}`, 'error');
      }
    },
      // activeView fields are listed individually above; `activeView` itself
      // is a fresh object per render of the view tab strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      id,
      activeView?.type,
      activeView?.config,
      activeView?.default_entry_type_key,
      track?.operational_model_defaults?.default_entry_type,
      entryTypeSlugs,
      entryTypesQuery.data,
      patchEntriesCache,
      invalidateTrackEntries,
      showToast,
      // activeView fields are listed individually above; `activeView` itself
      // is a fresh object per render of the view tab strip.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ]
  );

  const isOwner = isSamePrincipal(user, track?.owner_id);
  const collaboratorList = useMemo(
    () => dedupeCollaborators(track?.collaborators || []),
    [track?.collaborators]
  );
  const {
    canCreateEntry: canCreateEntryByRole,
    canAdminTrack,
    canViewTrackConfig,
    canViewCollaborators,
    canManageCollaborators,
    canComment
  } = useTrackPermissions(track);
  const canEditViewLayout = isViewDesignerEnabled() && !isPagesView &&
    Boolean(activeView) && (canAdminTrack || canCreateEntryByRole);
  const canManageCollabRows = canManageCollaborators;

  // A singleton entry type (e.g. Company Profile — "one record per
  // workspace, always") is enforced server-side at create time, but the
  // "+ New" affordance has no way to know that on its own — without this,
  // it stays live and clickable even once the one allowed record already
  // exists, so a preparer fills out a whole form only to have it rejected
  // on submit. Suppress create for whichever entry type the active view
  // would actually create (its own default_entry_type_key, falling back to
  // the track's) once that type both is singleton and already has a row
  // among the entries currently loaded.
  const activeCreateEntryTypeSlug =
    activeView?.default_entry_type_key ||
    track?.operational_model_defaults?.default_entry_type ||
    '';
  const singletonAlreadySatisfied = useMemo(() => {
    if (!activeCreateEntryTypeSlug) return false;
    const entryTypes = (entryTypesQuery.data ?? []) as EntryTypeNode[];
    const targetType = entryTypes.find(et =>
      entryTypeMatchesSlug(et.name || '', activeCreateEntryTypeSlug)
    );
    if (!targetType?.form_schema?.singleton) return false;
    return allEntries.some(e =>
      entryTypeMatchesSlug(targetType.name || '', e.type || '')
    );
  }, [activeCreateEntryTypeSlug, entryTypesQuery.data, allEntries]);
  // The generic toolbar "+" always creates the ACTIVE VIEW's own default
  // entry type, so it's fair to gate it on that type's singleton state and
  // to hide it entirely on settings-hub views (a bare "+" is ambiguous
  // across a hub's several entry types — see SettingsHubWidget's own
  // per-entry-type "Add" buttons instead). Neither restriction belongs on
  // the compose MODAL itself below: a settings-hub "Add <Entry Type>"
  // button already knows exactly which (non-default) entry type it wants
  // and calls setComposeModal directly — gating the modal's render on this
  // same variable meant clicking one there silently set composeModal with
  // nothing appearing, until switching to a view where this happened to
  // become true made the stale seed pop up unexpectedly.
  const canCreateEntryViaToolbar =
    canCreateEntryByRole && !singletonAlreadySatisfied && activeView?.type !== 'operations-ui/settings-hub';

  useEffect(() => {
    if (!canViewTrackConfig && rightRailMode === 'config') {
      setRightRailMode(null);
    }
  }, [canViewTrackConfig, rightRailMode]);

  const collabExcludeIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of collaboratorList) {
      s.add(c.id);
      if (c.user_id) s.add(c.user_id);
    }
    return s;
  }, [collaboratorList]);

  const addTrackCollaborator = async (u: User) => {
    if (!id) return;
    try {
      // New collaborators default to ``commenter`` under the split-role
      // model — least-privilege so owners promote rather than demote
      // via the per-row role menu.
      await tracksApi.addCollaborator(id, {
        collaborator_user_id: u.id,
        role: 'commenter'
      });
      showToast('Collaborator added', 'success');
      // Optimistic row so the modal updates before the refetch round-trip.
      setTrack(prev => {
        if (!prev) return prev;
        const added: User = {
          ...u,
          role: 'commenter',
          source: 'direct',
          excluded: false,
          effective_access: true
        };
        const collaborators = dedupeCollaborators([
          ...(prev.collaborators ?? []),
          added,
        ]);
        return {
          ...prev,
          collaborators,
          collaborator_effective_total: collaborators.filter(
            c => c.effective_access !== false
          ).length
        };
      });
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to add collaborator'), 'error');
    }
  };

  /** Change an existing direct collaborator's role via the dedicated
   *  PATCH endpoint (server emits ``track.collaborator_role_update``
   *  ChangeEvent + notifies the collaborator with before/after roles).
   *  Accepts the substrate's delegable ladder
   *  (``admin | editor | commenter | viewer``) — ``owner`` is handled by
   *  the separate transfer-ownership flow. */
  const setTrackCollaboratorRole = async (
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) => {
    if (!id) return;
    try {
      await tracksApi.updateCollaboratorRole(id, userId, role);
      showToast(`Role changed to ${role}`, 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to change role'), 'error');
    }
  };

  /** Materialize an App-cascade row as a direct Track collaborator by
   *  upserting a ``COLLABORATES_ON{role}`` edge. Used when the Track
   *  owner promotes an inherited user via the per-row role menu —
   *  one-click path to give an App-cascaded user explicit Track
   *  authority (e.g. admin) without first running the Add flow. The
   *  backend's ``add_collaborator`` upserts via ``ensure_edge``, so
   *  this is safe to call regardless of whether the user is already
   *  inherited; the direct edge then shadows the inherited path. */
  const promoteInheritedToDirect = async (
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) => {
    if (!id) return;
    try {
      await tracksApi.addCollaborator(id, {
        collaborator_user_id: userId,
        role
      });
      showToast(`Granted ${role} on this track`, 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to change role'), 'error');
    }
  };

  const removeTrackCollaborator = async (userId: string) => {
    if (!id) return;
    const ok = await confirm({
      title: 'Remove collaborator',
      message: 'Remove this collaborator from the track?',
      confirmLabel: 'Remove',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await tracksApi.removeCollaborator(id, userId);
      showToast('Removed', 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to remove collaborator'), 'error');
    }
  };

  /** Exclude an inherited user — creates EXCLUDED_FROM edge to deny cascade. */
  const excludeInheritedCollaborator = async (
    userId: string,
    displayName?: string
  ) => {
    if (!id) return;
    const ok = await confirm({
      title: 'Remove from track',
      message: `${displayName || 'This user'} has access via a parent app. Removing them creates an exclusion that blocks their inherited access on this track only.`,
      confirmLabel: 'Exclude',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await tracksApi.addExclusion(id, { user_id_to_exclude: userId });
      showToast('Excluded from this track', 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to exclude'), 'error');
    }
  };

  const restoreExcludedCollaborator = async (userId: string) => {
    if (!id) return;
    try {
      await tracksApi.removeExclusion(id, userId);
      showToast('Access restored', 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to restore'), 'error');
    }
  };

  const transferTrackOwnershipTo = async (
    newOwnerUserId: string,
    displayName?: string
  ) => {
    if (!id || !isOwner) return;
    const ok = await confirm({
      title: 'Transfer track ownership',
      message: `Ask ${displayName || 'this collaborator'} to accept track ownership? You remain the owner until they accept.`,
      confirmLabel: 'Send proposal',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await tracksApi.transferOwnership(id, newOwnerUserId);
      showToast('Ownership proposal sent; waiting for acceptance', 'success');
      await invalidateTrackMeta();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Transfer failed'), 'error');
    }
  };

  // Resolve workspace for breadcrumbs:
  //   - track inside an App → derive workspace from the parent space (single-parent rule)
  //   - standalone track-under-workspace → use track.workspace_id directly
  const trackWorkspaceId =
    track?.app?.workspace_id || track?.workspace_id || null;
  // Keep the global scope (workspace switcher + sidebar) in sync with
  // the track we're viewing. Lets the user click into a track from
  // Mission Control (or any cross-workspace surface) without leaving
  // the rail rooted in the previous workspace.
  const workspaceCrumbs = useWorkspaceCrumbPrefix(trackWorkspaceId);
  const fromEntryId = searchParams.get('from_entry')?.trim() || '';
  const fromTrackId = searchParams.get('from_track')?.trim() || '';
  const fromTitle = searchParams.get('from_title')?.trim() || '';
  const breadcrumbFrom = useMemo(
    () =>
      fromEntryId && fromTrackId
        ? {
            entryId: fromEntryId,
            trackId: fromTrackId,
            title: fromTitle || 'Parent',
          }
        : null,
    [fromEntryId, fromTrackId, fromTitle]
  );
  const trackCrumbs = useMemo(
    () =>
      buildTrackBreadcrumbs(track, {
        entryTitle: entryModal?.entry.title || null,
        from: breadcrumbFrom,
      }),
    [track, entryModal?.entry.title, entryModal?.entry.id, breadcrumbFrom]
  );
  useSetCrumbs(
    track
      ? workspaceCrumbs.length
        ? [...workspaceCrumbs, ...trackCrumbs]
        : trackCrumbs
      : trackCrumbs
  );

  const emptyStateContent = entriesBootstrapping ? (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <CardSkeleton key={i} />
      ))}
    </div>
  ) : allEntries.length === 0 ? (
    <div className="app-card">
      <EmptyState
        icon={
          <IconWell size="lg" aria-hidden>
            <Sparkles size={22} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
        }
        title="No entries yet"
        description="Create your first entry above to get started."
      />
    </div>
  ) : filteredEntries.length === 0 ? (
    <div className="app-card">
      <EmptyState
        icon={
          <IconWell size="lg" aria-hidden>
            <Sparkles size={22} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
        }
        title="No matching entries"
        description="Try a different entry type filter."
      />
    </div>
  ) : null;

  if (loading)
    return (
      <PageShell>
        <PageSection>
          {/* Editorial header — vertical accent bar + display title +
              meta strap-line, mirroring the production hero. */}
          <div className="mb-8">
            <div className="flex items-center gap-5">
              <Skeleton className="h-11 w-[5px] rounded-[2px] shrink-0" />
              <Skeleton className="h-12 w-[42%] max-w-[440px] rounded-md" />
            </div>
            <div className="mt-3.5 flex items-center gap-x-6">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-3.5 w-20 rounded" />
            </div>
          </div>
          {/* Left-anchored search shimmer — mirrors the loaded filter row. */}
          <div className={`${filterBar.rowBottom} flex justify-start`}>
            <Skeleton className="h-10 w-full max-w-xl rounded-[var(--radius-input)]" />
          </div>
          {/* Composer placeholder */}
          <Skeleton className="mb-10 h-14 w-full rounded-[var(--radius-card)]" />
          {/* Entry rows */}
          <div>
            {[1, 2, 3].map(i => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </PageSection>
      </PageShell>
    );

  // `loading` is already false here — the `if (loading)` guard above returned.
  // Spelling this as `!track` alone drops the redundant term and lets the
  // compiler narrow `track` to non-null for the whole render below.
  if (!track)
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
        <p className="text-[color:var(--text-muted)]">
          {loadError || 'Track not found.'}
        </p>
        <Link to="/tracks" className="text-[var(--link)] hover:text-[var(--link-hover)] text-sm mt-2 inline-block hover:underline">
          ← Back to Tracks
        </Link>
      </div>
    );

  if (documentTemplatesRedirect) {
    return <Navigate to={documentTemplatesRedirect} replace />;
  }

  return (
    <PageShell>
      <TrackDetailHeader
        track={track}
        workspaceAccentColor={trackWorkspaceAccentColor}
        entriesTotal={entriesTotal}
        publicShareEnabled={Boolean(publicShareQuery.data?.enabled)}
        trackWatchers={trackWatchersQuery.data}
        onToggleTrackWatch={handleToggleTrackWatch}
        canViewCollaborators={collaboration && canViewCollaborators}
        canManageCollaborators={collaboration && canManageCollaborators}
        collaboratorCount={
          track.collaborator_effective_total ?? collaboratorList.length
        }
        isOwner={isOwner}
        onOpenCollaborators={() => setCollaboratorsModalOpen(true)}
        onOpenShare={() => setShareModalOpen(true)}
        onOpenEdit={() => setShowEditModal(true)}
        onOpenDerive={() => setDeriveModalOpen(true)}
        onDeleteTrack={handleDeleteTrack}
      />

      {dashboardFilters ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <Text variant="meta" tone="muted" as="p">
            Dashboard filters are applied to this Track. Results continue to follow your current access.
          </Text>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('dashboard_filters');
              setSearchParams(next);
            }}
          >Clear dashboard filters</Button>
        </div>
      ) : null}

      <TrackDetailViewChrome
        trackId={id}
        viewTabOptions={viewTabOptions}
        activeView={activeView}
        dedupedTabViews={dedupedTabViews}
        onChangeView={next => {
          setLayoutTarget(null);
          setActiveView(next);
          setSearchParams(prev => {
            const params = new URLSearchParams(prev);
            if (next?.id) params.set('view_id', next.id);
            else params.delete('view_id');
            return params;
          }, { replace: true });
        }}
        onEditLayout={canEditViewLayout && id && activeView
          ? () => setLayoutTarget({ trackId: id, viewId: activeView.id })
          : undefined}
        canViewTrackConfig={canViewTrackConfig}
        trackConfigOpen={trackConfigOpen}
        trackActivityOpen={trackActivityOpen}
        onToggleConfig={() => setTrackConfigOpen(o => !o)}
        onToggleActivity={() => setTrackActivityOpen(o => !o)}
      />

      <PageSection
        innerClassName={`
          grid grid-cols-1 min-h-[60vh]
          ${rightRailOpen ? 'xl:[grid-template-columns:minmax(0,1fr)_var(--track-right-rail-width)]' : ''}
        `}
        innerStyle={
          rightRailOpen
            ? ({
                ['--track-right-rail-width' as string]: `${rightRailWidth}px`
              } as CSSProperties)
            : undefined
        }
      >
        <TrackDetailMainColumn
          isPagesView={isPagesView}
          rightRailOpen={rightRailOpen}
          filterType={filterType}
          setFilterType={setFilterType}
          entryTypeSlugs={entryTypeSlugs}
          tagFilterEntries={allEntries}
          filterTags={filterTags}
          setFilterTags={setFilterTags}
          trackSearch={trackSearch}
          setTrackSearch={setTrackSearch}
          retrievalMode={retrievalMode}
          runRetrieval={runRetrieval}
          retrievalLoading={retrievalLoading}
          retrievalError={retrievalError}
          canCreateEntry={canCreateEntryViaToolbar}
          track={track}
          activeView={activeView}
          kanbanCreateCustomFieldFallback={kanbanCreateCustomFieldFallback}
          kanbanWorkflowEnumLabels={kanbanWorkflowEnumLabels}
          onEntryCreatedFromComposer={handleEntryCreatedFromComposer}
          semanticMode={semanticMode}
          retrievalMissingCount={retrievalMissingCount}
          filteredEntries={filteredEntries}
          retrievalResultsLength={retrievalResults.length}
          entriesListError={entriesListError}
          onRetryEntries={() => refetchEntries()}
          entriesPending={entriesPending}
          onEntryOpen={handleEntryOpen}
          onEntryDelete={handleEntryDelete}
          onEntryDeleteFailed={invalidateTrackEntries}
          onEntryEdit={handleEntryEdit}
          onEntryUpdate={handleEntryUpdate}
          onEntryPersist={handleEntryPersist}
          onViewUpdate={handleViewUpdate}
          onKanbanColumnEnumSync={handleKanbanColumnEnumSync}
          onKanbanColumnRemove={handleKanbanColumnRemove}
          onEntryCreate={handleEntryCreate}
          entryTypes={(entryTypesQuery.data ?? []) as EntryTypeNode[]}
          trackEntryTypeFields={trackEntryTypeFields}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={() => {
            void fetchNextPage();
          }}
          emptyStateContent={emptyStateContent}
          trackEntriesSentinelRef={trackEntriesSentinelRef}
        />

        {id && rightRailOpen ? (
          <TrackDetailRightRail
            trackId={id}
            trackActivityOpen={trackActivityOpen}
            trackConfigOpen={trackConfigOpen}
            canAdminTrack={canAdminTrack}
            asideMaxH={asideMaxH}
            asideRef={asideRef}
            onRailPointerDown={handleRailPointerDown}
            onRailPointerMove={handleRailPointerMove}
            onRailPointerUp={handleRailPointerUp}
          />
        ) : null}
      </PageSection>

      {canEditViewLayout && activeView && layoutTarget?.trackId === id &&
        layoutTarget?.viewId === activeView.id ? (
        <ViewDesignerShell
          key={`${id}:${activeView.id}`}
          open
          onClose={() => setLayoutTarget(null)}
          trackId={track.id}
          view={activeView}
          previewEntries={filteredEntries}
          onSaved={handleViewUpdate}
        />
      ) : null}

      {entryModal && (
        <EntryDetail
          key={entryModal.entry.id}
          entry={entryModal.entry}
          initialFocusComments={entryModal.focusComments}
          initialEditMode={entryModal.initialEditMode}
          track={track}
          canComment={canComment}
          workflowEnumLabels={kanbanWorkflowEnumLabels}
          onClose={closeEntryModal}
          onUpdate={handleEntryUpdate}
          onDelete={handleEntryDelete}
        />
      )}

      {canCreateEntryByRole && composeModal && track ? (
        <EntryComposeModal
          key={JSON.stringify(composeModal)}
          open
          track={track}
          seed={composeModal}
          viewEntryTypeKeys={activeView?.entry_type_keys}
          viewDefaultEntryTypeKey={activeView?.default_entry_type_key}
          createCustomFieldFallback={kanbanCreateCustomFieldFallback}
          workflowEnumLabels={kanbanWorkflowEnumLabels}
          onClose={() => setComposeModal(null)}
          onCreated={handleEntryCreatedFromComposer}
        />
      ) : null}

      <TrackModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        editTrack={track}
        onCreated={t => {
          setTrack(t);
          setShowEditModal(false);
        }}
      />

      <DeriveLibraryPackageModal
        open={deriveModalOpen}
        onClose={() => setDeriveModalOpen(false)}
        sourceLabel={`Track: ${track?.title ?? ''}`}
        onSubmit={async body => {
          if (!id) return;
          await operationalModelsApi.deriveFromTrack(id, body);
          queryClient.invalidateQueries({ queryKey: ['library'] });
          showToast('Template saved', 'success');
        }}
      />

      <TrackCollaboratorsModal
        trackId={id}
        open={collaboratorsModalOpen}
        onClose={() => setCollaboratorsModalOpen(false)}
        canManageCollaborators={collaboration && canManageCollaborators}
        canManageCollabRows={canManageCollabRows}
        isOwner={isOwner}
        currentUser={user}
        collaboratorList={collaboratorList}
        collaboratorCount={track.collaborator_effective_total}
        collabExcludeIds={collabExcludeIds}
        onAdd={addTrackCollaborator}
        onChangeDirectRole={setTrackCollaboratorRole}
        onPromoteInherited={promoteInheritedToDirect}
        onTransferOwnership={transferTrackOwnershipTo}
        onRemove={removeTrackCollaborator}
        onExclude={excludeInheritedCollaborator}
        onRestore={restoreExcludedCollaborator}
      />

      <TrackShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        trackId={id || ''}
        trackTitle={track?.title || ''}
      />
    </PageShell>
  );
}
