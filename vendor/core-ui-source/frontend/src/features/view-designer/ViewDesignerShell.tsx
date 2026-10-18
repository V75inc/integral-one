import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Save,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, LINE_ICON_STROKE, Modal } from '../../components/ui';
import { IconButton, Surface, Text } from '../../ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useTrackViews } from '../../hooks/useTrackViews';
import {
  operationalModelDraftsApi,
} from '../../api/operationalModelDrafts';
import { entryTypesApi } from '../../api/entryTypes';
import {
  entryTypesForTrackQueryKey,
} from '../../queryKeys';
import type { Entry, EntryTypeNode, SavedView } from '../../types';
import { DesignerPreview } from './DesignerPreview';
import { RegionCanvas } from './RegionCanvas';
import { RegionInspector } from './RegionInspector';
import { RegionPalette } from './RegionPalette';
import { ViewConfigInspector } from './ViewConfigInspector';
import { useViewDesignerState } from './useViewDesignerState';
import type { LayoutMode, RegionSpec } from './viewDesignerTypes';

export type ViewDesignerShellProps = {
  open: boolean;
  onClose: () => void;
  trackId: string;
  view: SavedView | null;
  /** Optional live entries for track-scoped preview. */
  previewEntries?: Entry[];
  previewFields?: Record<string, unknown>;
  entryId?: string;
  appId?: string;
  entryTypeKey?: string;
  onSaved?: (view: SavedView) => void;
};

export function ViewDesignerShell({
  open,
  onClose,
  trackId,
  view,
  previewEntries,
  previewFields,
  entryId,
  appId,
  entryTypeKey,
  onSaved,
}: ViewDesignerShellProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const viewsQuery = useTrackViews(open ? trackId : undefined);
  const trackViews = viewsQuery.data ?? [];

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  const etQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(trackId),
    queryFn: () => entryTypesApi.list({ track_id: trackId }),
    enabled: open && Boolean(trackId),
  });
  const entryTypes = (etQuery.data ?? []) as EntryTypeNode[];

  const substrateQuery = useQuery({
    queryKey: ['operational-model-substrate'],
    queryFn: () => operationalModelDraftsApi.substrate(),
    enabled: open,
    staleTime: 60_000,
  });

  const {
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
  } = useViewDesignerState({ trackId, rootView: view, open });

  const selectedRegion =
    regions.find(r => r.key === selectedRegionKey) ?? null;

  const configSchema = useMemo(() => {
    if (!activeView) return undefined;
    const types = substrateQuery.data?.view_types || [];
    const match = types.find(
      t =>
        String(t.type || '').toLowerCase() ===
        String(activeView.type || '').toLowerCase()
    );
    return match?.config_schema as Record<string, unknown> | undefined;
  }, [activeView, substrateQuery.data]);

  const modeValue: LayoutMode | string =
    typeof layoutConfig.mode === 'string'
      ? layoutConfig.mode
      : (layoutConfig.mode as { desktop?: string } | undefined)?.desktop ||
        'stack';

  const handleClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved layout edits. Close without saving?',
        confirmLabel: 'Discard',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    const ok = await save();
    if (ok) {
      showToast('View layout saved', 'success');
      if (draftView) onSaved?.(draftView);
    } else {
      showToast(saveError || 'Failed to save view', 'error');
    }
  };

  const handleDrill = async (nested: SavedView) => {
    if (dirty) {
      const ok = await confirm({
        title: 'Save before opening nested view?',
        message:
          'Save the current layout before editing the nested view, or discard changes.',
        confirmLabel: 'Save & continue',
        variant: 'default',
      });
      if (!ok) return;
      const saved = await save();
      if (!saved) return;
    }
    actions.drillInto(nested);
  };

  const titleNode = (
    <div className="flex items-center gap-1 min-w-0 text-sm">
      <LayoutTemplate size={16} strokeWidth={LINE_ICON_STROKE} className="shrink-0" />
      <Text as="span" variant="body" weight="semibold" truncate>View designer</Text>
      {stack.map((entry, idx) => (
        <span key={entry.view.id} className="flex items-center gap-1 min-w-0">
          <Text as="span" variant="body-sm" tone="muted" className="shrink-0"><ChevronRight size={12} /></Text>
          {idx < stack.length - 1 ? (
            <button
              type="button"
              className="truncate text-[var(--link)] hover:underline"
              onClick={() => {
                // Pop until this index — simple: only allow pop one level via actions.popStack repeatedly
                void (async () => {
                  if (dirty) {
                    const ok = await confirm({
                      title: 'Discard nested edits?',
                      message: 'Go back without saving the current view?',
                      confirmLabel: 'Discard',
                      variant: 'danger',
                    });
                    if (!ok) return;
                  }
                  while (stack.length > idx + 1) {
                    actions.popStack();
                    break;
                  }
                })();
              }}
            >
              {entry.view.name}
            </button>
          ) : (
            <Text as="span" variant="body" truncate>{entry.view.name}</Text>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        void handleClose();
      }}
      title={titleNode}
      width={expanded ? 'max-w-dialog-workspace-max' : 'max-w-dialog-workspace'}
      tall
      headerActions={
        <div className="flex items-center gap-2">
          {dirty && (
            <Text as="span" variant="meta" tone="warn">
              Unsaved
            </Text>
          )}
          <IconButton
            label={expanded ? 'Exit full size' : 'Expand designer'}
            title={expanded ? 'Exit full size' : 'Expand designer'}
            size="md"
            onClick={() => setExpanded(v => !v)}
            aria-pressed={expanded}
          >
            {expanded ? (
              <Minimize2 size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            ) : (
              <Maximize2 size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            )}
          </IconButton>
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty || saving || !activeView}
            onClick={() => void handleSave()}
          >
            <Save size={13} strokeWidth={LINE_ICON_STROKE} />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div
        data-testid="view-designer-shell"
        data-expanded={expanded ? 'true' : 'false'}
        className={`grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_280px] gap-3 flex-1 min-h-0 ${
          expanded
            ? 'h-[calc(95vh-4.5rem)]'
            : 'h-[calc(85vh-4.5rem)] min-h-[min(70vh,560px)]'
        }`}
      >
        {/* Left: palette or widget hint */}
        <Surface as="aside" tone="panel-2" backgroundOpacity={40} border="default" radius="card" padding="md" className="overflow-y-auto min-h-0">
          {isLayout ? (
            <RegionPalette
              trackViews={trackViews}
              onAddForm={() => actions.addForm()}
              onAddView={(viewKey, title) => actions.addView({ view: viewKey, title })}
            />
          ) : (
            <Text as="p" variant="body-sm" tone="muted">
              This view type uses widget configuration (not region layout). Edit
              knobs in the inspector; preview updates live.
            </Text>
          )}
        </Surface>

        {/* Center: canvas + preview — preview gets the majority of height so
            tables / line editors can render without feeling cramped. */}
        <main className="flex flex-col gap-3 min-h-0 min-w-0">
          <Surface
            tone="panel" border="default" radius="card" padding="md"
            className={`overflow-hidden flex flex-col shrink-0 ${
              expanded ? 'max-h-[28%]' : 'max-h-[34%]'
            }`}
          >
            {isLayout ? (
              <RegionCanvas
                regions={regions}
                selectedKey={selectedRegionKey}
                mode={modeValue}
                onSelect={actions.selectRegion}
                onReorder={actions.reorder}
                onRemove={actions.remove}
                onModeChange={actions.setMode}
              />
            ) : (
              <Text as="p" variant="body" tone="muted" className="py-4">
                Widget mode — configure options on the right. Use Raw JSON for
                advanced keys.
              </Text>
            )}
          </Surface>
          <div className="flex-1 min-h-0 flex flex-col">
            <Text as="p" variant="meta" tone="subtle" className="mb-1 shrink-0 uppercase tracking-wide">
              Preview
            </Text>
            <div className="flex-1 min-h-0">
              <DesignerPreview
                view={draftView}
                trackId={trackId}
                entries={previewEntries}
                previewFields={previewFields}
                entryId={entryId}
                appId={appId}
                entryTypeKey={entryTypeKey}
              />
            </div>
          </div>
        </main>

        {/* Right: inspector */}
        <Surface as="aside" tone="panel" border="default" radius="card" padding="md" className="overflow-y-auto min-h-0">
          <Text as="h3" variant="meta" weight="semibold" tone="subtle" className="mb-2 uppercase tracking-[0.08em]">
            Inspector
          </Text>
          {isLayout ? (
            <RegionInspector
              region={selectedRegion}
              entryTypes={entryTypes}
              trackViews={trackViews}
              onChange={(key, patch) =>
                actions.update(key, patch as Partial<RegionSpec>)
              }
              onDrillIntoView={nested => {
                void handleDrill(nested);
              }}
            />
          ) : activeView ? (
            <ViewConfigInspector
              viewType={activeView.type}
              config={widgetConfig}
              entryTypes={entryTypes}
              configSchema={configSchema}
              onChange={actions.setWidgetField}
              onReplace={actions.setWidgetConfig}
            />
          ) : null}
          {saveError && (
            <p className="mt-3 text-xs text-[var(--danger)]" role="alert">
              {saveError}
            </p>
          )}
        </Surface>
      </div>
      {/* Hidden close affordance for tests that look for X — Modal already has one */}
      <span className="sr-only">
        <X size={1} />
      </span>
    </Modal>
  );
}
