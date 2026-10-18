import { useState, useCallback, useRef, useEffect, useMemo} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entryTypesApi } from '../../../api/entryTypes';
import { operationalModelsApi } from '../../../api/operationalModels';
import type { OperationalModelFieldSpec, EntryTypeNode } from '../../../types';
import { useFieldEdit } from './hooks/useFieldEdit';
import { EntryTypeCard } from './EntryTypeCard';
import { FieldEditorPanel } from './FieldEditorPanel';
import { LibraryDivergenceBanner } from './LibraryDivergenceBanner';
import { notifyApiFailure } from '../../system/apiErrorNotifier';
import { useConfirm } from '../../../context/ConfirmContext';
import {
  entryTypesForTrackQueryKey,
  trackAttachedOperationalModelQueryKey,
} from '../../../queryKeys';

interface SchemaSectionProps {
  trackId: string;
  canEdit: boolean;
}

interface PanelState {
  open: boolean;
  mode: 'create' | 'edit';
  entryTypeId: string | null;
  fieldKey: string | null;
}

export function SchemaSection({ trackId, canEdit }: SchemaSectionProps) {
  const etQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(trackId),
    queryFn: () => entryTypesApi.list({ track_id: trackId }),
  });

  const cpQuery = useQuery({
    queryKey: trackAttachedOperationalModelQueryKey(trackId),
    queryFn: () => operationalModelsApi.getAttachedForTrack(trackId),
  });

  const { saveFields, setFieldsOptimistic, isSaving } = useFieldEdit(trackId);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [panel, setPanel] = useState<PanelState>({
    open: false,
    mode: 'create',
    entryTypeId: null,
    fieldKey: null,
  });
  const [pendingDelete, setPendingDelete] = useState<{
    entryTypeId: string;
    field: OperationalModelFieldSpec;
  } | null>(null);

  const entryTypes: EntryTypeNode[] = useMemo(
    () => etQuery.data ?? [],
    [etQuery.data],
  );
  const attachedCp = cpQuery.data;

  const targetEntryType = panel.entryTypeId
    ? entryTypes.find(et => et.id === panel.entryTypeId)
    : null;
  const initialField =
    panel.mode === 'edit' && targetEntryType && panel.fieldKey
      ? targetEntryType.form_schema?.fields?.find(f => f.key === panel.fieldKey) ?? null
      : null;
  const siblingKeys = targetEntryType
    ? (targetEntryType.form_schema?.fields ?? [])
        .map(f => f.key)
        .filter(k => (panel.mode === 'edit' && k === panel.fieldKey ? false : true))
    : [];

  const handleSave = useCallback(
    async (field: OperationalModelFieldSpec) => {
      if (!panel.entryTypeId || !targetEntryType) return;
      const existing = targetEntryType.form_schema?.fields ?? [];
      let nextFields: OperationalModelFieldSpec[];
      if (panel.mode === 'create') {
        const maxOrder = existing.reduce((m, f) => Math.max(m, f.order ?? 0), -1);
        nextFields = [...existing, { ...field, order: maxOrder + 1 }];
      } else {
        nextFields = existing.map(f => (f.key === field.key ? { ...f, ...field } : f));
      }
      try {
        await saveFields(panel.entryTypeId, nextFields);
        setPanel({ open: false, mode: 'create', entryTypeId: null, fieldKey: null });
      } catch (err) {
        notifyApiFailure(err, { context: 'Saving field' });
      }
    },
    [panel, targetEntryType, saveFields]
  );

  // Debounce reorder mutations (spec §6.5) — coalesce rapid drag-end events
  // into a single network round-trip after 300ms of inactivity.
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReorderRef = useRef<{
    entryTypeId: string;
    fields: OperationalModelFieldSpec[];
  } | null>(null);

  const flushReorder = useCallback(async () => {
    const pending = pendingReorderRef.current;
    if (!pending) return;
    pendingReorderRef.current = null;
    try {
      await saveFields(pending.entryTypeId, pending.fields);
    } catch (err) {
      notifyApiFailure(err, { context: 'Reordering fields' });
    }
  }, [saveFields]);

  const handleReorder = useCallback(
    (entryTypeId: string, nextFields: OperationalModelFieldSpec[]) => {
      // Sync entry popup / feed card immediately (shared entry-types cache).
      setFieldsOptimistic(entryTypeId, nextFields);
      pendingReorderRef.current = { entryTypeId, fields: nextFields };
      if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
      reorderTimerRef.current = setTimeout(() => {
        reorderTimerRef.current = null;
        void flushReorder();
      }, 300);
    },
    [flushReorder, setFieldsOptimistic]
  );

  // Flush any pending reorder on unmount so we don't lose user input.
  useEffect(() => {
    return () => {
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
        reorderTimerRef.current = null;
        void flushReorder();
      }
    };
  }, [flushReorder]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!pendingDelete) return;
    const et = entryTypes.find(e => e.id === pendingDelete.entryTypeId);
    if (!et) return;
    const nextFields = (et.form_schema?.fields ?? []).filter(
      f => f.key !== pendingDelete.field.key
    );
    try {
      await saveFields(pendingDelete.entryTypeId, nextFields);
      setPendingDelete(null);
      if (panel.fieldKey === pendingDelete.field.key) {
        setPanel({ open: false, mode: 'create', entryTypeId: null, fieldKey: null });
      }
    } catch (err) {
      notifyApiFailure(err, { context: 'Removing field' });
    }
  }, [pendingDelete, entryTypes, saveFields, panel.fieldKey]);

  const handleDeleteEntryType = useCallback(
    async (et: EntryTypeNode) => {
      const fieldCount = et.form_schema?.fields?.length ?? 0;
      const ok = await confirm({
        title: `Remove entry type "${et.name}"?`,
        message:
          fieldCount > 0
            ? `This entry type has ${fieldCount} field${fieldCount === 1 ? '' : 's'}. Existing entries of this type will lose their type assignment but their data will be preserved. This cannot be undone.`
            : `Existing entries of this type will lose their type assignment but their data will be preserved. This cannot be undone.`,
        confirmLabel: 'Remove',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await entryTypesApi.delete(et.id);
        await queryClient.invalidateQueries({
          queryKey: entryTypesForTrackQueryKey(trackId),
        });
        await queryClient.invalidateQueries({
          queryKey: trackAttachedOperationalModelQueryKey(trackId),
        });
      } catch (err) {
        notifyApiFailure(err, { context: 'Removing entry type' });
      }
    },
    [confirm, queryClient, trackId]
  );

  const handleDetach = useCallback(async () => {
    try {
      await operationalModelsApi.detachLibraryFromTrackProfile(trackId);
      await queryClient.invalidateQueries({
        queryKey: trackAttachedOperationalModelQueryKey(trackId),
      });
    } catch (err) {
      notifyApiFailure(err, { context: 'Detaching library' });
    }
  }, [trackId, queryClient]);

  const handleRevert = useCallback(async () => {
    const ok = await confirm({
      title: 'Revert to library schema',
      message:
        'Revert will discard custom fields, tags, and views on this track and re-apply the library schema. Continue?',
      confirmLabel: 'Revert',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await operationalModelsApi.revertTrackProfileCustomizations(trackId);
      await queryClient.invalidateQueries({
        queryKey: trackAttachedOperationalModelQueryKey(trackId),
      });
      await queryClient.invalidateQueries({
        queryKey: entryTypesForTrackQueryKey(trackId),
      });
    } catch (err) {
      notifyApiFailure(err, { context: 'Reverting customizations' });
    }
  }, [trackId, queryClient, confirm]);

  // I-SCHEMA-EDIT-ISOLATION-01 defensive guard — placed after all hooks to preserve hook ordering
  if (attachedCp?.library_package === true) {
    if (typeof console !== 'undefined') {
      console.error('SchemaSection refused to render against a library_package OperationalModel', attachedCp.id);
    }
    return null;
  }

  if (etQuery.isLoading) {
    return <div className="app-card p-4 text-sm text-[var(--text-muted)] animate-pulse">Loading schema…</div>;
  }

  return (
    <div className="space-y-3">
      {attachedCp?.library_merge_source_id ? (
        <LibraryDivergenceBanner
          libraryName={attachedCp.library_merge_source_name}
          onDetach={handleDetach}
          onRevert={handleRevert}
          disabled={!canEdit || isSaving}
        />
      ) : null}

      {entryTypes.length === 0 ? (
        <div className="app-card p-4 text-sm text-[var(--text-muted)]">
          No entry types on this track yet.
        </div>
      ) : (
        entryTypes.map(et => (
          <EntryTypeCard
            key={et.id}
            entryType={et}
            disabled={!canEdit || isSaving}
            onReorder={fields => handleReorder(et.id, fields)}
            onEditField={key =>
              setPanel({ open: true, mode: 'edit', entryTypeId: et.id, fieldKey: key })
            }
            onDeleteField={key => {
              const f = et.form_schema?.fields?.find(x => x.key === key);
              if (f) setPendingDelete({ entryTypeId: et.id, field: f });
            }}
            onAddField={() =>
              setPanel({ open: true, mode: 'create', entryTypeId: et.id, fieldKey: null })
            }
            onDeleteEntryType={canEdit && entryTypes.length > 1 && et.name.trim().toLowerCase() !== 'post' && et.form_schema?._manifest_entry_type_key !== 'post'
              ? () => handleDeleteEntryType(et) : undefined}
          />
        ))
      )}

      <FieldEditorPanel
        open={panel.open}
        mode={panel.mode}
        initial={initialField}
        siblingKeys={siblingKeys}
        onSave={handleSave}
        onCancel={() =>
          setPanel({ open: false, mode: 'create', entryTypeId: null, fieldKey: null })
        }
        onDelete={
          panel.mode === 'edit' && targetEntryType && initialField
            ? () => setPendingDelete({ entryTypeId: targetEntryType.id, field: initialField })
            : undefined
        }
        saving={isSaving}
      />

      {pendingDelete ? (
        <div
          role="alertdialog"
          aria-label="Confirm field removal"
          className="fixed inset-0 z-overlay-nested bg-black/40 flex items-center justify-center"
        >
          <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-lg shadow-xl p-5 max-w-sm w-full mx-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Remove field "{pendingDelete.field.name}"?
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Existing entry data for this field will be preserved on the entry but hidden from views.
              Re-adding a field with key <code className="font-mono">{pendingDelete.field.key}</code> will restore visibility.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border border-[var(--panel-border)] text-[var(--text)]"
                onClick={() => setPendingDelete(null)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-[var(--danger-fg)] text-white disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={isSaving}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
