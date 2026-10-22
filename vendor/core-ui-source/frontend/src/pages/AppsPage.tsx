import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { usePhantomClickGuard } from '../hooks/usePhantomClickGuard';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, Package, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { appsApi, workspacesApi } from '../api';
import type { Workspace } from '../api/workspaces';
import { useToast } from '../context/ToastContext';
import {
  Button,
  EmptyState,
  Skeleton,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  filterBar,
  SearchRow,
  PageSearchInput,
} from '../components/ui';
import { AppModal } from '../components/apps/AppModal';
import { AppManagerDialog } from '../components/apps/AppManagerDialog';
import { PinButton } from '../components/sidebar/PinButton';
import { WorkspaceCreationRightsNotice } from '../components/collab/WorkspaceCreationRightsNotice';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useScope } from '../context/ScopeContext';
import { useWorkspaceCreationRights } from '../hooks/useWorkspaceCreationRights';
import type { App } from '../types';
import { AppIcon, Text } from '../ui';
import { formatRelativeTime, resolveIdentityColor } from '../utils';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { CHANGE_EVENT_APPLIED } from '../hooks/useChangeEventInvalidation';
import type { ActivityEvent } from '../utils/changeEvent';

export function AppsPage() {
  useSetCrumbs([{ label: 'Apps' }]);
  const { activeWorkspace, scope, workspaces = [] } = useScope();
  const workspaceId = scope?.workspaceId ?? activeWorkspace?.id;
  const { showToast } = useToast();
  const { canCreateApps, lacksAppCreationInOrg } = useWorkspaceCreationRights();
  const scopeLabel = activeWorkspace?.name?.trim() || 'Workspace';
  // Phase 36 — only allow drag-reorder when we're scoped to a single
  // workspace AND the caller has admin/owner rights (the backend
  // endpoint rejects everyone else). Outside a scoped workspace the
  // list spans multiple workspaces so a per-workspace position is
  // meaningless; render static rows instead.
  const canReorderApps =
    !!activeWorkspace?.id &&
    (activeWorkspace?.your_role === 'owner' ||
      activeWorkspace?.your_role === 'admin');
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePublishPageContext({
    pageKind: 'apps_list',
    metadata: {
      workspace_name: activeWorkspace?.name,
      app_count: hasLoaded ? apps.length : undefined,
      loading: !hasLoaded,
      // `visibleData` models entries and tracks only, so the app names ride
      // in metadata rather than being dropped.
      app_names: apps.map((a) => a.name).filter(Boolean).slice(0, 25),
    },
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [managerModal, setManagerModal] = useState(false);
  const managerRequested = searchParams.get('manage') === '1';
  const closeManager = () => { setManagerModal(false); if (managerRequested) { const next = new URLSearchParams(searchParams); next.delete('manage'); next.delete('package'); setSearchParams(next, { replace: true }); } };
  const [blankAppModal, setBlankAppModal] = useState(false);
  const [search, setSearch] = useState('');
  // Optimistic create can race an in-flight/change-event list that still
  // omits the new App. Keep the server-acked row until a list includes it.
  const pendingCreatedRef = useRef(new Map<string, App>());
  const workspaceRef = useRef(workspaceId);
  const loadSequence = useRef(0);

  useLayoutEffect(() => {
    workspaceRef.current = workspaceId;
    pendingCreatedRef.current.clear();
    setApps([]);
    setHasLoaded(false);
    setLoading(true);
  }, [workspaceId]);

  const load = useCallback(async () => {
    const workspaceId = workspaceRef.current;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      // The shared ScopeProvider already owns workspace discovery. Do not
      // block this list on a duplicate workspace request.
      const nextApps = await appsApi.list();
      if (workspaceRef.current !== workspaceId || loadSequence.current !== sequence) return;
      let next = nextApps;
      for (const pending of pendingCreatedRef.current.values()) {
        if (next.some(a => a.id === pending.id)) {
          pendingCreatedRef.current.delete(pending.id);
        } else {
          next = [pending, ...next];
        }
      }
      setApps(next);
      setHasLoaded(true);
    } catch (err) {
      if (workspaceRef.current !== workspaceId || loadSequence.current !== sequence) return;
      const e = err as { response?: { data?: { detail?: string } } };
      setError(String(e?.response?.data?.detail || 'Failed to load apps'));
      // Preserve this workspace's last successful list during a failed refresh.
    } finally {
      if (workspaceRef.current === workspaceId && loadSequence.current === sequence) {
        setLoading(false);
      }
    }
  }, []);

  // Refetch on workspace switch — /apps is scoped server-side via
  // X-Integral-Scope, so the active workspace decides what we receive.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Agent writes are published as governed ChangeEvents. This page keeps its
  // list in local state, so React Query invalidation alone cannot refresh a
  // page the user opened while an authorized build was materializing.
  useEffect(() => {
    const onChangeEvent = (event: Event) => {
      const detail = (event as CustomEvent<ActivityEvent>).detail;
      if (detail?.action?.startsWith('app.')) {
        void load();
      }
    };
    window.addEventListener(CHANGE_EVENT_APPLIED, onChangeEvent);
    return () => window.removeEventListener(CHANGE_EVENT_APPLIED, onChangeEvent);
  }, [load]);

  const q = search.trim().toLowerCase();
  const filteredApps = apps.filter(s => {
    if (!q) return true;
    const wsName = (workspaces.find(w => w.id === s.workspace_id)?.name || '').toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      wsName.includes(q)
    );
  });


  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <PageHeading>Apps</PageHeading>
            <PageMeta>
              <span>
                {hasLoaded ? `${apps.length} ${apps.length === 1 ? 'app' : 'apps'}` : 'Loading apps…'} in {scopeLabel}
              </span>
              <span aria-hidden>·</span>
              <span>Keep related work together in one app.</span>
            </PageMeta>
          </div>
          <div className="flex gap-2 shrink-0 self-start sm:self-end w-full sm:w-auto">
            {canCreateApps ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Package size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => setManagerModal(true)}
              >
                Manage apps
              </Button>
            ) : null}
          </div>
          <WorkspaceCreationRightsNotice
            resource="apps"
            show={lacksAppCreationInOrg}
            className="mt-2 sm:mt-0 sm:ml-auto sm:max-w-md sm:text-right"
          />
        </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className={filterBar.sectionTop}>
        <SearchRow>
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search apps…"
          />
        </SearchRow>

        {error && (
          <div
            className="mb-6 rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
            role="alert"
          >
            {error}
            <button type="button" className="ml-3 underline" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {loading && !hasLoaded ? (
          <div className="space-y-1">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !hasLoaded ? null : filteredApps.length === 0 ? (
          apps.length === 0 ? (
            <EmptyState
              surface="card"
              icon={
                <IconWell size="lg" aria-hidden>
                  <Layers size={22} strokeWidth={LINE_ICON_STROKE} />
                </IconWell>
              }
              title="No apps yet"
              description="Add an app to keep related work together, or ask Integral to help you set one up."
              action={
                canCreateApps ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Package size={14} strokeWidth={LINE_ICON_STROKE} />}
                    onClick={() => setManagerModal(true)}
                  >
                    Manage apps
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              surface="card"
              icon={
                <IconWell size="lg" aria-hidden>
                  <Layers size={22} strokeWidth={LINE_ICON_STROKE} />
                </IconWell>
              }
              title="No matching apps"
              description="Try a different search term."
            />
          )
        ) : (
          <SortableAppList
            apps={filteredApps}
            workspaces={workspaces}
            canReorder={canReorderApps}
            onReordered={(next) => {
              // Optimistic: snap UI to new order, then persist. On failure
              // reload to restore the canonical server order.
              setApps((prev) => {
                const visibleIds = new Set(next.map((a) => a.id));
                const tail = prev.filter((a) => !visibleIds.has(a.id));
                return [...next, ...tail];
              });
              if (activeWorkspace?.id) {
                workspacesApi
                  .reorderApps(activeWorkspace.id, next.map((a) => a.id))
                  .catch(() => {
                    showToast('Failed to save app order', 'error');
                    load();
                  });
              }
            }}
          />
        )}

      <AppManagerDialog
        isOpen={managerModal || managerRequested}
        initialDetailId={searchParams.get('package') || undefined}
        onClose={closeManager}
        apps={apps}
        onChanged={load}
        onCreateBlankApp={() => {
          closeManager();
          setBlankAppModal(true);
        }}
      />
      <AppModal
        open={blankAppModal}
        mode="blank"
        onClose={() => setBlankAppModal(false)}
        onSaved={sp => {
          if (sp.workspace_id !== workspaceRef.current) return;
          pendingCreatedRef.current.set(sp.id, sp);
          setApps(p => (p.some(a => a.id === sp.id) ? p : [sp, ...p]));
          setBlankAppModal(false);
        }}
      />
      </PageSection>
    </PageShell>
  );
}

/** Phase 36 — drag-drop wrapper for the Apps list inside a workspace.
 *  Hides the drag handle (and skips the DndContext entirely) when the
 *  user lacks admin/owner rights on the active workspace. */
function SortableAppList({
  apps,
  workspaces,
  canReorder,
  onReordered,
}: {
  apps: App[];
  workspaces: Workspace[];
  canReorder: boolean;
  onReordered: (next: App[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => apps.map(a => a.id), [apps]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = apps.findIndex(a => a.id === active.id);
    const newIndex = apps.findIndex(a => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReordered(arrayMove(apps, oldIndex, newIndex));
  };

  if (!canReorder) {
    return (
      <ul className="app-collection">
        {apps.map(app => (
          <AppListRow key={app.id} app={app} workspaces={workspaces} />
        ))}
      </ul>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="app-collection">
          {apps.map(app => (
            <SortableAppListRow key={app.id} app={app} workspaces={workspaces} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableAppListRow({ app, workspaces }: { app: App; workspaces: Workspace[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  usePhantomClickGuard(isDragging);
  return (
    <AppListRow
      app={app}
      workspaces={workspaces}
      sortable={{
        setNodeRef,
        style,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners,
        isDragging,
      }}
    />
  );
}

interface AppListRowSortable {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
}

function AppListRow({
  app,
  workspaces,
  sortable,
}: {
  app: App;
  workspaces: Workspace[];
  sortable?: AppListRowSortable;
}) {
  const wsName = app.workspace_id
    ? workspaces.find(w => w.id === app.workspace_id)?.name || 'Workspace'
    : null;
  return (
    <li
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className={`app-collection-row ${sortable?.isDragging ? 'opacity-60' : ''}`}
    >
      {sortable && (
        <button
          type="button"
          {...(sortable.attributes as React.HTMLAttributes<HTMLButtonElement>)}
          {...(sortable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
          aria-label={`Reorder ${app.name}`}
          className="app-reorder-handle"
        >
          <GripVertical size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </button>
      )}
      <Link to={`/apps/${app.id}`} className="app-collection-link">
        <AppIcon name={app.name} icon={app.icon} color={resolveIdentityColor(app.accent_color, workspaces.find(w => w.id === app.workspace_id)?.accent_color)} />
        <div className="min-w-0 flex-1">
          <Text as="p" variant="body" weight="medium" truncate>{app.name}</Text>
          {app.description && <Text as="p" variant="body-sm" tone="muted" className="mt-1 line-clamp-2">{app.description}</Text>}
          <Text as="p" variant="meta" className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
            <span>{wsName || 'Personal'}</span>
            {app.updated_at && <><span aria-hidden>·</span><span>Updated {formatRelativeTime(app.updated_at)}</span></>}
          </Text>
        </div>
      </Link>
      <PinButton kind="app" id={app.id} label={app.name} size="sm" />
    </li>
  );
}
