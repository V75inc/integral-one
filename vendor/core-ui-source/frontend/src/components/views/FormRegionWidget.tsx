import { useCallback, useEffect, useMemo, useState } from 'react';
import { useContributionLifecycle } from '../entries/contributionLifecycle';
import { SeamlessField } from '../entries/SeamlessField';
import type { RelationChoice } from '../entries/EntryFormExpanded';
import { slug } from '../entries/entryFormCustomFields';
import { appsApi, entriesApi, entryTypesApi, tracksApi } from '../../api';
import { extensionsApi, requireOperationOutput } from '../../api/extensions';
import { toolsApi } from '../../api/tools';
import { useToast } from '../../context/ToastContext';
import { Surface } from '../../ui/Surface';
import { Text } from '../../ui/Text';
import { deriveAutoOffsetPatch } from '../../utils/fieldDateOffset';
import { patchFromAppSettings } from '../../utils/fieldSettingDefaults';
import { deriveRelationLabelPatch } from '../../utils/relationFieldSync';
import {
  fieldEntryEditableInDetail,
  fieldEntryKey,
  fieldEntryVisibleIf,
  isVisible,
  useLiveValues,
  type ConditionalFieldEntry,
} from './regionConditions';
import type { ViewWidgetProps } from './types';
import type { OperationalModelFieldSpec, Entry, EntryTypeNode } from '../../types';

/**
 * Config-driven subset-of-fields form region — the reusable Oracle-APEX-
 * style "Form" region. Always-editable inline (no separate view/edit mode),
 * built on ``SeamlessField`` (the same per-field-type renderer the entry
 * composer uses), so every field type renders with its normal editor with
 * zero new per-type code.
 *
 * Widget config (``view.config``): ``{fields: ConditionalFieldEntry[], title?,
 * columns?}``. Each field entry is either a bare key (always shown) or
 * ``{key, visible_if: {field, equals}}`` to gate that ONE field on another
 * field's current value on the same target entry — e.g. Period 2-5 date
 * fields only shown when ``schedule_type`` is "Weekly", Period 1 always
 * shown. See ``regionConditions.ts`` (shared with LayoutContainerWidget's
 * region-level gate and EditableTableWidget's per-column gate).
 *
 * Bind mode (``view.config.__bindings``, forwarded from
 * ``related_views[].bind`` by ``RelatedViewsSection``/``ComposableViewSlot``)
 * selects WHICH entry the fields are read from and persisted to:
 *
 *   - Under ``ContributionLifecycleContext`` with mode ``create``|``edit`` —
 *     bind to the host EntryForm draft (``lifecycle.customFields`` /
 *     ``onDraftPatch``) so compose-time document shells work without an
 *     entry id yet. Skip entriesApi get/update in that mode.
 *
 *   - ``{entry: 'self'}`` (default) — the host entry itself
 *     (``bindings.entryId``). Fetched directly via ``entriesApi.get`` (the
 *     widget does not trust a possibly-stale/filtered ``entries`` prop),
 *     persisted via ``entriesApi.update`` on change — same self-persisting
 *     shape as ``EditableTableWidget.commitCell``.
 *   - ``{entry: 'tool', tool, input_field}`` — a related entry resolved by
 *     calling the named workspace tool (``POST /api/tools/{tool}``) with
 *     ``{[input_field]: bindings.entryId}``. Expects the tool's JSON output
 *     to include ``entry_id`` (editable) and/or ``custom_fields`` (fallback
 *     read-only display when no ``entry_id`` is returned).
 *   - ``{entry: 'anchored'}`` — the first entry already fetched by
 *     ``ComposableViewSlot`` for this view (``entries[0]``), used when
 *     ``form_region`` itself is placed via a ``:anchored_track/...``
 *     related_views reference.
 */
export function FormRegionWidget({ view, entries, isLoading }: ViewWidgetProps) {
  const { showToast } = useToast();
  const lifecycle = useContributionLifecycle();
  const draftBound =
    Boolean(lifecycle?.onDraftPatch) &&
    (lifecycle?.mode === 'create' || lifecycle?.mode === 'edit');
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const bindMode = typeof bindings.entry === 'string' ? bindings.entry : 'self';
  const bindTool = typeof bindings.tool === 'string' ? bindings.tool : undefined;
  const bindInputField =
    typeof bindings.input_field === 'string' ? bindings.input_field : 'entry_id';
  const hostEntryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;

  const fieldEntries = useMemo<ConditionalFieldEntry[]>(
    () => (Array.isArray(config.fields) ? (config.fields as ConditionalFieldEntry[]) : []),
    [config.fields]
  );
  const fieldKeys = useMemo<string[]>(() => fieldEntries.map(fieldEntryKey), [fieldEntries]);
  const title = typeof config.title === 'string' ? config.title : undefined;
  const columns = typeof config.columns === 'number' ? config.columns : 1;

  const [entryTypes, setEntryTypes] = useState<EntryTypeNode[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  /** Fields locked because App settings auto-generate is on (preview_default_tool). */
  const [autoLockedKeys, setAutoLockedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadingTypes(true);
    entryTypesApi
      .list({ track_id: view.track_id })
      .then(types => {
        if (!cancelled) setEntryTypes(types);
      })
      .catch(() => {
        if (!cancelled) setEntryTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view.track_id]);

  const activeEntryType = useMemo<EntryTypeNode | undefined>(() => {
    if (!entryTypes.length) return undefined;
    const wantKey = view.default_entry_type_key;
    if (wantKey) {
      const byManifestKey = entryTypes.find(
        et => et.form_schema?._manifest_entry_type_key === wantKey
      );
      if (byManifestKey) return byManifestKey;
    }
    return entryTypes[0];
  }, [entryTypes, view.default_entry_type_key]);

  const allFields = useMemo<OperationalModelFieldSpec[]>(
    () => activeEntryType?.form_schema?.fields ?? [],
    [activeEntryType]
  );
  const fieldByKey = useMemo(() => {
    const out = new Map<string, OperationalModelFieldSpec>();
    for (const f of allFields) out.set(f.key, f);
    return out;
  }, [allFields]);
  const fieldVisibleIfByKey = useMemo(() => {
    const out = new Map<string, ReturnType<typeof fieldEntryVisibleIf>>();
    for (const entry of fieldEntries) out.set(fieldEntryKey(entry), fieldEntryVisibleIf(entry));
    return out;
  }, [fieldEntries]);
  const editableInDetailKeys = useMemo(() => {
    const out = new Set<string>();
    for (const entry of fieldEntries) {
      if (fieldEntryEditableInDetail(entry)) out.add(fieldEntryKey(entry));
    }
    return out;
  }, [fieldEntries]);
  const displayFields = useMemo<OperationalModelFieldSpec[]>(() => {
    if (!fieldKeys.length) return allFields;
    return fieldKeys
      .map(k => fieldByKey.get(k))
      .filter((f): f is OperationalModelFieldSpec => Boolean(f));
  }, [fieldKeys, allFields, fieldByKey]);

  // Relation-typed fields need choices — same trimmed port of
  // EditableTableWidget's relation-choices effect (itself ported from
  // EntryFormExpanded.tsx).
  const [relationChoices, setRelationChoices] = useState<
    Record<string, RelationChoice[]>
  >({});
  const [relationLoading, setRelationLoading] = useState(false);
  const relationFieldsFetchSig = displayFields
    .filter(f => f.type === 'relation')
    .map(f => `${f.key}:${JSON.stringify(f.relation ?? {})}`)
    .join('\x1e');

  useEffect(() => {
    const relationFields = displayFields.filter(f => f.type === 'relation');
    if (!relationFields.length) {
      setRelationChoices(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    setRelationLoading(true);
    (async () => {
      try {
        const allTracks = await tracksApi.list();
        const choicesByField: Record<string, RelationChoice[]> = {};
        await Promise.all(
          relationFields.map(async relField => {
            const relation = relField.relation || {};
            const allowCrossTrack = Boolean(relation.allow_cross_track);
            const targetEntryTypes = new Set(
              (relation.target_entry_types || []).map(x => slug(String(x)))
            );
            const targetTrackTypes = new Set(
              (relation.target_track_types || []).map(x => slug(String(x)))
            );
            const candidateTracks = allowCrossTrack
              ? allTracks.filter(t => {
                  if (!targetTrackTypes.size) return true;
                  const typeKey = slug(String(t.template_id || t.relation_type_key || t.title));
                  return targetTrackTypes.has(typeKey);
                })
              : allTracks.filter(t => t.id === view.track_id);
            const entryLists = await Promise.all(
              candidateTracks.map(async t => {
                try {
                  const es = await entriesApi.list({ track_id: t.id, limit: 200 });
                  return { track: t, entries: es };
                } catch {
                  return { track: t, entries: [] };
                }
              })
            );
            const deduped = new Map<string, RelationChoice>();
            for (const group of entryLists) {
              for (const item of group.entries) {
                if (
                  targetEntryTypes.size &&
                  !targetEntryTypes.has(slug(String(item.type)))
                ) {
                  continue;
                }
                const primary =
                  String(item.title || '').trim() ||
                  String(item.body || '').trim().slice(0, 80) ||
                  `Entry ${item.id.slice(-6)}`;
                deduped.set(item.id, {
                  value: item.id,
                  label: `${primary} (${group.track.title})`,
                });
              }
            }
            choicesByField[relField.key] = Array.from(deduped.values());
          })
        );
        if (!cancelled) setRelationChoices(choicesByField);
      } finally {
        if (!cancelled) setRelationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationFieldsFetchSig, view.track_id]);

  // Target entry resolution — the record the fields actually read from /
  // write to. Independent of `entries` prop trust: fetched directly for
  // 'self' and 'tool' modes; only 'anchored' mode uses the entries prop,
  // matching what ComposableViewSlot already resolved for this view.
  const [targetEntry, setTargetEntry] = useState<Entry | null>(null);
  const [targetEditable, setTargetEditable] = useState(true);
  const [loadingTarget, setLoadingTarget] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingTarget(true);

    async function resolve() {
      // Compose/edit document shell: fields live on the host draft.
      if (draftBound && lifecycle) {
        setTargetEntry({
          id: lifecycle.entryId || '',
          title: '',
          custom_fields: { ...lifecycle.customFields },
        } as Entry);
        setTargetEditable(lifecycle.mode !== 'detail');
        return;
      }
      if (bindMode === 'anchored') {
        setTargetEntry(entries[0] || null);
        setTargetEditable(true);
        return;
      }
      if (bindMode === 'tool') {
        if (!bindTool || !hostEntryId) {
          setTargetEntry(null);
          return;
        }
        try {
          const { output } = await toolsApi.call(bindTool, {
            [bindInputField]: hostEntryId,
          });
          const relatedEntryId =
            typeof output.entry_id === 'string' ? output.entry_id : undefined;
          if (relatedEntryId) {
            const fetched = await entriesApi.get(relatedEntryId);
            if (!cancelled) {
              setTargetEntry(fetched);
              setTargetEditable(true);
            }
            return;
          }
          const customFields = (output.custom_fields || {}) as Record<string, unknown>;
          if (!cancelled) {
            setTargetEntry({
              id: '',
              title: '',
              custom_fields: customFields,
            } as Entry);
            setTargetEditable(false);
          }
        } catch {
          if (!cancelled) setTargetEntry(null);
        }
        return;
      }
      // 'self' (default)
      if (!hostEntryId) {
        setTargetEntry(null);
        return;
      }
      try {
        const fetched = await entriesApi.get(hostEntryId);
        if (!cancelled) {
          setTargetEntry(fetched);
          setTargetEditable(true);
        }
      } catch {
        if (!cancelled) setTargetEntry(null);
      }
    }

    resolve().finally(() => {
      if (!cancelled) setLoadingTarget(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    draftBound,
    lifecycle,
    lifecycle?.customFields,
    lifecycle?.entryId,
    lifecycle?.mode,
    bindMode,
    bindTool,
    bindInputField,
    hostEntryId,
    entries,
  ]);

  // Shared live-values channel from an enclosing LayoutContainerWidget, if
  // any (null when this widget renders standalone) — see
  // regionConditions.ts's useLiveValuesProvider docstring. A sibling
  // region's own visible_if needs to see THIS region's commits the moment
  // they happen, not after a reload; `live.commit` is how that reaches them.
  const live = useLiveValues();

  // When a field declares ``validation.preview_default_tool`` and the tool
  // reports ``auto_generate: true`` (Finance invoice/quote numbers), lock the
  // control so users cannot override the assigned sequence — including entry
  // detail (view-only) where FormRegion self-binds without draftBound.
  useEffect(() => {
    const seedFields = displayFields.filter(field => {
      const tool = field.validation?.preview_default_tool;
      return typeof tool === 'string' && tool.trim().length > 0;
    });
    if (!seedFields.length) {
      setAutoLockedKeys(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const locked = new Set<string>();
      for (const field of seedFields) {
        const tool = String(field.validation?.preview_default_tool || '').trim();
        const input =
          field.validation?.preview_default_input &&
          typeof field.validation.preview_default_input === 'object' &&
          !Array.isArray(field.validation.preview_default_input)
            ? (field.validation.preview_default_input as Record<string, unknown>)
            : {};
        try {
          const appId = lifecycle?.appId;
          const output = appId
            ? requireOperationOutput(await extensionsApi.invokeOperation(appId, tool, input)).output
            : (await toolsApi.call(tool, input)).output;
          if (cancelled) return;
          if (output?.auto_generate !== true) continue;
          locked.add(field.key);
          const number = String(output?.number || '').trim();
          if (
            number &&
            draftBound &&
            lifecycle?.mode === 'create' &&
            lifecycle.onDraftPatch
          ) {
            const current = lifecycle.customFields?.[field.key];
            if (
              current === undefined ||
              current === null ||
              String(current).trim() === ''
            ) {
              live?.commit(field.key, number);
              lifecycle.onDraftPatch({ custom_fields: { [field.key]: number } });
            }
          }
        } catch {
          /* preview is best-effort */
        }
      }
      if (!cancelled) setAutoLockedKeys(locked);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit lifecycle.customFields — seeding patches it and
    // would re-fire this effect in a loop.
  }, [draftBound, displayFields, lifecycle?.mode, lifecycle?.appId]);

  // Prefill ``default_from_setting`` fields from App settings on compose.
  // Editable — never adds to autoLockedKeys.
  useEffect(() => {
    if (!draftBound || lifecycle?.mode !== 'create' || !lifecycle?.appId) return;
    const settingFields = displayFields.filter(
      field => typeof field.default_from_setting === 'string' && field.default_from_setting.trim(),
    );
    if (!settingFields.length || !lifecycle.onDraftPatch) return;
    let cancelled = false;
    const appId = lifecycle.appId;
    const onDraftPatch = lifecycle.onDraftPatch;
    (async () => {
      try {
        const { settings } = await appsApi.getAppSettings(appId);
        if (cancelled) return;
        const patch = patchFromAppSettings(
          settingFields,
          settings,
          lifecycle.customFields || {},
        );
        if (!Object.keys(patch).length) return;
        for (const [key, value] of Object.entries(patch)) {
          live?.commit(key, value);
        }
        onDraftPatch({ custom_fields: patch });
      } catch {
        /* settings seed is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit lifecycle.customFields — seeding patches it.
  }, [draftBound, displayFields, lifecycle?.mode, lifecycle?.appId]);

  const commitField = useCallback(
    async (key: string, value: unknown) => {
      const detailException =
        lifecycle?.mode === 'detail' && editableInDetailKeys.has(key);
      if (lifecycle?.mode === 'detail' && !detailException) return;
      if (!targetEditable && !draftBound && !detailException) return;
      if (autoLockedKeys.has(key)) return;
      const baseValues = {
        ...(lifecycle?.customFields || {}),
        ...(targetEntry?.custom_fields || {}),
        [key]: value,
      };
      const offset = deriveAutoOffsetPatch(allFields, baseValues, key) || {};
      const labelPatch =
        deriveRelationLabelPatch(
          allFields.find(f => f.key === key),
          value,
          relationChoices[key] || []
        ) || {};
      const merged = { [key]: value, ...offset, ...labelPatch };
      if (draftBound && lifecycle?.onDraftPatch) {
        for (const [k, v] of Object.entries(merged)) {
          live?.commit(k, v);
        }
        lifecycle.onDraftPatch({ custom_fields: merged });
        setTargetEntry(prev =>
          prev
            ? { ...prev, custom_fields: { ...(prev.custom_fields || {}), ...merged } }
            : ({
                id: lifecycle.entryId || '',
                title: '',
                custom_fields: { ...lifecycle.customFields, ...merged },
              } as Entry)
        );
        return;
      }
      if (!targetEntry || !targetEntry.id) return;
      setTargetEntry(prev =>
        prev
          ? { ...prev, custom_fields: { ...(prev.custom_fields || {}), ...merged } }
          : prev
      );
      for (const [k, v] of Object.entries(merged)) {
        live?.commit(k, v);
      }
      try {
        const updated = await entriesApi.update(targetEntry.id, {
          custom_fields: merged,
        });
        setTargetEntry(updated);
      } catch {
        showToast('Failed to save field', 'error');
      }
    },
    [
      targetEntry,
      targetEditable,
      autoLockedKeys,
      editableInDetailKeys,
      showToast,
      live,
      draftBound,
      lifecycle,
      lifecycle?.mode,
      allFields,
      relationChoices,
    ]
  );

  if (isLoading || loadingTypes || (loadingTarget && !draftBound)) {
    return (
      <Surface
        tone="panel-2"
        border="none"
        radius="input"
        className="h-24 animate-pulse"
      />
    );
  }

  if (!targetEntry && !draftBound) {
    return null;
  }

  // Merge the shared channel on top of this region's own entry snapshot —
  // a sibling region's more-recent commit wins for visible_if purposes,
  // while fields this region itself owns still read from its own state.
  const draftValues = draftBound
    ? { ...(lifecycle?.customFields || {}), ...(targetEntry?.custom_fields || {}) }
    : { ...(targetEntry?.custom_fields || {}) };
  const values = { ...draftValues, ...(live?.values || {}) };
  const visibleFields = displayFields.filter(
    f =>
      !(lifecycle?.mode === 'create' && f.hide_on_create) &&
      isVisible(fieldVisibleIfByKey.get(f.key), values)
  );
  // Entry detail passes mode="detail" without onDraftPatch (view-only until
  // pencil → edit). FormRegion used to treat that as self-bind + editable,
  // so the invoice shell looked like the compose form. Match
  // EditableRelatedLinesWidget: detail is always read-only.
  const readOnly =
    lifecycle?.mode === 'detail' ||
    (draftBound ? false : !targetEditable);

  return (
    <Surface
      padding="lg"
      data-testid="form-region-widget"
    >
      {title && (
        <Text as="h3" variant="heading-sm" className="mb-3">{title}</Text>
      )}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
      >
        {visibleFields.map(field => {
          const detailEditable = editableInDetailKeys.has(field.key);
          const fieldLocked =
            (readOnly && !detailEditable) || autoLockedKeys.has(field.key);
          return (
            <SeamlessField
              key={field.key}
              field={fieldLocked ? { ...field, readonly: true } : field}
              value={values[field.key]}
              onChange={next => commitField(field.key, next)}
              entryId={targetEntry?.id || lifecycle?.entryId || undefined}
              relationChoices={relationChoices[field.key]}
              relationLoading={relationLoading}
              siblingFields={allFields}
              siblingValues={values}
            />
          );
        })}
      </div>
    </Surface>
  );
}
