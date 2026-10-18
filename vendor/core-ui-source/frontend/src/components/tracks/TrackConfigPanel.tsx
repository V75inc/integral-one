import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  LayoutTemplate,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2
} from 'lucide-react';
import {
  tagsApi,
  entryTypesApi,
  trackViewsApi,
  operationalModelsApi
} from '../../api';
import { Button, KebabMenu, LINE_ICON_STROKE } from '../ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import {
  entryTypesForTrackQueryKey,
  tagsForTrackQueryKey,
  viewsForTrackQueryKey
} from '../../queryKeys';
import {
  isViewDesignerEnabled,
  ViewDesignerShell,
} from '../../features/view-designer';
import { SchemaSection } from './settings/SchemaSection';
import { ViewSettingsModal } from './ViewSettingsModal';
import { CreateViewPickerModal } from './CreateViewPickerModal';
import type { SavedView } from '../../types';
import { orderSavedViews } from '../../utils/savedViewTabs';

interface TrackConfigPanelProps {
  trackId: string;
  canEdit: boolean;
}

export function TrackConfigPanel({ trackId, canEdit }: TrackConfigPanelProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const entryTypesQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(trackId),
    queryFn: () => entryTypesApi.list({ track_id: trackId })
  });
  const entryTypes = useMemo(
    () => entryTypesQuery.data ?? [],
    [entryTypesQuery.data],
  );

  const tagsQuery = useQuery({
    queryKey: tagsForTrackQueryKey(trackId),
    queryFn: () => tagsApi.list({ track_id: trackId })
  });
  const tags = tagsQuery.data ?? [];

  const viewsQuery = useQuery({
    queryKey: viewsForTrackQueryKey(trackId),
    queryFn: () => trackViewsApi.list(trackId)
  });
  const views = useMemo(() => orderSavedViews(viewsQuery.data ?? []), [viewsQuery.data]);
  const [orderingViews, setOrderingViews] = useState(false);

  const loading =
    entryTypesQuery.isLoading || tagsQuery.isLoading || viewsQuery.isLoading;
  const loadError = tagsQuery.isError || viewsQuery.isError;

  useEffect(() => {
    if (loadError) {
      showToast('Failed to load track configuration', 'error');
    }
  }, [loadError, showToast]);

  // New item form state
  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6B7280');
  const [newType, setNewType] = useState('');
  const [createViewOpen, setCreateViewOpen] = useState(false);

  // Currently-edited view (drives ViewSettingsModal). `null` = closed.
  const [editingView, setEditingView] = useState<SavedView | null>(null);
  const [designingView, setDesigningView] = useState<SavedView | null>(null);
  const designerEnabled = isViewDesignerEnabled();

  // --- Actions ---

  const moveView = async (id: string, delta: number) => {
    if (orderingViews) return;
    const next = [...views];
    const index = next.findIndex(view => view.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrderingViews(true);
    try {
      for (const [position, view] of next.entries()) {
        await trackViewsApi.update(view.id, { config: { ...view.config, tab_order: position } });
      }
    } catch {
      showToast('Could not finish reordering views. Check their current order and retry.', 'error');
    } finally {
      await queryClient.invalidateQueries({ queryKey: viewsForTrackQueryKey(trackId) });
      setOrderingViews(false);
    }
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    try {
      await tagsApi.create({
        track_id: trackId,
        name: newTag.trim(),
        color: newTagColor
      });
      setNewTag('');
      await queryClient.invalidateQueries({
        queryKey: tagsForTrackQueryKey(trackId)
      });
      showToast('Tag created', 'success');
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed',
        'error'
      );
    }
  };

  const delTag = async (id: string) => {
    const ok = await confirm({
      title: 'Delete tag',
      message: 'Delete this tag? Entries that use it may lose the tag reference.',
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await tagsApi.delete(id);
      await queryClient.invalidateQueries({
        queryKey: tagsForTrackQueryKey(trackId)
      });
    } catch {
      showToast('Failed to delete tag', 'error');
    }
  };

  const addType = async () => {
    if (!newType.trim()) return;
    try {
      await operationalModelsApi.addEntryTypeToTrackProfile(trackId, {
        name: newType.trim().toLowerCase()
      });
      setNewType('');
      await queryClient.invalidateQueries({
        queryKey: entryTypesForTrackQueryKey(trackId)
      });
      showToast('Entry type added to profile', 'success');
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed',
        'error'
      );
    }
  };

  const removeView = async (id: string) => {
    const ok = await confirm({
      title: 'Remove view',
      message: 'Remove this saved view? This cannot be undone.',
      confirmLabel: 'Remove',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await operationalModelsApi.removeViewFromTrackProfile(trackId, id);
      await queryClient.invalidateQueries({
        queryKey: viewsForTrackQueryKey(trackId)
      });
      showToast('View removed', 'success');
    } catch {
      showToast('Failed to remove view', 'error');
    }
  };

  const setViewHidden = async (id: string, hidden: boolean) => {
    try {
      await trackViewsApi.update(id, { hidden });
      await queryClient.refetchQueries({
        queryKey: viewsForTrackQueryKey(trackId),
        exact: true
      });
      showToast(hidden ? 'View hidden from tabs' : 'View shown in tabs', 'success');
    } catch (e) {
      console.error('setViewHidden error', e);
      showToast(
        hidden ? 'Failed to hide view' : 'Failed to show view',
        'error'
      );
    }
  };

  const setDefaultView = async (id: string) => {
    try {
      await trackViewsApi.update(id, { is_default: true });
      // Force immediate refetch — invalidateQueries alone may not
      // trigger a refetch when the observer is already active in v5.
      await queryClient.refetchQueries({
        queryKey: viewsForTrackQueryKey(trackId),
        exact: true
      });
      showToast('Default view updated', 'success');
    } catch (e) {
      console.error('setDefaultView error', e);
      showToast('Failed to update default view', 'error');
    }
  };

  const handleDeriveToLibrary = async () => {
    const ok = await confirm({
      title: 'Publish to library',
      message: 'Create a new library Operational Model from this track\'s current configuration? This will be published as a platform operational model.',
      confirmLabel: 'Publish',
      variant: 'default'
    });
    if (!ok) return;
    try {
      const result = await operationalModelsApi.deriveFromTrack(trackId);
      showToast(`Profile "${result.operational_model?.name || 'Untitled'}" published to library`, 'success');
    } catch {
      showToast('Failed to publish operational model', 'error');
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="app-card p-4 text-sm text-[var(--text-muted)] animate-pulse">
        Loading configuration…
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Entry Types ─────────────────────────────── */}
      <section aria-label="Entry types">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] mb-2 px-0.5">
          Entry Types
        </p>
        {canEdit && (
          <div className="mb-3 grid gap-2">
            <input
              className="app-input min-w-0 text-xs"
              placeholder="New entry type name"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={addType} className="justify-self-start">
              <Plus size={12} /> Add type
            </Button>
          </div>
        )}
        <SchemaSection trackId={trackId} canEdit={canEdit} />
      </section>

      {/* ── Tags ───────────────────────────────────── */}
      <section aria-label="Tags">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] mb-2 px-0.5">
          Tags
        </p>
      <div className="app-card p-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map(tg => (
            <span
              key={tg.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border border-[var(--panel-border)]"
              style={{ borderColor: tg.color || undefined }}
            >
              {tg.name}
              {canEdit && (
                <button
                  type="button"
                  className="text-[var(--danger-fg)] hover:underline"
                  onClick={() => delTag(tg.id)}
                  aria-label={`Delete tag ${tg.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {tags.length === 0 && (
            <span className="text-xs text-[var(--text-muted)]">No tags yet</span>
          )}
        </div>
        {canEdit && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch gap-2">
            <input
              className="app-input min-w-0 text-xs"
              placeholder="New tag"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
            />
            <input
              type="color"
              className="w-10 rounded border border-[var(--panel-border)] cursor-pointer"
              style={{ height: '2.5625rem' }}
              value={newTagColor}
              onChange={e => setNewTagColor(e.target.value)}
              aria-label="Tag color"
            />
            <Button size="sm" variant="outline" onClick={addTag} className="self-stretch">
              <Plus size={12} /> Add
            </Button>
          </div>
        )}
      </div>
      </section>

      {/* ── Views ──────────────────────────────────── */}
      <section aria-label="Views">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] mb-2 px-0.5">
          Views
        </p>
      <div className="app-card p-4">
        <ul className="space-y-2 mb-3">
          {views.map(v => {
            // Inline default badge stays as a visual signal; every
            // action (Edit / Set default / Hide / Remove) is folded
            // into the per-row kebab so the row stays scannable even
            // as the set of view operations grows.
            const isProtected = v.is_default || v.type === 'feed';
            const menuItems = canEdit
              ? [
                  {
                    key: 'edit',
                    label: 'Edit configuration',
                    icon: (
                      <Pencil size={13} strokeWidth={LINE_ICON_STROKE} />
                    ),
                    onClick: () => setEditingView(v)
                  },
                  ...(designerEnabled
                    ? [
                        {
                          key: 'design',
                          label: 'Design layout',
                          icon: (
                            <LayoutTemplate
                              size={13}
                              strokeWidth={LINE_ICON_STROKE}
                            />
                          ),
                          onClick: () => setDesigningView(v)
                        },
                      ]
                    : []),
                  ...(v.is_default
                    ? []
                    : [
                        {
                          key: 'set-default',
                          label: 'Set as default',
                          icon: (
                            <Star size={13} strokeWidth={LINE_ICON_STROKE} />
                          ),
                          onClick: () => setDefaultView(v.id)
                        },
                      ]),
                  {
                    key: 'visibility',
                    label: v.hidden ? 'Show in tab strip' : 'Hide from tab strip',
                    icon: v.hidden ? (
                      <Eye size={13} strokeWidth={LINE_ICON_STROKE} />
                    ) : (
                      <EyeOff size={13} strokeWidth={LINE_ICON_STROKE} />
                    ),
                    onClick: () => setViewHidden(v.id, !v.hidden)
                  },
                  { key: 'move-earlier', label: 'Move earlier', disabled: orderingViews || views[0]?.id === v.id, onClick: () => void moveView(v.id, -1) },
                  { key: 'move-later', label: 'Move later', disabled: orderingViews || views[views.length - 1]?.id === v.id, onClick: () => void moveView(v.id, 1) },
                  ...(isProtected
                    ? []
                    : [
                        {
                          key: 'remove',
                          label: 'Remove view',
                          icon: (
                            <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />
                          ),
                          onClick: () => removeView(v.id),
                          danger: true,
                          dividerAbove: true
                        },
                      ]),
                ]
              : [];

            return (
              <li
                key={v.id}
                className="flex min-w-0 items-center justify-between gap-2 py-1 text-[13px]"
              >
                <span className="min-w-0 truncate">
                  {v.name}{' '}
                  <span className="text-[11px] text-[var(--text-muted)]">({v.type})</span>
                  {v.hidden && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                      hidden
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {v.is_default && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--link)]">
                      <Star
                        size={12}
                        strokeWidth={LINE_ICON_STROKE}
                        className="fill-current"
                      />
                      default
                    </span>
                  )}
                  {canEdit && menuItems.length > 0 && (
                    <KebabMenu
                      items={menuItems}
                      ariaLabel={`Actions for view ${v.name}`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setCreateViewOpen(true)}
            className="mt-2"
          >
            <Plus size={12} /> Add view
          </Button>
        )}
      </div>
      </section>

      {/* ── Configure ──────────────────────────────── */}
      <section aria-label="Configure">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] mb-2 px-0.5">
          Configure
        </p>
        <div className="space-y-3">
          {/* Publish to library */}
          {canEdit && (
            <div className="app-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-2 mb-2">
                <Package size={12} strokeWidth={LINE_ICON_STROKE} />
                Share to library
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Create a reusable library Operational Model from this track's current configuration.
              </p>
              <Button size="sm" variant="outline" onClick={handleDeriveToLibrary}>
                Publish to library
              </Button>
            </div>
          )}
        </div>
      </section>

      <ViewSettingsModal
        open={Boolean(editingView)}
        onClose={() => setEditingView(null)}
        view={editingView}
        trackId={trackId}
        entryTypes={entryTypes}
        onOpenDesigner={
          designerEnabled
            ? v => {
                setEditingView(null);
                setDesigningView(v);
              }
            : undefined
        }
      />

      <CreateViewPickerModal
        open={createViewOpen}
        onClose={() => setCreateViewOpen(false)}
        trackId={trackId}
        entryTypes={entryTypes}
        defaultAsFirst={views.length === 0}
        onCreated={async () => {
          await queryClient.invalidateQueries({
            queryKey: viewsForTrackQueryKey(trackId),
          });
        }}
      />

      {designerEnabled && (
        <ViewDesignerShell
          open={Boolean(designingView)}
          onClose={() => setDesigningView(null)}
          trackId={trackId}
          view={designingView}
          onSaved={saved => setDesigningView(saved)}
        />
      )}

    </div>
  );
}
