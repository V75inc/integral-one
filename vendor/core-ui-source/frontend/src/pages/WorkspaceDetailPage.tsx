import { useDeployment } from '../hooks/useDeployment';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Users,
  LayoutGrid,
  Settings,
  Trash2,
} from 'lucide-react';
import { workspacesApi, appsApi, tracksApi } from '../api';
import {
  isOwnedPersonalWorkspace,
  type Workspace,
  workspaceAccessLabel,
  workspaceMembershipRoleLabel,
} from '../api/workspaces';
import {
  Avatar,
  Button,
  Skeleton,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
} from '../components/ui';
import { AvatarUploadControl } from '../components/ui/AvatarUploadControl';
import { StorageUsageBar } from '../components/workspace/StorageUsageBar';
import { EditWorkspaceModal } from '../components/workspace/EditWorkspaceModal';
import { LeaveWorkspaceButton } from '../components/workspace/LeaveWorkspaceButton';
import { useAuth } from '../context/AuthContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useScope } from '../context/ScopeContext';
import { invalidateWorkspaceListCaches } from '../queryKeys';
import type { App, Track } from '../types';
import { isSamePrincipal, resolveIdentityColor } from '../utils';
import { Text } from '../ui';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

export function WorkspaceDetailPage() {
  const { collaboration } = useDeployment();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const { scope, setScope, workspaces: scopeWorkspaces } = useScope();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [apps, setApps] = useState<App[]>([]);

  usePublishPageContext(
    workspaceId
      ? {
          pageKind: 'workspace_detail',
          metadata: { workspace_id: workspaceId, app_count: apps.length },
        }
      : null,
  );
  const [workspaceTracks, setWorkspaceTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isPersonal = workspace?.kind === 'personal';
  const isOwnedPersonal = isOwnedPersonalWorkspace(workspace);

  // Owner check must compare against BOTH ``user.id`` (User node id) and
  // ``user.user_id`` (auth principal id). Backend writes whichever one
  // it has, so a plain ``=== user.id`` misses org workspaces where the
  // stored ``owner_user_id`` is the auth principal form. Also accept
  // ``your_role === 'owner'`` as a fallback signal from the enriched
  // workspace payload.
  const isOwner = useMemo(() => {
    if (!workspace || !user) return false;
    if (isSamePrincipal(user, workspace.owner_user_id)) return true;
    return workspace.your_role === 'owner';
  }, [workspace, user]);

  // Avatar upload is permitted for workspace owner, admin members, and
  // implicitly the only user on a personal workspace. Mirrors backend
  // permission (owner OR admin).
  const canEditAvatar = useMemo(() => {
    if (!workspace) return false;
    if (isOwner) return true;
    return workspace.your_role === 'admin';
  }, [workspace, isOwner]);

  // Settings (edit) allowed for owner or admin
  const canEditSettings = useMemo(() => {
    if (!workspace) return false;
    if (isOwner) return true;
    return workspace.your_role === 'admin';
  }, [workspace, isOwner]);

  const ownedPersonalCount = useMemo(
    () =>
      scopeWorkspaces.filter(
        w => w.kind === 'personal' && w.your_role === 'owner',
      ).length,
    [scopeWorkspaces],
  );

  // Owner may delete any workspace except their last personal one.
  const canDelete = useMemo(() => {
    if (!workspace || !isOwner) return false;
    if (workspace.kind === 'personal') {
      return ownedPersonalCount > 1;
    }
    return true;
  }, [workspace, isOwner, ownedPersonalCount]);

  const deleteBlockedReason = useMemo(() => {
    if (!workspace || !isOwner || canDelete) return null;
    if (workspace.kind === 'personal' && ownedPersonalCount <= 1) {
      return 'You must keep at least one personal workspace.';
    }
    return null;
  }, [workspace, isOwner, canDelete, ownedPersonalCount]);

  useSetCrumbs(
    workspace
      ? [{ label: workspace.name?.trim() || 'Untitled workspace' }]
      : [{ label: 'Loading…' }]
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [ws, allApps, allTracks] = await Promise.all([
        workspacesApi.get(workspaceId),
        appsApi.list(),
        tracksApi.list({ limit: 100 }),
      ]);
      setWorkspace(ws);
      setApps(allApps.filter(s => s.workspace_id === workspaceId));
      setWorkspaceTracks(
        (allTracks as Track[]).filter(t => t.workspace_id === workspaceId)
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed to load workspace';
      setError(String(msg));
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep global scope aligned with the workspace we're viewing so Apps
  // (and other scoped surfaces) list the correct workspace.
  useEffect(() => {
    const wid = workspace?.id || '';
    if (!wid) return;
    setScope({ workspaceId: wid });
  }, [workspaceId, workspace?.id, setScope]);

  const openAppsInWorkspace = useCallback(() => {
    if (!workspace?.id) return;
    if (scope?.workspaceId !== workspace.id) {
      setScope({ workspaceId: workspace.id });
    }
    navigate('/apps');
  }, [workspace?.id, scope?.workspaceId, setScope, navigate]);

  const openEditModal = useCallback(() => {
    setEditError(null);
    setShowEditModal(true);
  }, []);

  const handleEditSave = useCallback(
    async (body: {
      name: string;
      description?: string;
      accent_color?: string;
    }) => {
      if (!workspaceId) return;
      setEditSaving(true);
      setEditError(null);
      try {
        const updated = await workspacesApi.update(workspaceId, body);
        setWorkspace(updated);
        qc.setQueryData<Workspace[]>(['workspaces'], old =>
          (old ?? []).map(item => item.id === updated.id ? updated : item),
        );
        await invalidateWorkspaceListCaches(qc);
        setShowEditModal(false);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || 'Failed to save changes';
        setEditError(String(msg));
      } finally {
        setEditSaving(false);
      }
    },
    [workspaceId, qc],
  );

  const handleDelete = useCallback(async () => {
    if (!workspaceId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await workspacesApi.delete(workspaceId);
      qc.setQueryData<Workspace[]>(['workspaces'], old =>
        (old ?? []).filter(w => w.id !== workspaceId),
      );
      await invalidateWorkspaceListCaches(qc);
      if (scope?.workspaceId === workspaceId) {
        const remaining =
          qc.getQueryData<Workspace[]>(['workspaces']) ?? [];
        const personal = remaining.find(w => w.kind === 'personal');
        const fallback = personal ?? remaining[0];
        if (fallback) {
          setScope({ workspaceId: fallback.id });
        }
      }
      navigate('/');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed to delete workspace';
      setDeleteError(String(msg));
      setDeleting(false);
    }
  }, [workspaceId, navigate, qc, scope?.workspaceId, setScope]);

  if (loading && !workspace) {
    return (
      <div className="w-full px-4 md:px-6 py-8 space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="max-w-xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
        <p className="text-[var(--text-muted)]">{error || 'Workspace not found.'}</p>
        <Link to="/workspaces" className="text-[var(--link)] hover:text-[var(--link-hover)] text-sm mt-4 inline-block">
          ← All workspaces
        </Link>
      </div>
    );
  }

  return (
    <PageShell>
      <PageSection>
      <header className="mb-8 md:mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          {/* Workspace logo — Facebook-style upload control when the
              viewer is the owner (backend also permits admin members).
              Non-owners see a plain Avatar. */}
          {canEditAvatar ? (
            <AvatarUploadControl
              target={{ kind: 'workspace', id: workspace.id }}
              avatar={{
                name: workspace.name || 'Workspace',
                size: 'xl',
                url: workspace.avatar_url || undefined,
                version: workspace.updated_at,
                ringVariant: 'none',
                accentColor: workspace.accent_color,
              }}
              onUploaded={load}
              buttonLabel="Change workspace logo"
            />
          ) : (
            <Avatar
              name={workspace.name || 'Workspace'}
              size="xl"
              url={workspace.avatar_url || undefined}
              ringVariant="none"
              accentColor={workspace.accent_color}
            />
          )}
          <div className="min-w-0 flex-1">
            <PageHeading accentColor={workspace.accent_color} accentLabel={workspace.name}>
              {workspace.name}
            </PageHeading>
            <PageMeta>
              <span>{apps.length} {apps.length === 1 ? 'app' : 'apps'}</span>
              <span aria-hidden>·</span>
              <span>{workspaceTracks.length} {workspaceTracks.length === 1 ? 'track' : 'tracks'}</span>
              <span aria-hidden>·</span>
              <span>
                {isOwnedPersonal
                  ? 'Personal workspace'
                  : isPersonal
                    ? `${workspaceAccessLabel(workspace)} workspace`
                    : `Your role · ${workspaceMembershipRoleLabel(workspace)}`}
              </span>
            </PageMeta>
            {isPersonal && !isOwner ? (
              <PageMeta as="p">
                You were invited to this workspace.
              </PageMeta>
            ) : workspace.description ? (
              <PageMeta as="p">
                {workspace.description}
              </PageMeta>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!isPersonal && collaboration ? (
            <Link to={`/workspaces/${workspace.id}/members`}>
              <Button
                variant="outline"
                size="sm"
                icon={<Users size={14} strokeWidth={LINE_ICON_STROKE} />}
              >
                Invite people
              </Button>
            </Link>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            icon={<LayoutGrid size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={openAppsInWorkspace}
          >
            Apps
          </Button>
          {canEditSettings && (
            <Button
              variant="outline"
              size="sm"
              icon={<Settings size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={openEditModal}
            >
              Settings
            </Button>
          )}
          {!isOwner && (
            <LeaveWorkspaceButton workspace={workspace} redirectTo="/" />
          )}
        </div>
      </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className="mt-8" innerClassName="space-y-10">
      {error && (
        <div
          className="rounded-[var(--radius-card)] border border-[color:var(--warn-fg)]/30 bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-fg)]"
          role="status"
        >
          {error}{' '}
          <button type="button" className="underline ml-2" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!isPersonal ? (
        <section>
          <h2 className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium mb-4">
            Storage
          </h2>
          <StorageUsageBar workspaceId={workspace.id} />
        </section>
      ) : null}

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium">
            Apps in this workspace
          </h2>
          <button
            type="button"
            onClick={openAppsInWorkspace}
            className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors duration-fast"
          >
            Manage apps →
          </button>
        </div>
        {apps.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--collection-border)] bg-[var(--panel)] px-4 py-6 text-sm text-[var(--text-muted)]">
            No apps here yet. Add one from the Apps page to bring related work together.
          </p>
        ) : (
          <ul className="collection-list">
            {apps.map(s => (
              <li key={s.id}>
                <Link
                  to={`/apps/${s.id}`}
                  className="
                    grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-[18px] py-3
                    border-b border-[var(--border-subtle)] last:border-b-0
                    px-4 rounded-[2px]
                    transition-colors duration-fast
                    hover:bg-[var(--panel-2)]
                  "
                >
                  <span
                    aria-hidden
                    className="block w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                    style={{
                      backgroundColor:
                        resolveIdentityColor(s.accent_color, workspace?.accent_color) || 'var(--brand-accent)',
                      opacity: resolveIdentityColor(s.accent_color, workspace?.accent_color) ? 1 : 0.55,
                    }}
                  />
                  <span className="text-[15px] font-medium text-[var(--text)] truncate">
                    {s.name}
                  </span>
                  <span aria-hidden className="text-[var(--text-subtle)] pt-0.5">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium mb-4">
          Tracks in this workspace
        </h2>
        {workspaceTracks.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--collection-border)] bg-[var(--panel)] px-4 py-6 text-sm text-[var(--text-muted)]">
            No tracks here yet. Create a track to keep updates together.
          </p>
        ) : (
          <ul className="collection-list">
            {workspaceTracks.map(t => (
              <li key={t.id}>
                <Link
                  to={`/tracks/${t.id}`}
                  className="
                    grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] py-3
                    border-b border-[var(--border-subtle)] last:border-b-0
                    px-4 rounded-[2px]
                    transition-colors duration-fast
                    hover:bg-[var(--panel-2)]
                  "
                >
                  <span
                    aria-hidden
                    className="block w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                    style={{
                      backgroundColor:
                        resolveIdentityColor(t.accent_color, workspace?.accent_color) || 'var(--brand-accent)',
                      opacity: resolveIdentityColor(t.accent_color, workspace?.accent_color) ? 1 : 0.55,
                    }}
                  />
                  <span className="text-[15px] font-medium text-[var(--text)] truncate">
                    {t.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone — delete workspace (owners; last personal workspace protected) */}
      {(canDelete || deleteBlockedReason) && (
        <section>
          <h2 className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium mb-4">
            Danger zone
          </h2>
          <div className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg,#ef4444)]/30 bg-[var(--danger-bg,#fef2f2)] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--danger-fg,#b91c1c)]">
                Delete this workspace
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {deleteBlockedReason ??
                  'Permanently removes the workspace and all its contents. This cannot be undone.'}
              </p>
            </div>
            {canDelete ? (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => {
                  setDeleteConfirmText('');
                  setDeleteError(null);
                  setShowDeleteConfirm(true);
                }}
              >
                Delete workspace
              </Button>
            ) : null}
          </div>
        </section>
      )}
      </PageSection>

      {/* ── Edit Workspace Modal ─────────────────────────────────── */}
      <EditWorkspaceModal
        open={showEditModal}
        workspace={workspace}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditSave}
        saving={editSaving}
        error={editError}
      />

      {/* ── Delete Confirmation Modal ────────────────────────────── */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-overlay flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm workspace deletion"
          onClick={e => { if (e.target === e.currentTarget && !deleting) setShowDeleteConfirm(false); }}
        >
          <div className="bg-[var(--surface)] rounded-[var(--radius-dialog,12px)] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger-bg,#fef2f2)]">
                <Trash2 size={15} className="text-[var(--danger-fg,#b91c1c)]" strokeWidth={LINE_ICON_STROKE} />
              </span>
              <div>
                <Text variant="heading-md" weight="semibold" as="h2">
                  Delete workspace?
                </Text>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  This will permanently delete <strong className="font-medium">{workspace.name}</strong> and all of its apps, tracks, and entries. This action cannot be undone.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="ws-delete-confirm"
                className="block text-xs font-medium text-[var(--text-subtle)] mb-1.5"
              >
                Type <strong className="font-medium text-[var(--text)]">{workspace.name}</strong> to confirm
              </label>
              <input
                id="ws-delete-confirm"
                type="text"
                className="
                  w-full rounded-[var(--radius-input,6px)] border border-[var(--border)]
                  bg-[var(--input-bg,var(--surface))] px-3 py-2 text-sm text-[var(--text)]
                  placeholder:text-[var(--text-subtle)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--danger-fg,#ef4444)]/40
                  disabled:opacity-50
                "
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                disabled={deleting}
                placeholder={workspace.name}
                autoFocus
              />
            </div>

            {deleteError && (
              <p className="text-xs text-[var(--danger-fg,#b91c1c)]" role="alert">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || deleteConfirmText !== workspace.name}
              >
                {deleting ? 'Deleting…' : 'Delete workspace'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
