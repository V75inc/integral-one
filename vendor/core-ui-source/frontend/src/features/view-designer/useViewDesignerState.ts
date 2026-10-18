import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { trackViewsApi } from '../../api';
import { viewsForTrackQueryKey } from '../../queryKeys';
import type { SavedView } from '../../types';
import {
  isLayoutContainerType,
  parseLayoutConfig,
  type LayoutContainerConfig,
  type LayoutMode,
  type RegionSpec,
} from './viewDesignerTypes';
import {
  addFormRegion,
  addViewRegion,
  layoutConfigToRecord,
  removeRegion,
  reorderRegions,
  setLayoutMode,
  setLayoutTitle,
  updateRegion,
  withRegions,
} from './regionReducers';
import { slugifyKey } from './viewDesignerTypes';

/** Keys that identify a saved view to ui_contributions / nested regions.
 *  Must survive layout designer saves. */
const VIEW_IDENTITY_KEYS = ['_manifest_view_key', 'view_type'] as const;

function pickIdentity(
  config: Record<string, unknown> | null | undefined,
  view?: SavedView | null
): Record<string, unknown> {
  const src = config || {};
  const out: Record<string, unknown> = {};
  for (const key of VIEW_IDENTITY_KEYS) {
    const val = src[key];
    if (val !== undefined && val !== null && String(val).trim()) {
      out[key] = typeof val === 'string' ? val.trim() : val;
    }
  }
  // Heal views that already lost _manifest_view_key (e.g. earlier designer saves).
  if (!out._manifest_view_key && view?.name) {
    const guessed = slugifyKey(view.name);
    if (guessed) out._manifest_view_key = guessed;
  }
  return out;
}

export type ViewDesignerStackEntry = {
  view: SavedView;
};

export type UseViewDesignerStateArgs = {
  trackId: string;
  rootView: SavedView | null;
  open: boolean;
};

export function useViewDesignerState({
  trackId,
  rootView,
  open,
}: UseViewDesignerStateArgs) {
  const queryClient = useQueryClient();
  const [stack, setStack] = useState<ViewDesignerStackEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [widgetConfig, setWidgetConfig] = useState<Record<string, unknown>>({});
  const [layoutConfig, setLayoutConfig] = useState<LayoutContainerConfig>({
    regions: [],
    mode: 'stack',
  });
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);
  const baselineRef = useRef<string>('');
  const identityRef = useRef<Record<string, unknown>>({});

  const activeView = stack[stack.length - 1]?.view ?? null;
  const isLayout = isLayoutContainerType(activeView?.type);

  const serializeDraft = useCallback(
    (view: SavedView | null, layout: LayoutContainerConfig, widget: Record<string, unknown>) => {
      if (!view) return '';
      const base = {
        ...((view.config || {}) as Record<string, unknown>),
        ...identityRef.current,
      };
      const config = isLayoutContainerType(view.type)
        ? layoutConfigToRecord(layout, base)
        : { ...widget, ...identityRef.current };
      return JSON.stringify({
        id: view.id,
        name: view.name,
        type: view.type,
        config,
      });
    },
    []
  );

  // Reset when opened / root changes.
  useEffect(() => {
    if (!open || !rootView) {
      setStack([]);
      setDirty(false);
      setSaveError(null);
      setSelectedRegionKey(null);
      identityRef.current = {};
      return;
    }
    setStack([{ view: rootView }]);
    const layout = parseLayoutConfig(rootView.config as Record<string, unknown>);
    setLayoutConfig(layout);
    setWidgetConfig({ ...(rootView.config || {}) });
    identityRef.current = pickIdentity(
      rootView.config as Record<string, unknown>,
      rootView
    );
    setSelectedRegionKey(layout.regions?.[0]?.key ?? null);
    setDirty(false);
    setSaveError(null);
    baselineRef.current = serializeDraft(
      rootView,
      layout,
      { ...(rootView.config || {}) }
    );
  }, [open, rootView?.id, serializeDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = useCallback(() => setDirty(true), []);

  const patchLayout = useCallback(
    (updater: (prev: LayoutContainerConfig) => LayoutContainerConfig) => {
      setLayoutConfig(prev => updater(prev));
      markDirty();
    },
    [markDirty]
  );

  const patchWidgetConfig = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setWidgetConfig(prev => updater(prev));
      markDirty();
    },
    [markDirty]
  );

  const draftConfig = useMemo(() => {
    if (!activeView) return {};
    if (isLayout) {
      return layoutConfigToRecord(layoutConfig, {
        ...((activeView.config || {}) as Record<string, unknown>),
        ...identityRef.current,
      });
    }
    return { ...widgetConfig, ...identityRef.current };
  }, [activeView, isLayout, layoutConfig, widgetConfig]);

  const draftView = useMemo((): SavedView | null => {
    if (!activeView) return null;
    return {
      ...activeView,
      track_id: trackId,
      config: draftConfig,
    };
  }, [activeView, draftConfig, trackId]);

  const regions = layoutConfig.regions || [];

  const actions = useMemo(
    () => ({
      selectRegion: (key: string | null) => setSelectedRegionKey(key),
      setMode: (mode: LayoutMode) =>
        patchLayout(c => setLayoutMode(c, mode)),
      setTitle: (title: string) => patchLayout(c => setLayoutTitle(c, title)),
      reorder: (from: number, to: number) =>
        patchLayout(c => withRegions(c, reorderRegions(c.regions || [], from, to))),
      remove: (key: string) => {
        patchLayout(c => withRegions(c, removeRegion(c.regions || [], key)));
        setSelectedRegionKey(prev => (prev === key ? null : prev));
      },
      update: (key: string, patch: Partial<RegionSpec>) =>
        patchLayout(c => withRegions(c, updateRegion(c.regions || [], key, patch))),
      addForm: (opts?: { title?: string; fields?: string[] }) => {
        patchLayout(c => {
          const next = addFormRegion(c.regions || [], opts);
          const added = next[next.length - 1];
          setSelectedRegionKey(added.key);
          return withRegions(c, next);
        });
      },
      addView: (opts: { view: string; title?: string }) => {
        patchLayout(c => {
          const next = addViewRegion(c.regions || [], opts);
          const added = next[next.length - 1];
          setSelectedRegionKey(added.key);
          return withRegions(c, next);
        });
      },
      setWidgetField: (key: string, value: unknown) =>
        patchWidgetConfig(prev => {
          const next = { ...prev };
          if (value === undefined) delete next[key];
          else next[key] = value;
          return next;
        }),
      setWidgetConfig: (next: Record<string, unknown>) =>
        patchWidgetConfig(() => next),
      drillInto: (view: SavedView) => {
        // Push current draft onto stack, then open child — save current first is caller's job.
        setStack(prev => [...prev, { view }]);
        const layout = parseLayoutConfig(view.config as Record<string, unknown>);
        setLayoutConfig(layout);
        setWidgetConfig({ ...(view.config || {}) });
        identityRef.current = pickIdentity(
          view.config as Record<string, unknown>,
          view
        );
        setSelectedRegionKey(layout.regions?.[0]?.key ?? null);
        setDirty(false);
        baselineRef.current = serializeDraft(view, layout, {
          ...(view.config || {}),
        });
      },
      popStack: () => {
        setStack(prev => {
          if (prev.length <= 1) return prev;
          const next = prev.slice(0, -1);
          const top = next[next.length - 1]?.view;
          if (top) {
            const layout = parseLayoutConfig(top.config as Record<string, unknown>);
            setLayoutConfig(layout);
            setWidgetConfig({ ...(top.config || {}) });
            identityRef.current = pickIdentity(
              top.config as Record<string, unknown>,
              top
            );
            setSelectedRegionKey(layout.regions?.[0]?.key ?? null);
            setDirty(false);
            baselineRef.current = serializeDraft(top, layout, {
              ...(top.config || {}),
            });
          }
          return next;
        });
      },
    }),
    [patchLayout, patchWidgetConfig, serializeDraft]
  );

  const save = useCallback(async () => {
    if (!activeView) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await trackViewsApi.update(activeView.id, {
        name: activeView.name,
        type: activeView.type,
        config: draftConfig,
      });
      // Prefer the draft we just saved for config — response normalize can
      // omit keys clients still need for contribution matching until refresh.
      const merged: SavedView = {
        ...activeView,
        ...updated,
        config: {
          ...((updated.config || {}) as Record<string, unknown>),
          ...draftConfig,
        },
      };
      queryClient.setQueryData(
        viewsForTrackQueryKey(trackId),
        (old: SavedView[] | undefined) => {
          if (!old?.length) return [merged];
          return old.map(v => (v.id === merged.id ? { ...v, ...merged } : v));
        }
      );
      await queryClient.invalidateQueries({
        queryKey: viewsForTrackQueryKey(trackId),
      });
      // Keep stack entry in sync with saved config.
      setStack(prev =>
        prev.map((entry, idx) =>
          idx === prev.length - 1 ? { view: merged } : entry
        )
      );
      baselineRef.current = serializeDraft(updated, layoutConfig, widgetConfig);
      setDirty(false);
      return true;
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string; message?: string } } })
          ?.response?.data?.detail ||
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (e as Error)?.message ||
        'Failed to save view';
      setSaveError(String(msg));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    activeView,
    draftConfig,
    layoutConfig,
    queryClient,
    serializeDraft,
    trackId,
    widgetConfig,
  ]);

  return {
    stack,
    activeView,
    draftView,
    isLayout,
    layoutConfig,
    widgetConfig,
    regions,
    selectedRegionKey,
    dirty,
    saving,
    saveError,
    actions,
    save,
  };
}
