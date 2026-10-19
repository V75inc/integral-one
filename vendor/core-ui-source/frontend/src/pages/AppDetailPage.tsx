import { useDeployment } from '../hooks/useDeployment';
import { AppIcon } from '../ui';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResourceAccessReview } from '../components/access/ResourceAccessReview';
import { usePhantomClickGuard } from '../hooks/usePhantomClickGuard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Link2,
  BookPlus,
  RefreshCw,
  Search,
  ClipboardList,
  GripVertical,
  LayoutDashboard,
  Home,
  Settings2
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { appsApi, tracksApi } from '../api';
import { errorMessageFromAxios } from '../api/helpers';
import {
  invalidateFeedCaches,
  invalidateWorkspaceListCaches
} from '../queryKeys';
import { operationalModelsApi } from '../api/operationalModels';
import { DeriveLibraryPackageModal } from '../components/library/DeriveLibraryPackageModal';
import { PinButton } from '../components/sidebar/PinButton';
import { UserSearchPicker } from '../components/collab/UserSearchPicker';
import {
  CollaboratorRow,
  type CollaboratorRole
} from '../components/collab/CollaboratorRow';
import { TrackModal } from '../components/tracks/TrackModal';
import { AppModal } from '../components/apps/AppModal';
import { AppSettingsModal } from '../components/apps/AppSettingsModal';
import {
  Avatar,
  Button,
  EmptyState,
  Skeleton,
  IconWell,
  KebabMenu,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  filterBar,
  SearchRow,
  PageSearchInput,
  TrackDot,
  ViewTabs
} from '../components/ui';
import { Modal } from '../components/ui/Modal';
import { dedupeCollaborators, isSamePrincipal, resolveIdentityColor } from '../utils';
import { isTrackNavVisible } from '../utils/trackNav';
import { useAuth } from '../context/AuthContext';
import { useConfirm, type ConfirmOptions } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useChatPageFocus } from '../context/ChatPageFocusContext';
import { AppDashboardPanel } from '../features/app-dashboards/AppDashboardPanel';
import { AppHomePanel } from '../features/app-dashboards/AppHomePanel';
import { dashboardsApi } from '../api/dashboards';
import { useScope } from '../context/ScopeContext';
import { useWorkspaceCrumbPrefix } from '../hooks/useWorkspaceCrumbPrefix';
import { useRecents } from '../hooks/useRecents';
import { useWorkspaceCreationRights } from '../hooks/useWorkspaceCreationRights';
import { WorkspaceCreationRightsNotice } from '../components/collab/WorkspaceCreationRightsNotice';
import type { App, OperationalModelNode, Track, User } from '../types';
import { resolveDocumentTemplatesTrackHref } from '../features/documents/documentTemplatesRouting';
import { Text } from '../ui';
import {
  readAppDetailSection,
  writeAppDetailSection,
  type AppDetailSection
} from './appDetailSectionPrefs';

interface CollabRow {
  id?: string;
  user_id?: string;
  display_name?: string;
  email?: string;
  role?: string;
  /** Phase 9 Plan 09-01 (AVT-02) — surfaced through to <Avatar />. */
  avatar_attachment_id?: string;
  /** Used as the cache-bust token on avatar URLs. */
  updated_at?: string;
}

export function AppDetailPage() {
  const { collaboration } = useDeployment();
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const { visit: visitRecent } = useRecents();
  useEffect(() => {
    if (appId) visitRecent('app', appId);
  }, [appId, visitRecent]);
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [app, setApp] = useState<App | null>(null);
  const [appOperationalModel, setAppOperationalModel] =
    useState<OperationalModelNode | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [collabs, setCollabs] = useState<CollabRow[]>([]);
  const [callerRole, setCallerRole] = useState<string | null | undefined>(undefined);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showEditAppModal, setShowEditAppModal] = useState(false);
  const [showAppSettingsModal, setShowAppSettingsModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [linkModalSearch, setLinkModalSearch] = useState('');
  const [anchorExpanded, setAnchorExpanded] = useState(false);
  // Plan 08-04 — derive-library-package modal for SET-05.
  const [deriveModalOpen, setDeriveModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const [trackTemplates, setTrackTemplates] = useState<{ id: string; name: string }[]>([]);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
  const [trackSearch, setTrackSearch] = useState('');
  const [collaboratorsModalOpen, setCollaboratorsModalOpen] = useState(false);
  const [collaboratorTotal, setCollaboratorTotal] = useState<number | null>(null);
  const [collaboratorDirectoryVisible, setCollaboratorDirectoryVisible] = useState(true);
  const [accessDetailsOpen, setAccessDetailsOpen] = useState(false);
  const [appSection, setAppSection] = useState<AppDetailSection>(() =>
    appId ? readAppDetailSection(appId) : 'tracks'
  );
  const { setPageContext, clearPageContext } = useChatPageFocus();

  const selectAppSection = useCallback(
    (section: AppDetailSection) => {
      setAppSection(section);
      if (appId) writeAppDetailSection(appId, section);
    },
    [appId]
  );

  // Restore last section when navigating between apps without remounting.
  useEffect(() => {
    if (!appId) return;
    setAppSection(readAppDetailSection(appId));
  }, [appId]);

  const dashboardsQuery = useQuery({
    queryKey: ['dashboards', appId],
    queryFn: () => dashboardsApi.list(appId!),
    enabled: !!appId
  });
  const dashboardCount = dashboardsQuery.data?.length ?? 0;
  const homeQuery = useQuery({
    queryKey: ['app-home-definition', appId],
    queryFn: () => dashboardsApi.home(appId!, false),
    refetchInterval: 15_000,
    enabled: Boolean(appId),
  });
  const hasHome = Boolean(homeQuery.data?.home);
  useEffect(() => {
    if (appId && homeQuery.data) setAppSection(readAppDetailSection(appId, hasHome ? 'home' : 'tracks'));
  }, [appId, homeQuery.data, hasHome]);

  // Publish breadcrumb trail to the TopBar.
  // When the App is workspace-scoped, lead the trail with the {WorkspaceName}
  // so the ownership chain is visible end-to-end, THEN the clickable "Apps"
  // section so the user can still navigate back to the workspace's app
  // listing — i.e. {WorkspaceName} › Apps › {AppName}. (The fallback branches
  // below, hit only when the workspace can't be resolved, keep the bare
  // Apps-first trail.)
  const workspaceCrumbs = useWorkspaceCrumbPrefix(app?.workspace_id || null);
  // Keep the global scope (workspace switcher + sidebar) in sync with
  // the App we're viewing. Lets the user click into an App from
  // Mission Control without leaving the rail rooted in the previous
  // workspace.
  const { setScope: setActiveScope, workspaces } = useScope();
  const appWorkspaceColor = workspaces.find(w => w.id === app?.workspace_id)?.accent_color;
  const { canCreateTracks, lacksTrackCreationInOrg } = useWorkspaceCreationRights();
  useEffect(() => {
    const wid = app?.workspace_id || '';
    if (!wid) return;
    setActiveScope({ workspaceId: wid });
  }, [app?.id, app?.workspace_id, setActiveScope]);
  useSetCrumbs(
    app
      ? workspaceCrumbs.length
        ? [
            ...workspaceCrumbs,
            { label: 'Apps', to: '/apps' },
            { label: app.name?.trim() || 'Untitled app' },
          ]
        : [
            { label: 'Apps', to: '/apps' },
            { label: app.name?.trim() || 'Untitled app' },
          ]
      : [{ label: 'Apps', to: '/apps' }, { label: 'Loading…' }]
  );

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const [sp, tr, c, at, tpls, profile] = await Promise.all([
        appsApi.get(appId),
        appsApi.listTracks(appId),
        appsApi.getCollaboratorsDetailed(appId),
        tracksApi.list(),
        appsApi.listTrackTemplates(appId).catch(() => []),
        operationalModelsApi.getAttachedForApp(appId).catch(() => null),
      ]);
      setApp(sp);
      setAppOperationalModel(profile);
      setTracks(tr);
      setCollabs(c.collaborators as CollabRow[]);
      setCollaboratorTotal(typeof c.total === 'number' ? c.total : null);
      setCollaboratorDirectoryVisible(c.directory_visible !== false);
      setCallerRole(c.caller_role);
      setAllTracks(at as Track[]);
      setTrackTemplates(tpls.map(t => ({ id: t.id, name: t.name })));
    } catch (e: unknown) {
      setError(errorMessageFromAxios(e, 'Failed to load app'));
      setApp(null);
      setCallerRole(null);
      setAppOperationalModel(null);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    load();
  }, [load]);

  const trackIdsInApp = useMemo(() => new Set(tracks.map(t => t.id)), [tracks]);

  const defaultTrack = useMemo(() => {
    const manifest = appOperationalModel?.manifest;
    const appDefinition = manifest?.app as Record<string, unknown> | undefined;
    const defaults = appDefinition?.defaults as Record<string, unknown> | undefined;
    const defaultTrackKey = String(defaults?.default_track || '').trim();
    if (!defaultTrackKey) return null;
    return tracks.find(track => track.template_id === defaultTrackKey) || null;
  }, [appOperationalModel, tracks]);

  const tracksAvailableToLink = useMemo(
    () => allTracks.filter(t => !trackIdsInApp.has(t.id)),
    [allTracks, trackIdsInApp],
  );

  const linkableTracks = useMemo(() => {
    const q = linkModalSearch.trim().toLowerCase();
    if (!q) return tracksAvailableToLink;
    return tracksAvailableToLink.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        (t.purpose || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [tracksAvailableToLink, linkModalSearch]);

  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    // Settings + nav_visible=false (e.g. document line tracks) stay out of
    // App track nav; they remain addressable via direct URL / pins.
    const visibleTracks = tracks
      .filter(isTrackNavVisible)
      .sort((a, b) => {
        const ap = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
        const bp = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
        return ap - bp || a.title.localeCompare(b.title);
      });
    if (!q) return visibleTracks;
    return visibleTracks.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        (t.purpose || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.anchor_source?.entry_title || '').toLowerCase().includes(q)
    );
  }, [tracks, trackSearch]);

  useEffect(() => {
    if (!appId) {
      clearPageContext();
      return;
    }
    if (appSection === 'dashboards') return;
    setPageContext({
      pageKind: appSection === 'home' ? 'app_home' : 'app_detail',
      focusedAppId: appId,
      visibleData: {
        tracks: filteredTracks.map(t => ({
          id: t.id,
          title: t.title || undefined
        }))
      },
      metadata: { app_name: app?.name, app_section: appSection }
    });
    return () => clearPageContext();
  }, [
    appId,
    app?.name,
    appSection,
    filteredTracks,
    setPageContext,
    clearPageContext,
  ]);

  useEffect(() => {
    if (!appId || appSection !== 'dashboards') return;
    setPageContext({
      pageKind: 'app_dashboards',
      focusedAppId: appId,
      visibleData: null,
      metadata: { app_name: app?.name, app_section: appSection }
    });
    return () => clearPageContext();
  }, [appId, app?.name, appSection, setPageContext, clearPageContext]);

  // Split into primary (user-curated) vs anchor (entry-spawned) so the
  // page mirrors the Tracks page's three-bucket grouping. Within an App
  // detail view, "primary" already implies the parent App, so the only
  // meaningful sub-split is anchor extensions — rendered as a collapsed
  // section beneath the primary list.
  const { primaryTracks, anchorTracks } = useMemo(() => {
    const primary: Track[] = [];
    const anchor: Track[] = [];
    for (const t of filteredTracks) {
      if (t.anchor_source) anchor.push(t);
      else primary.push(t);
    }
    return { primaryTracks: primary, anchorTracks: anchor };
  }, [filteredTracks]);

  const uniqueCollabs = useMemo(() => dedupeCollaborators(collabs), [collabs]);
  const collaboratorCount = collaboratorTotal ??
    (collaboratorDirectoryVisible ? uniqueCollabs.length : null);

  const isAppOwner = useMemo(() => {
    if (!app?.owner_user_id || !me) return false;
    return isSamePrincipal(me, app.owner_user_id);
  }, [app, me]);

  const myCollab = useMemo(
    () =>
      uniqueCollabs.find(
        c => me && (isSamePrincipal(me, c.id) || isSamePrincipal(me, c.user_id)),
      ),
    [uniqueCollabs, me],
  );
  // Non-admin responses withhold the directory but retain current caller
  // authority. Only older servers that omit caller_role need the row fallback.
  const myRole = (
    callerRole === undefined ? myCollab?.role || '' : callerRole || ''
  ).toLowerCase();
  const isAdminInCollab = myRole === 'admin';
  const isWorkspaceOwner = workspaces.find(w => w.id === app?.workspace_id)?.your_role === 'owner';
  const canAdmin = isWorkspaceOwner || isAppOwner || isAdminInCollab;
  const canManageCollaborators = canAdmin;
  // Adding or linking a track is app.update, not the workspace create flag.
  // A workspace owner can open this App as a commenter and still holds
  // canCreateTracks; showing New track in that case returns 403.
  const canAddTrackToThisApp = canAdmin && canCreateTracks;
  const canEditDashboard =
    isAppOwner ||
    ['admin', 'editor'].includes(myRole);

  const excludeCollabIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of uniqueCollabs) {
      if (c.id) s.add(c.id);
      if (c.user_id) s.add(c.user_id);
    }
    return s;
  }, [uniqueCollabs]);

  const addCollaborator = async (u: User) => {
    if (!appId || !canManageCollaborators) {
      if (!canManageCollaborators)
        showToast('Only the app owner or an admin can add collaborators', 'error');
      return;
    }
    try {
      // Least-privilege default: new collaborators get ``commenter``;
      // owner promotes per row via the role menu.
      await appsApi.addCollaborator(appId, {
        collaborator_user_id: u.id,
        role: 'commenter'
      });
      showToast('Collaborator added', 'success');
      load();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to add'), 'error');
    }
  };

  /** Change an existing direct collaborator's role via PATCH endpoint.
   *  Emits ``app.collaborator_role_update`` ChangeEvent server-side.
   *  Accepts the substrate's delegable ladder
   *  (``admin | editor | commenter | viewer`` — ``owner`` handled by
   *  transfer-ownership flow). */
  const setCollaboratorRole = async (
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) => {
    if (!appId || !canManageCollaborators) return;
    try {
      await appsApi.updateCollaboratorRole(appId, userId, role);
      showToast(`Role changed to ${role}`, 'success');
      load();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to change role'), 'error');
    }
  };

  const removeCollaborator = async (userId: string) => {
    if (!appId || !canManageCollaborators) {
      if (!canManageCollaborators)
        showToast('Only the app owner or an admin can remove collaborators', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Remove collaborator',
      message: 'Remove this person from the App?',
      confirmLabel: 'Remove',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await appsApi.removeCollaborator(appId, userId);
      showToast('Removed', 'success');
      load();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to remove collaborator'), 'error');
    }
  };

  const transferOwnershipTo = async (newOwnerUserId: string, displayName?: string) => {
    if (!appId || !(isAppOwner || isWorkspaceOwner)) return;
    const ok = await confirm({
      title: 'Transfer app ownership',
      message: `Ask ${displayName || 'this collaborator'} to accept App ownership? You remain the owner until they accept.`,
      confirmLabel: 'Send proposal',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await appsApi.transferOwnership(appId, newOwnerUserId);
      showToast('Ownership proposal sent; waiting for acceptance', 'success');
      load();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Transfer failed'), 'error');
    }
  };

  const linkTrack = async (trackId: string) => {
    if (!appId) return;
    try {
      await appsApi.addTrack(appId, trackId);
      showToast('Track linked to app', 'success');
      setLinkModal(false);
      setLinkModalSearch('');
      load();
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to link'), 'error');
    }
  };

  const updateFromLibrary = async () => {
    if (!appId || !app || !isAppOwner || !app.installed_from_library_id) return;
    const ok = await confirm({
      title: 'Update this App from its library package?',
      message: `Queue the latest library package update for “${app.name}”? The update will reconcile this App's structure and private skills with the package. Review the lifecycle result in Background Tasks after it runs.`,
      confirmLabel: 'Queue update',
      variant: 'default'
    });
    if (!ok) return;
    try {
      const work = await appsApi.updateFromLibrary(appId);
      showToast(
        work.status === 'queued'
          ? `App update queued (${work.work_item_id})`
          : `App update submitted (${work.work_item_id})`,
        'success'
      );
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to queue App update'), 'error');
    }
  };

  const deleteApp = async () => {
    if (!appId || !app || !isAppOwner) return;
    const ok = await confirm({
      title: 'Delete this App?',
      message: `This permanently deletes “${app.name}” and every track that exists only in this App (including entries and content). Tracks that are also linked to another App will be removed from this App but not deleted.`,
      confirmLabel: 'Delete app',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await appsApi.delete(appId);
      // Mission Control aggregates apps per-workspace and derives
      // activity from the feed — invalidate both prefixes so the
      // dashboard tallies reflect the deletion.
      void invalidateWorkspaceListCaches(queryClient);
      void invalidateFeedCaches(queryClient);
      showToast('App deleted', 'success');
      navigate('/apps');
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to delete app'), 'error');
    }
  };


  if (loading && !app) {
    return (
      <PageShell>
        <PageSection>
          {/* Editorial header skeleton */}
          <div className="mb-8">
            <div className="flex items-center gap-5">
              <Skeleton className="h-11 w-[5px] rounded-[2px] shrink-0" />
              <Skeleton className="h-12 w-[40%] max-w-[420px] rounded-md" />
            </div>
            <div className="mt-3.5 flex items-center gap-x-6">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-3.5 w-28 rounded" />
            </div>
          </div>
          {/* Right-anchored search shimmer */}
          <div className={`${filterBar.rowBottom} flex justify-start`}>
            <Skeleton className="h-10 w-full max-w-xl rounded-[var(--radius-input)]" />
          </div>
          {/* Track row skeletons */}
          <div>
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="flex items-center gap-4 py-4 border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-[40%] max-w-[300px] rounded" />
                  <Skeleton className="h-3 w-[70%] max-w-[480px] rounded" />
                </div>
                <Skeleton className="h-3 w-20 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </PageSection>
      </PageShell>
    );
  }

  // `appId` is also checked here so it narrows to `string` for the render
  // below: react-router types route params as possibly-undefined, and children
  // like AppDashboardPanel require a concrete id. The route cannot match
  // without one, so this arm is unreachable in practice.
  if (!app || !appId) {
    return (
      <PageShell>
        <PageSection innerClassName="max-w-[1200px]">
          <Text variant="body" tone="muted" as="p">
            {error || 'App not found'}
          </Text>
          <Link
            to="/apps"
            className="mt-3 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-fast"
          >
            ← Apps
          </Link>
        </PageSection>
      </PageShell>
    );
  }

  return (
    /* PageShell owns rhythm; PageSections re-apply the gutter so the
       full-bleed page divider can span the main column edge to edge. */
    <PageShell>
      <PageSection>
        {error ? (
          <div
            className="mb-4 rounded-[var(--radius-card)] border border-[color:var(--warn-fg)]/30 bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-fg)]"
            role="alert"
          >
            {error}{' '}
            <button type="button" className="font-medium underline" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}

      <header className="mb-8 md:mb-10">
        {/* Title row — display H1 left, action buttons right-anchored
            inline. Same chrome as TrackDetail so the two detail pages
            share a single button motif: compact bordered text-xs
            buttons in the upper right. Stacks below the title on
            mobile so the title gets full width. */}
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-x-6 md:gap-y-4 min-w-0">
          <PageHeading
            icon={<AppIcon name={app.name} icon={app.icon} color={resolveIdentityColor(app.accent_color, appWorkspaceColor)} size="lg" />}
            accentColor={resolveIdentityColor(app.accent_color, appWorkspaceColor)}
            accentLabel={app.name}
          >
            {app.name}
          </PageHeading>
          <div className="flex flex-wrap items-center gap-2 shrink-0 md:pb-2">
            {/* V1 follow-up: surface Pin on the App detail header so the
                sidebar's PINNED section actually has an obvious place
                to fill from. */}
            <PinButton kind="app" id={app.id} label={app.name} size="md" />
            {collaboration && <Button
              variant="outline"
              size="sm"
              icon={<Users size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={() => setCollaboratorsModalOpen(true)}
              aria-label={
                collaboratorCount !== null && collaboratorCount > 0
                  ? `Collaborators, ${collaboratorCount} people`
                  : 'Collaborators'
              }
            >
              {collaboratorCount === null ? 'Collaborators' :
                `${collaboratorCount} ${collaboratorCount === 1 ? 'collaborator' : 'collaborators'}`}
            </Button>}
            {canAdmin ? (
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => setShowEditAppModal(true)}
                aria-label="Edit app"
              >
                Edit
              </Button>
            ) : null}
            {canAdmin ? (
              <Button
                variant="outline"
                size="sm"
                icon={<Settings2 size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => setShowAppSettingsModal(true)}
                aria-label="App settings"
                data-testid="app-settings-button"
              >
                Settings
              </Button>
            ) : null}
            {canAddTrackToThisApp ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => setShowTrackModal(true)}
                aria-label="New track"
              >
                New track
              </Button>
            ) : null}
            {canAdmin || isAppOwner ? (
            <KebabMenu
              ariaLabel="More app actions"
              items={[
                ...(canAdmin
                  ? [
                      {
                        key: 'link-track',
                        label: 'Link existing track',
                        icon: <Link2 size={13} strokeWidth={LINE_ICON_STROKE} />,
                        onClick: () => setLinkModal(true)
                      },
                    ]
                  : []),
                ...(canAdmin
                  ? [
                      {
                        key: 'save-template',
                        label: 'Save as template',
                        icon: <BookPlus size={13} strokeWidth={LINE_ICON_STROKE} />,
                        onClick: () => setDeriveModalOpen(true)
                      },
                    ]
                  : []),
                ...(isAppOwner && app.installed_from_library_id
                  ? [
                      {
                        key: 'update-from-library',
                        label: 'Update from library',
                        icon: <RefreshCw size={13} strokeWidth={LINE_ICON_STROKE} />,
                        onClick: updateFromLibrary
                      },
                    ]
                  : []),
                ...(isAppOwner
                  ? [
                      {
                        key: 'delete',
                        label: 'Delete app',
                        icon: <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />,
                        onClick: deleteApp,
                        danger: true,
                        dividerAbove: true
                      },
                    ]
                  : []),
              ]}
            />
            ) : null}
          </div>
        </div>
        <WorkspaceCreationRightsNotice
          resource="tracks"
          show={lacksTrackCreationInOrg}
          className="mt-2"
        />
        <PageMeta>
          <span>
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </span>
          {!canAdmin ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {myRole === 'editor'
                  ? 'You can create and edit entries. The owner or an admin manages tracks.'
                  : 'You can view and comment. The owner or an admin manages tracks.'}
              </span>
            </>
          ) : null}
          {collaboration && collaboratorCount !== null && collaboratorCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {collaboratorCount}{' '}
                {collaboratorCount === 1 ? 'collaborator' : 'collaborators'}
              </span>
            </>
          ) : null}
        </PageMeta>
        {app.description?.trim() ? (
          <PageMeta as="p">
            {app.description}
          </PageMeta>
        ) : null}
        {defaultTrack && !hasHome ? (
          <div className="mt-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                Start here
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text)]">
                {defaultTrack.title}
              </p>
              {defaultTrack.description?.trim() ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
                  {defaultTrack.description}
                </p>
              ) : null}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/tracks/${defaultTrack.id}`)}
              className="shrink-0"
            >
              Open {defaultTrack.title}
            </Button>
          </div>
        ) : null}
        {Array.isArray(app.operations) && app.operations.length > 0 ? (
          <div className="mt-4 max-w-2xl rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] px-3 py-2.5">
            <Text variant="label" tone="muted" as="div" className="mb-1.5">
              Operations
            </Text>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {app.operations.map(op => (
                <li
                  key={op.key}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                >
                  <span className="font-medium text-[var(--text)]">
                    {op.name || op.key}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--text-subtle)]">
                    {op.key}
                  </span>
                  {op.policy_action ? (
                    <span className="text-[12px] text-[var(--text-muted)]">
                      policy={op.policy_action}
                    </span>
                  ) : null}
                  {op.staging_level ? (
                    <span className="text-[12px] text-[var(--text-muted)]">
                      staging={op.staging_level}
                    </span>
                  ) : null}
                  {op.kind ? (
                    <span className="text-[12px] text-[var(--text-subtle)]">
                      {op.kind}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      <ViewTabs<AppDetailSection>
        className="mt-6"
        ariaLabel="App sections"
        value={appSection}
        onChange={selectAppSection}
        options={[
          ...(hasHome ? [{ value: 'home' as const, label: 'Home', icon: <Home size={15} strokeWidth={LINE_ICON_STROKE} /> }] : []),
          {
            value: 'tracks',
            label: 'Tracks',
            icon: <ClipboardList size={15} strokeWidth={LINE_ICON_STROKE} />,
            count: tracks.length
          },
          {
            value: 'dashboards',
            label: 'Dashboards',
            icon: <LayoutDashboard size={15} strokeWidth={LINE_ICON_STROKE} />,
            count: dashboardCount
          },
        ]}
      />

      </PageSection>

      <PageSection.Separator />

      {appSection === 'home' && hasHome ? (
        <PageSection className={filterBar.sectionTop}>
          <AppHomePanel appId={appId} workspaceId={app?.workspace_id || ''} />
        </PageSection>
      ) : appSection === 'tracks' ? (
      <PageSection className={filterBar.sectionTop}>

      {/* Search — right-anchored utility row matching FeedPage / TrackDetail. */}
      <SearchRow>
        <PageSearchInput
          value={trackSearch}
          onChange={setTrackSearch}
          placeholder="Search tracks in this App…"
        />
      </SearchRow>

      {/* Track-level "Apply template" lives on the Track page menu (appsApi.applyTrackTemplateToTrack). */}
      {canAdmin && trackTemplates.length > 0 && <section aria-label="Track templates" className="mb-6 space-y-2">
        <Text as="h2" variant="heading-sm">Track templates</Text>
        {trackTemplates.map(template => <div key={template.id} className="flex items-center justify-between gap-3">
          <Text>{template.name}</Text>
          <Button size="sm" variant="outline" disabled={deletingTemplate !== null}
            aria-label={`Delete track template ${template.name}`}
            onClick={async () => {
              if (!appId || deletingTemplate !== null || !await confirm({ title: 'Delete track template?', message: `Delete “${template.name}”? Existing Tracks must retain their data and schema. Templates still used by reference cannot be removed.`, confirmLabel: 'Delete template', variant: 'danger' })) return;
              setDeletingTemplate(template.id);
              try { await appsApi.deleteTrackTemplate(appId, template.id); await load(); }
              catch (error) { showToast(errorMessageFromAxios(error, 'Could not delete the track template'), 'error'); }
              finally { setDeletingTemplate(null); }
            }}>Delete template</Button>
        </div>)}
      </section>}
      <div className="grid grid-cols-1 gap-6">
        <div className="min-w-0">
          {tracks.length === 0 ? (
            <EmptyState
              icon={
                <IconWell size="lg" aria-hidden>
                  <ClipboardList size={22} strokeWidth={LINE_ICON_STROKE} />
                </IconWell>
              }
              title="No tracks in this App"
              description={
                canAdmin
                  ? 'Create a new track or link an existing one.'
                  : myRole === 'editor'
                    ? 'Tracks in this App are managed by its owner or an admin. Once tracks exist, you can add entries.'
                    : 'Tracks in this App are managed by its owner or an admin. You can view and comment.'
              }
              action={
                canAdmin ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Link2 size={14} strokeWidth={LINE_ICON_STROKE} />}
                    onClick={() => setLinkModal(true)}
                  >
                    Link track
                  </Button>
                  {canAddTrackToThisApp ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
                      onClick={() => setShowTrackModal(true)}
                    >
                      New track
                    </Button>
                  ) : null}
                </div>
                ) : undefined
              }
            />
          ) : filteredTracks.length === 0 ? (
            <EmptyState
              icon={
                <IconWell size="lg" aria-hidden>
                  <Search size={22} strokeWidth={LINE_ICON_STROKE} />
                </IconWell>
              }
              title="No matching tracks"
              description="Try a different search term."
            />
          ) : (
            <>
              {primaryTracks.length > 0 && (
                <SortableTrackList
                  tracks={primaryTracks}
                  canAdmin={canAdmin}
                  appId={appId || ''}
                  app={app}
                  confirm={confirm}
                  showToast={showToast}
                  onReordered={(next) => {
                    // Optimistic: reorder the primary slice in place so
                    // the UI snaps to its new order before the server
                    // round-trip lands.
                    setTracks((prev) => {
                      const anchorSet = new Set(
                        prev.filter((t) => t.anchor_source).map((t) => t.id),
                      );
                      return [
                        ...next,
                        ...prev.filter((t) => anchorSet.has(t.id)),
                      ];
                    });
                    if (appId) {
                      appsApi
                        .reorderTracks(appId, next.map((t) => t.id))
                        .catch(() => {
                          showToast('Failed to save track order', 'error');
                          load();
                        });
                    }
                  }}
                  onChanged={load}
                />
              )}
              {anchorTracks.length > 0 && (
                <section
                  aria-labelledby="app-anchor-heading"
                  className={primaryTracks.length > 0 ? 'mt-8' : ''}
                >
                  <div className="mb-3 flex items-baseline justify-between gap-3 px-4">
                    <button
                      type="button"
                      id="app-anchor-heading"
                      onClick={() => setAnchorExpanded(v => !v)}
                      aria-expanded={anchorExpanded || trackSearch.length > 0}
                      className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-subtle)]/80 font-medium hover:text-[var(--text-muted)] transition-colors duration-fast inline-flex items-center gap-1.5"
                    >
                      <span aria-hidden className="inline-block w-2 text-center">
                        {anchorExpanded || trackSearch.length > 0 ? '▾' : '▸'}
                      </span>
                      Entry extensions
                    </button>
                    <span className="text-xs tabular-nums text-[var(--text-subtle)]/80">
                      {anchorTracks.length}{' '}
                      {anchorTracks.length === 1 ? 'track' : 'tracks'}
                    </span>
                  </div>
                  {(anchorExpanded || trackSearch.length > 0) && (
                    <ul>
                      {anchorTracks.map(t => (
                        <AppTrackRow
                          key={t.id}
                          track={t}
                          isAnchor
                          canAdmin={canAdmin}
                          appId={appId || ''}
                          app={app}
                          confirm={confirm}
                          showToast={showToast}
                          onChanged={load}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>

      </div>
      </PageSection>
      ) : (
        <PageSection className={filterBar.sectionTop}>
          <AppDashboardPanel
            appId={appId}
            appName={app?.name}
            canEdit={canEditDashboard}
            embedded
            onDashboardCreated={() => selectAppSection('dashboards')}
          />
        </PageSection>
      )}

      <TrackModal
        open={showTrackModal}
        onClose={() => setShowTrackModal(false)}
        appId={appId}
        onCreated={async () => {
          load();
        }}
      />

      <AppModal
        open={showEditAppModal}
        onClose={() => setShowEditAppModal(false)}
        editApp={app}
        onSaved={updated => {
          setApp(updated);
        }}
      />

      {appId && app ? (
        <AppSettingsModal
          open={showAppSettingsModal}
          appId={appId}
          appName={app.name}
          functionAccessWorkspaceId={isWorkspaceOwner ? app.workspace_id : undefined}
          onClose={() => setShowAppSettingsModal(false)}
          onSaved={() => {
            showToast('Settings saved', 'success');
          }}
        />
      ) : null}

      {/* Plan 08-04 — Derive library package from this App (SET-05). */}
      <DeriveLibraryPackageModal
        open={deriveModalOpen}
        onClose={() => setDeriveModalOpen(false)}
        sourceLabel={`App: ${app?.name ?? ''}`}
        onSubmit={async body => {
          if (!appId) return;
          await operationalModelsApi.deriveFromApp(appId, {
            ...body,
            workspace_id: app?.workspace_id,
          });
          queryClient.invalidateQueries({ queryKey: ['library'] });
          showToast('Template saved', 'success');
        }}
      />

      <Modal
        open={collaboratorsModalOpen}
        onClose={() => setCollaboratorsModalOpen(false)}
        title="Collaborators"
      >
        <Modal.Body className="space-y-5">
          {canManageCollaborators ? (
            <div className="space-y-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Add collaborators
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Search for a user by name or email, then add them as a commenter on this App.
                The workspace owner governs this App. Other workspace admins need explicit access to a
                Private App. Add collaborators here, then set Editor
                to allow editing entries in tracks, or Admin to manage tracks and app settings.
              </p>
              <UserSearchPicker
                excludeIds={excludeCollabIds}
                onSelect={addCollaborator}
                label="Search people"
              />
            </div>
          ) : (
            <p className="rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Only the <span className="font-medium text-[var(--text)]">app owner or an admin</span>{' '}
              can add people or change roles, along with the workspace owner. Other workspace
              admins need explicit access to a Private App.
            </p>
          )}

          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              People in this App
            </h3>
            <ul className="max-h-[min(50vh,320px)] space-y-1 overflow-y-auto pr-1">
              {uniqueCollabs.length === 0 ? (
                <li className="rounded-[var(--radius-input)] border border-dashed border-[var(--panel-border)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                  {collaboratorDirectoryVisible ? 'No one else has been added yet.' :
                    'Collaborator details are visible to the owner and admins.'}
                  {canManageCollaborators ? ' Use the search above to invite editors.' : ''}
                </li>
              ) : (
                uniqueCollabs.map(c => {
                  const rowKey = c.id || c.user_id || '';
                  const apiUserId = c.user_id || c.id || '';
                  const roleLower = (c.role || '').toLowerCase();
                  const isRowOwner = roleLower === 'owner';
                  const isSelf = me && apiUserId ? isSamePrincipal(me, apiUserId) : false;
                  const canMutateRow =
                    canManageCollaborators && !!apiUserId && !isRowOwner && !isSelf;
                  const canTransfer =
                    (isAppOwner || isWorkspaceOwner) && !!apiUserId && !isRowOwner && !isSelf;
                  // Substrate ladder (edges.py COLLABORATES_ON): owner > admin >
                  // editor > commenter > viewer. admin = App-config authority
                  // (cascades to template-tracks via DEFINES_TRACK_PROFILE);
                  // editor = entry CRUD only.
                  return (
                    <CollaboratorRow
                      key={rowKey}
                      avatar={
                        <Avatar
                          name={c.display_name || '?'}
                          size="xs"
                          attachmentId={c.avatar_attachment_id}
                          userId={c.id}
                          version={c.updated_at}
                        />
                      }
                      name={c.display_name || '—'}
                      meta={c.email}
                      role={c.role || ''}
                      readOnly={!canMutateRow && !canTransfer}
                      onChangeRole={
                        canMutateRow
                          ? (r: CollaboratorRole) =>
                              setCollaboratorRole(
                                apiUserId,
                                r as 'admin' | 'editor' | 'commenter' | 'viewer'
                              )
                          : undefined
                      }
                      onTransferOwnership={
                        canTransfer
                          ? () =>
                              transferOwnershipTo(
                                apiUserId,
                                c.display_name || undefined
                              )
                          : undefined
                      }
                      onRemove={
                        canMutateRow ? () => removeCollaborator(apiUserId) : undefined
                      }
                    />
                  );
                })
              )}
            </ul>
          </div>
        </Modal.Body>
        <Modal.Footer align="between">
          <Button variant="ghost" size="sm" onClick={() => {
            setCollaboratorsModalOpen(false);
            setAccessDetailsOpen(true);
          }}>Access details</Button>
          <Button variant="outline" size="sm" onClick={() => setCollaboratorsModalOpen(false)}>Done</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={accessDetailsOpen} onClose={() => setAccessDetailsOpen(false)} title="Access details">
        <Modal.Body>
          <Text variant="body-sm" tone="muted" as="p" className="mb-4">
            See who can use this App and manage their access.
          </Text>
          {accessDetailsOpen && <ResourceAccessReview resourceType="app" resourceId={appId} autoLoad people={uniqueCollabs} currentUser={me} />}
        </Modal.Body>
        <Modal.Footer align="between">
          <Button variant="ghost" size="sm" onClick={() => {
            setAccessDetailsOpen(false);
            setCollaboratorsModalOpen(true);
          }}>Back to collaborators</Button>
          <Button variant="outline" size="sm" onClick={() => setAccessDetailsOpen(false)}>Done</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={linkModal}
        onClose={() => {
          setLinkModal(false);
          setLinkModalSearch('');
        }}
        title="Link existing track"
      >
        <Modal.Body noSpacing className="flex flex-col gap-3">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={LINE_ICON_STROKE}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
              aria-hidden
            />
            <input
              value={linkModalSearch}
              onChange={e => setLinkModalSearch(e.target.value)}
              placeholder="Search tracks…"
              aria-label="Search tracks to link"
              autoFocus
              className="
                w-full pl-8 pr-3 py-2 text-sm
                rounded-[var(--radius-input)]
                bg-[var(--panel)] border border-[var(--panel-border)]
                text-[var(--text)] placeholder:text-[var(--text-subtle)]
                hover:border-[var(--text-subtle)]
                focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel-2)]
                transition-colors duration-fast
              "
            />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {linkableTracks.map(t => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left px-3 py-2 rounded-[var(--radius-input)] hover:bg-[var(--panel-2)] text-sm transition-colors duration-fast"
                onClick={() => linkTrack(t.id)}
              >
                {t.title}
              </button>
            ))}
            {tracksAvailableToLink.length === 0 && (
              <Text variant="body" tone="muted" as="p">
                No other tracks to link.
              </Text>
            )}
            {tracksAvailableToLink.length > 0 && linkableTracks.length === 0 && (
                <Text variant="body" tone="muted" as="p">
                  No tracks match your search.
                </Text>
              )}
          </div>
        </Modal.Body>
      </Modal>
    </PageShell>
  );
}

/** Single track row inside the App detail list. Extracted so primary
 *  and anchor (entry-extension) sections can share the same row
 *  markup — anchor rows replace the purpose/description caption with
 *  an "Extends *Entry* · field" line that names the originating Entry. */
interface AppTrackRowSortable {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
}

function AppTrackRow({
  track,
  isAnchor,
  canAdmin,
  appId,
  app,
  confirm,
  showToast,
  onChanged,
  sortable
}: {
  track: Track;
  isAnchor: boolean;
  canAdmin: boolean;
  appId: string;
  app?: App | null;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
  sortable?: AppTrackRowSortable;
}) {
  const { activeWorkspace } = useScope();
  const canDrag = !!sortable && canAdmin;
  const workspaceAccentColor = activeWorkspace?.accent_color;
  const trackHref = resolveDocumentTemplatesTrackHref(track, app ?? track.app ?? null);
  return (
    <li
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className={`group/row relative ${sortable?.isDragging ? 'opacity-60' : ''}`}
    >
      <Link
        to={trackHref}
        className="
          grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-[18px] min-h-20 items-center py-4 px-4
          border-b border-[var(--border-subtle)]
          group-last/row:border-b-0
          rounded-[2px]
          transition-colors duration-fast
          hover:bg-[var(--panel)]
        "
      >
        <div className="relative shrink-0 flex h-4 w-4 items-center justify-center">
          <TrackDot
            color={resolveIdentityColor(track.accent_color, workspaceAccentColor)}
            size="md"
            className={
              canDrag
                ? 'transition-opacity duration-fast group-hover/row:opacity-0'
                : ''
            }
            title={track.title}
          />
          {canDrag && sortable && (
            <button
              type="button"
              aria-label={`Reorder ${track.title}`}
              {...(sortable.attributes as React.HTMLAttributes<HTMLButtonElement>)}
              {...(sortable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
              onClick={(e) => e.preventDefault()}
              className="
                absolute inset-0 flex items-center justify-center
                text-[var(--text-subtle)] hover:text-[var(--text-muted)]
                opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100
                transition-opacity duration-fast
                cursor-grab active:cursor-grabbing
              "
            >
              <GripVertical size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-[var(--text)] truncate">
            {track.title}
          </p>
          {isAnchor && track.anchor_source ? (
            <p className="text-xs text-[var(--text-subtle)] mt-0.5 line-clamp-1">
              Extends{' '}
              <span className="text-[var(--text-muted)]">
                {track.anchor_source.entry_title || 'entry'}
              </span>
              {track.anchor_source.field_key
                ? ` · ${track.anchor_source.field_key}`
                : ''}
            </p>
          ) : track.purpose || track.description ? (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
              {track.purpose || track.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-subtle)] tabular-nums shrink-0">
          <span>
            {track.entry_count || 0}{' '}
            {(track.entry_count || 0) === 1 ? 'entry' : 'entries'}
          </span>
          <span aria-hidden>·</span>
          <span className="capitalize">{track.visibility}</span>
          {canAdmin ? (
            <>
              <span
                aria-hidden
                className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity duration-fast"
              >
                ·
              </span>
              <button
                type="button"
                className="text-[var(--text-subtle)] hover:text-[var(--danger-fg)] transition-colors duration-fast opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                onClick={async e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!appId) return;
                  const ok = await confirm({
                    title: 'Remove track from app',
                    message:
                      'Remove this track from the App? The track will still exist on your tracks list.',
                    confirmLabel: 'Remove',
                    variant: 'danger'
                  });
                  if (!ok) return;
                  try {
                    await appsApi.removeTrack(appId, track.id);
                    onChanged();
                  } catch {
                    showToast('Failed to remove', 'error');
                  }
                }}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** Phase 34 — drag-drop wrapper for the primary track list under an
 *  App. Renders an AppTrackRow per track inside a SortableContext;
 *  on drop, calls onReordered with the new ordering. Anchor (entry-
 *  extension) tracks are NOT reorderable — they live in a separate
 *  section and stay sorted by their auto-provisioned creation order. */
function SortableTrackList({
  tracks,
  canAdmin,
  appId,
  app,
  confirm,
  showToast,
  onReordered,
  onChanged
}: {
  tracks: Track[];
  canAdmin: boolean;
  appId: string;
  app?: App | null;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onReordered: (next: Track[]) => void;
  onChanged: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const ids = useMemo(() => tracks.map(t => t.id), [tracks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tracks.findIndex(t => t.id === active.id);
    const newIndex = tracks.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReordered(arrayMove(tracks, oldIndex, newIndex));
  };

  // Non-admin callers see static rows (no SortableContext overhead).
  if (!canAdmin) {
    return (
      <ul>
        {tracks.map(t => (
          <AppTrackRow
            key={t.id}
            track={t}
            isAnchor={false}
            canAdmin={canAdmin}
            appId={appId}
            app={app}
            confirm={confirm}
            showToast={showToast}
            onChanged={onChanged}
          />
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul>
          {tracks.map(t => (
            <SortableAppTrackRow
              key={t.id}
              track={t}
              canAdmin={canAdmin}
              appId={appId}
              app={app}
              confirm={confirm}
              showToast={showToast}
              onChanged={onChanged}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableAppTrackRow({
  track,
  canAdmin,
  appId,
  app,
  confirm,
  showToast,
  onChanged
}: {
  track: Track;
  canAdmin: boolean;
  appId: string;
  app?: App | null;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  usePhantomClickGuard(isDragging);
  return (
    <AppTrackRow
      track={track}
      isAnchor={false}
      canAdmin={canAdmin}
      appId={appId}
      app={app}
      confirm={confirm}
      showToast={showToast}
      onChanged={onChanged}
      sortable={{
        setNodeRef,
        style,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners,
        isDragging
      }}
    />
  );
}
