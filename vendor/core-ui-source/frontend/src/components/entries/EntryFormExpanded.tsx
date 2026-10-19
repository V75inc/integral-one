import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { Link2, X as XIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { AppSelect, Skeleton } from '../ui';

const WikiRichTextEditor = lazy(() =>
  import('../views/wiki/WikiRichTextEditor').then(m => ({
    default: m.WikiRichTextEditor
  }))
);
import { MentionableTextarea } from '../mentions/MentionableTextarea';
import { AddToEntryControl } from './AddToEntryControl';
import { useQuery } from '@tanstack/react-query';
import {
  appsApi,
  attachmentsApi,
  entriesApi,
  entryTypesApi,
  linkPreviewApi,
  tagsApi,
  tracksApi
} from '../../api';
import { extensionsApi, requireOperationOutput } from '../../api/extensions';
import { toolsApi } from '../../api/tools';
import { patchFromAppSettings } from '../../utils/fieldSettingDefaults';
import {
  entryTypesForTrackQueryKey,
  tagsForTrackQueryKey
} from '../../queryKeys';
import { errorMessageFromAxios } from '../../api/helpers';
import { sortFieldsByOrder } from '../../utils/entryMetaFields';
import { TagLookupControl } from './TagLookupControl';
import {
  contributionOwnsForm,
  contributionTitleFromFields,
  deriveTitleFromFields,
  type EntryContributionSlotHandle,
} from './EntryContributionSlot';
import { SeamlessField } from './SeamlessField';
import {
  detailsTrackIdsForProjects,
  projectIdsFromRelationValue,
  sprintLinkedToProject,
} from './relationChoiceLoaders';
import {
  planSprintTaskMembershipSync,
  shouldClearTaskSprintLink,
} from './sprintTaskSync';
import type {
  OperationalModelFieldSpec,
  OperationalModelFormSchema,
  Entry,
  EntryTypeBaseFields,
  EntryTypeNode,
  Tag,
  Track
} from '../../types';
import { BASE_ENTRY_TYPE_SLUGS } from '../../utils';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import { extractFirstUrl } from '../../utils/linkPreview';
import {
  sortTagsByProfileTaxonomy,
  tagsForEntryTypeAndProfile
} from '../../utils/tagProfile';
import { buildBaseSlotPlaceholder } from '../../utils/fieldPlaceholders';
import { resolveFieldDefault } from '../../utils/fieldDefaults';
import { deriveAutoOffsetPatch } from '../../utils/fieldDateOffset';
import { deriveRelationLabelPatch } from '../../utils/relationFieldSync';
import { findEntryTypeBySlug } from '../../utils/entryMetaFields';
import {
  buildCustomFieldsForEntryType,
  resolveFieldValuesForEntryType,
  filterEntryTypeSlugsForView,
  resolveCreateDefaultEntryType,
  entryTypeSlug,
  slug
} from './entryFormCustomFields';
import { entryPath } from '../../utils/resourcePaths';
import type { ToastAction } from '../../context/ToastContext';
const EMPTY_FIELDS: OperationalModelFieldSpec[] = [];

/** Inline ``[]`` from parents must not be used as a hook dependency; reuse this for empty lists. */
const STABLE_EMPTY_TRACKS: Track[] = [];

export interface RelationChoice {
  value: string;
  label: string;
}

interface PendingUrlAttachment {
  url: string;
  label: string;
}

interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

const CANONICAL_BODY_LABEL = 'Body';
const CANONICAL_TITLE_LABEL = 'Title';

type ComposerRow =
  | { kind: 'title'; order: number }
  | { kind: 'field'; field: OperationalModelFieldSpec; order: number }
  | { kind: 'body'; order: number }
  | { kind: 'attachments'; order: number };

// Helper functions moved to entryFormCustomFields.ts to resolve Vite HMR Fast Refresh warnings.

export interface UseEntryExpandedFormOptions {
  mode: 'create' | 'edit';
  enabled: boolean;
  /**
   * When false, skip loading relation field options (heavy). Use false while the composer is collapsed.
   */
  relationsEnabled?: boolean;
  track?: Track;
  /**
   * Must be referentially stable when empty — do not pass a fresh inline ``[]`` each render
   * (that retriggers track/entry-type/tag fetch effects in a loop).
   */
  tracksList: Track[];
  needsTrackPicker: boolean;
  /** Edit: entry being edited (for seed + save merge). */
  initialEntry?: Entry | null;
  /**
   * Seed text for the title field when the create-mode composer first
   * becomes enabled. Used by the collapsed quick-add input to hand off
   * a partially-typed title to the expanded form (B-ENT-01).
   * Only applied on the first effect run; subsequent changes to this
   * prop are ignored.
   */
  initialTitle?: string;
  /** Seed entry-type slug when opening create mode from a view (e.g. calendar). */
  initialType?: string;
  /** Seed custom field values (merged on top of type defaults). */
  initialCustomFields?: Record<string, unknown>;
  /** When composing inside a view, the view's entry-type constraint + default
   *  bind the create form so the resulting entry stays in-view. */
  viewEntryTypeKeys?: string[];
  viewDefaultEntryTypeKey?: string;
  /** Fills empty custom fields at create time (e.g. kanban workflow column). */
  createCustomFieldFallback?: () => Record<string, unknown> | undefined;
  /** Kanban workflow field key → enum key → display label (for select / multi_select). */
  workflowEnumLabels?: Record<string, Record<string, string>>;
  showToast: (
    message: string,
    variant: 'success' | 'error' | 'info',
    action?: ToastAction,
  ) => void;
  onCreated?: (entry: Entry) => void;
  /** Optional block after dynamic fields (e.g. entry_compose contribution). */
  composeExtraSection?: ReactNode;
  /** App-owned UI contribution slot API (validate / commit via extension bridge). */
  contributionApiRef?: React.MutableRefObject<EntryContributionSlotHandle | null>;
  /** Which contribution placement owns this form (compose vs detail edit). */
  contributionPlacement?: 'entry_compose' | 'entry_detail';
}

export interface EntryExpandedFormModel {
  entryTypes: EntryTypeNode[];
  loading: boolean;
  needsTrackPicker: boolean;
  tracksList: Track[];
  selectedTrackId: string;
  setSelectedTrackId: (id: string) => void;
  type: string;
  setType: (t: string) => void;
  typeOptions: string[];
  profileInformedTags: Tag[];
  tagOptions: Tag[];
  selectedTagIds: string[];
  setSelectedTagIds: (ids: string[]) => void;
  title: string;
  setTitle: (t: string) => void;
  body: string;
  setBody: (b: string) => void;
  composerRows: ComposerRow[];
  effectiveTitlePlaceholder: string;
  effectiveBodyPlaceholder: string;
  // NonNullable: the caller resolves these with `baseFields.title || {}`, so a
  // value is always supplied. Every member of the shape is itself optional, so
  // `{}` satisfies it — the optionality on EntryTypeBaseFields describes the
  // manifest, not this prop.
  titleBase: NonNullable<EntryTypeBaseFields['title']>;
  bodyBase: NonNullable<EntryTypeBaseFields['body']>;
  titleEnabled: boolean;
  bodyEnabled: boolean;
  attachmentsEnabled: boolean;
  allowFileUpload: boolean;
  allowUrlReference: boolean;
  attachmentsHelp: string;
  linkPreviewLoading: boolean;
  linkPreview: LinkPreview | null;
  dismissedPreviewUrl: string;
  dismissLinkPreview: () => void;
  pendingFiles: File[];
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  pendingUrlAttachments: PendingUrlAttachment[];
  setPendingUrlAttachments: Dispatch<SetStateAction<PendingUrlAttachment[]>>;
  /** Appends a batch of files to `pendingFiles`. Use from
   *  `AddToEntryControl#onFilesAdded`. */
  addPendingFiles: (files: File[]) => void;
  /** Appends a single link attachment with dedupe — the URL is
   *  expected to be pre-validated (http:// or https://) by the
   *  control. Pairs with `AddToEntryControl#onLinkAdded`. */
  addLinkAttachment: (url: string, label?: string) => void;
  renderDynamicField: (
    field: OperationalModelFieldSpec,
    extras?: {
      onNavigate?: () => void;
      navContext?: import('./relations/routeForRelationTarget').RelationNavContext | null;
    }
  ) => ReactNode;
  handleSubmitCreate: () => Promise<void>;
  handleSubmitEdit: (entryId: string) => Promise<Entry>;
  cancelCreate: () => void;
  /** Collapsed row invite placeholder; title/body placeholders come from the Operational Model when expanded. */
  composerInviteText: string;
  /** Primary action label for the collapsed create button (e.g. “New Post”). */
  composerActionLabel: string;
  fieldValues: Record<string, unknown>;
  setFieldValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  applyContributionPatch: (patch: {
    custom_fields?: Record<string, unknown>;
  }) => void;
  composeExtraSection?: ReactNode;
  /** Hide default field grid when a ui_contribution has owns_form. */
  ownsForm: boolean;
  dynamicFields: OperationalModelFieldSpec[];
  entryTypeFormSchema: OperationalModelFormSchema | null;
  appId?: string;
  initialEntry?: Entry | null;
}

export function useEntryExpandedForm(
  options: UseEntryExpandedFormOptions
): EntryExpandedFormModel {
  const {
    mode,
    enabled,
    relationsEnabled = true,
    track,
    tracksList,
    needsTrackPicker,
    initialEntry,
    initialTitle,
    initialType,
    initialCustomFields,
    viewEntryTypeKeys,
    viewDefaultEntryTypeKey,
    createCustomFieldFallback,
    workflowEnumLabels,
    showToast,
    onCreated,
    composeExtraSection = null,
    contributionApiRef,
    contributionPlacement = 'entry_compose',
  } = options;

  const tracksListNorm =
    tracksList.length === 0 ? STABLE_EMPTY_TRACKS : tracksList;

  const [title, setTitle] = useState<string>(() => (mode === 'create' ? initialTitle ?? '' : ''));
  const [body, setBody] = useState('');
  const [type, setType] = useState('post');
  const [typeUserTouched, setTypeUserTouched] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(
    track?.id || initialEntry?.track_id || ''
  );
  const [loading, setLoading] = useState(false);
  const [typeOptions, setTypeOptions] = useState<string[]>(() => [
    ...BASE_ENTRY_TYPE_SLUGS,
  ]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  /** Keys locked when preview_default_tool reports auto_generate (e.g. invoice no.). */
  const [autoLockedFieldKeys, setAutoLockedFieldKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [relationChoices, setRelationChoices] = useState<Record<string, RelationChoice[]>>(
    {}
  );
  const [relationLoading, setRelationLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingUrlAttachments, setPendingUrlAttachments] = useState<PendingUrlAttachment[]>(
    []
  );
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [dismissedPreviewUrl, setDismissedPreviewUrl] = useState('');
  // `linkAddOpen`, `pendingUrl`, `pendingUrlLabel`, `fileInputRef` and
  // `onFilesPicked` now live inside `AddToEntryControl` — the form just
  // accepts finished File[] / link tuples via `addPendingFiles` and
  // `addLinkAttachment` below.
  const baselineEntryRef = useRef<Entry | null | undefined>(initialEntry);
  const relationEntriesByIdRef = useRef<Map<string, Entry>>(new Map());
  const pendingCustomFieldSeedRef = useRef<Record<string, unknown> | undefined>(
    initialCustomFields
  );
  const typeFromSeedRef = useRef(false);
  const hydratedFieldsRef = useRef<{ entryId: string; typeSlug: string } | null>(
    null
  );

  const activeTrackId =
    track?.id || selectedTrackId || (mode === 'edit' ? initialEntry?.track_id : '') || '';
  /** Stable dep: parent often passes a new `track` object per query tick with the same id. */
  const trackIdForFetch = track?.id;

  useEffect(() => {
    baselineEntryRef.current = initialEntry;
  }, [initialEntry]);

  useEffect(() => {
    if (track?.id) setSelectedTrackId(track.id);
  }, [track?.id]);

  useEffect(() => {
    if (!enabled || mode !== 'edit' || !initialEntry) return;
    setTitle(initialEntry.title || '');
    setBody(initialEntry.body || '');
    setType(slug(String(initialEntry.type || 'post')));
    setSelectedTagIds((initialEntry.tags || []).map(t => t.id));
    setPendingFiles([]);
    setPendingUrlAttachments([]);
    setLinkPreview(null);
    setDismissedPreviewUrl('');
    setTypeUserTouched(false);
    hydratedFieldsRef.current = null;
    // Keyed on initialEntry?.id: this effect RESETS the composer, so depending
    // on the whole object would wipe in-progress edits on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode, initialEntry?.id]);

  // Create composer stays mounted while the modal is closed; clear hydrate
  // marker on close so the next open re-applies field defaults ($today, …).
  useEffect(() => {
    if (mode !== 'create') return;
    if (!enabled) hydratedFieldsRef.current = null;
  }, [enabled, mode]);

  const titleSeededRef = useRef(false);
  // Two seeding paths cover the two distinct timing cases. Do NOT delete
  // one as "redundant" — they fire under different conditions:
  //   (1) Lazy useState init (above) — seeds when the hook mounts WITH
  //       a non-empty initialTitle. Fires synchronously on first render.
  //   (2) useLayoutEffect (below) — seeds when initialTitle becomes
  //       non-empty AFTER mount (e.g. EntryComposer's collapsed input
  //       flipped expanded=true on first keystroke). Fires synchronously
  //       before paint, so the autoFocus'd title input wins the race
  //       against continuing user keystrokes (B-ENT-01).
  // The titleSeededRef gates both so seeding happens exactly once.
  useLayoutEffect(() => {
    if (mode !== 'create') return;
    if (!enabled) return;
    if (titleSeededRef.current) return;
    if (!initialTitle) return;
    setTitle(initialTitle);
    titleSeededRef.current = true;
  }, [mode, enabled, initialTitle]);

  // Canonical entry-type + tag queries. Mutations from TrackConfigPanel /
  // SchemaSection invalidate these exact keys, which is how schema edits
  // in the config sidebar propagate live into the composer — no manual
  // invalidation handshake, no stale form_schema rendering.
  const entryTypesQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(activeTrackId),
    enabled: Boolean(enabled && activeTrackId),
    queryFn: () => entryTypesApi.list({ track_id: activeTrackId }),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const entryTypes = useMemo<EntryTypeNode[]>(
    () => (entryTypesQuery.data ?? []) as EntryTypeNode[],
    [entryTypesQuery.data]
  );

  const tagsQuery = useQuery({
    queryKey: tagsForTrackQueryKey(activeTrackId),
    enabled: Boolean(enabled && activeTrackId),
    queryFn: () => tagsApi.list({ track_id: activeTrackId })
  });
  const tagOptions = useMemo<Tag[]>(
    () => (tagsQuery.data ?? []) as Tag[],
    [tagsQuery.data]
  );

  // Compute the allowed entry-type slug list from the live entryTypes
  // cache + the optional view restriction. Re-derives on schema edits.
  useEffect(() => {
    if (!enabled || !activeTrackId) return;
    const nextSlugs = filterEntryTypeSlugsForView(entryTypes, viewEntryTypeKeys);
    setTypeOptions(prev => {
      if (
        prev.length === nextSlugs.length &&
        prev.every((v, i) => v === nextSlugs[i])
      ) {
        return prev;
      }
      return nextSlugs;
    });
  }, [enabled, activeTrackId, entryTypes, viewEntryTypeKeys]);

  useLayoutEffect(() => {
    if (mode !== 'create' || !enabled || !initialType || typeFromSeedRef.current) {
      return;
    }
    setType(slug(String(initialType)));
    setTypeUserTouched(true);
    typeFromSeedRef.current = true;
  }, [mode, enabled, initialType, activeTrackId]);

  // Keep create-mode type aligned with the active view's default. Re-runs when
  // view tabs change on the same track (not only on first mount).
  useEffect(() => {
    if (!enabled || mode !== 'create' || !activeTrackId) return;
    if (entryTypesQuery.isPending) return;
    if (typeFromSeedRef.current && initialType) return;
    const resolvedTrack =
      trackIdForFetch === activeTrackId
        ? track
        : tracksListNorm.find(t => t.id === activeTrackId);
    const mustFetch = !resolvedTrack?.operational_model_defaults;
    (async () => {
      const tData = mustFetch
        ? await tracksApi.get(activeTrackId).catch(() => null)
        : resolvedTrack!;
      const nextSlugs = filterEntryTypeSlugsForView(entryTypes, viewEntryTypeKeys);
      const preferred = resolveCreateDefaultEntryType(
        nextSlugs,
        viewEntryTypeKeys,
        viewDefaultEntryTypeKey,
        tData?.operational_model_defaults?.default_entry_type
      );
      setType(prev => {
        const prevSlug = slug(prev);
        const stillAllowed = nextSlugs.some(s => slug(s) === prevSlug);
        if (!stillAllowed) {
          return preferred ?? (nextSlugs[0] || 'post');
        }
        if (!typeUserTouched) {
          return (
            preferred ?? (nextSlugs.includes(prev) ? prev : nextSlugs[0] || 'post')
          );
        }
        return prev;
      });
    })();
  }, [
    enabled,
    mode,
    activeTrackId,
    trackIdForFetch,
    track,
    tracksListNorm,
    entryTypes,
    entryTypesQuery.isPending,
    viewEntryTypeKeys,
    viewDefaultEntryTypeKey,
    typeUserTouched,
    initialType,
  ]);

  useEffect(() => {
    const matchingType = findEntryTypeBySlug(entryTypes, type);
    const pendingSeed = pendingCustomFieldSeedRef.current;
    const awaitingSeededType =
      mode === 'create' &&
      Boolean(initialType) &&
      slug(String(initialType)) !== slug(type);
    const awaitingSeededSchema =
      mode === 'create' &&
      Boolean(pendingSeed) &&
      (entryTypesQuery.isPending || !matchingType);
    if (awaitingSeededType || awaitingSeededSchema) return;

    const fields = (matchingType?.form_schema?.fields || []) as OperationalModelFieldSpec[];
    const typeSlug = slug(type);

    if (mode === 'edit') {
      if (entryTypesQuery.isPending) return;
      const entryId = initialEntry?.id || '';
      const already =
        hydratedFieldsRef.current?.entryId === entryId &&
        hydratedFieldsRef.current?.typeSlug === typeSlug;
      if (already) return;
      const baselineCf = baselineEntryRef.current?.custom_fields || {};
      setFieldValues(
        resolveFieldValuesForEntryType(typeSlug, fields, baselineCf)
      );
      hydratedFieldsRef.current = { entryId, typeSlug };
      return;
    }

    // Create hydration must run once per selected type. ``entryTypes`` is a
    // React Query result with staleTime 0, so refetches would otherwise
    // ``setFieldValues(defaultsOnly)`` and wipe owns_form document-shell
    // patches (customer / txn_date) that FormRegion already committed via
    // ``applyContributionPatch`` — toasting required fields that look filled.
    const already =
      hydratedFieldsRef.current?.entryId === '' &&
      hydratedFieldsRef.current?.typeSlug === typeSlug;
    if (already && !pendingSeed) return;

    const nextValues: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.default !== undefined) {
        nextValues[field.key] = resolveFieldDefault(field.default);
      }
    }
    let seedApplied: Record<string, unknown> | undefined;
    if (pendingSeed && mode === 'create') {
      seedApplied = pendingSeed;
      Object.assign(nextValues, pendingSeed);
      pendingCustomFieldSeedRef.current = undefined;
    }
    // Apply term-based date offsets once defaults are seeded (e.g. due = txn + net).
    for (const field of fields) {
      const offset = deriveAutoOffsetPatch(fields, nextValues, field.key);
      if (offset) Object.assign(nextValues, offset);
    }
    // Preserve in-progress edits on late seed; seed keys still win.
    setFieldValues(prev =>
      already ? { ...nextValues, ...prev, ...(seedApplied || {}) } : nextValues
    );
    hydratedFieldsRef.current = { entryId: '', typeSlug };
  }, [
    entryTypes,
    entryTypesQuery.isPending,
    initialEntry?.id,
    initialType,
    type,
    mode,
  ]);

  const setTypeFromUser = (next: string) => {
    setTypeUserTouched(true);
    setType(next);
  };

  const profileInformedTags = useMemo(
    () =>
      sortTagsByProfileTaxonomy(tagsForEntryTypeAndProfile(tagOptions, type)),
    [tagOptions, type]
  );

  useEffect(() => {
    setSelectedTagIds(prev => {
      const allowed = new Set(profileInformedTags.map(t => t.id));
      const next = prev.filter(id => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [type, profileInformedTags]);

  /** Resolve from ``type`` in the same render as the type control (not via effect), so labels/placeholders update immediately. */
  const selectedType = useMemo(
    () => findEntryTypeBySlug(entryTypes, type),
    [entryTypes, type]
  );
  const selectedTypeId = selectedType?.id || '';

  const existingEmployeesQuery = useQuery({
    queryKey: ['entries', 'track', activeTrackId, 'employee'],
    enabled: Boolean(enabled && activeTrackId && selectedType?.name === 'Employee' && mode === 'create'),
    queryFn: () => entriesApi.list({ track_id: activeTrackId, limit: 200 })
  });

  useEffect(() => {
    if (mode !== 'create' || selectedType?.name !== 'Employee') return;
    if (!existingEmployeesQuery.data) return;
    const data = existingEmployeesQuery.data as any;
    const existing = Array.isArray(data.entries) ? data.entries : (Array.isArray(data) ? data : []);
    const employeeIds = existing
      .map((e: any) => e.custom_fields?.employee_id)
      .filter((val: any) => typeof val === 'string' && /^\d+$/.test(val.trim()))
      .map((val: any) => parseInt(val.trim(), 10));
    const maxId = employeeIds.length > 0 ? Math.max(...employeeIds) : 0;
    const nextIdVal = maxId + 1;
    const nextIdStr = String(nextIdVal).padStart(4, '0');

    setFieldValues(prev => {
      if (prev.employee_id === undefined || prev.employee_id === null || prev.employee_id === '') {
        return { ...prev, employee_id: nextIdStr };
      }
      return prev;
    });
  }, [existingEmployeesQuery.data, selectedType?.name, mode]);

  const baseFields = (selectedType?.form_schema?.base_fields || {}) as EntryTypeBaseFields;
  const titleBase = baseFields.title || {};
  const bodyBase = baseFields.body || {};
  const attachmentsBase = baseFields.attachments || {};
  const titleEnabled = titleBase.enabled !== false;
  const bodyEnabled = bodyBase.enabled !== false;
  const attachmentsEnabled = attachmentsBase.enabled !== false;
  const allowFileUpload = attachmentsBase.allow_file_upload !== false;
  const allowUrlReference = attachmentsBase.allow_url_reference !== false;
  const attachmentsHelp = attachmentsBase.help || '';

  const effectiveTitlePlaceholder = useMemo(
    () =>
      buildBaseSlotPlaceholder({
        label: String(titleBase.label || ''),
        placeholder: String(titleBase.placeholder || ''),
        canonicalLabel: CANONICAL_TITLE_LABEL,
        slot: 'title'
      }),
    [titleBase.label, titleBase.placeholder]
  );

  const effectiveBodyPlaceholder = useMemo(
    () =>
      buildBaseSlotPlaceholder({
        label: String(bodyBase.label || ''),
        placeholder: String(bodyBase.placeholder || ''),
        canonicalLabel: CANONICAL_BODY_LABEL,
        slot: 'body'
      }),
    [bodyBase.label, bodyBase.placeholder]
  );

  const composerInviteText = useMemo(() => {
    if (selectedType?.name) {
      // Title-case the slug (e.g. "contact" → "Contact", "blog_post" → "Blog post").
      const label = selectedType.name
        .replace(/[_-]/g, ' ')
        .replace(/^\w/, c => c.toUpperCase());
      return `Add a${/^[aeiou]/i.test(label) ? 'n' : ''} ${label.toLowerCase()}…`;
    }
    return 'Add an entry…';
  }, [selectedType?.name]);

  const composerActionLabel = useMemo(() => {
    const slug = selectedType?.name || type || viewDefaultEntryTypeKey || 'post';
    const label = humanizeEnumValue(slug);
    return label ? `New ${label}` : 'New entry';
  }, [selectedType?.name, type, viewDefaultEntryTypeKey]);

  const entryTypeFormSchema = selectedType?.form_schema ?? null;
  const appId = track?.app?.id;
  const ownsForm = contributionOwnsForm(entryTypeFormSchema, contributionPlacement);
  const titleFromFields = contributionTitleFromFields(
    entryTypeFormSchema,
    contributionPlacement
  );

  const dynamicFields = useMemo((): OperationalModelFieldSpec[] => {
    const f = selectedType?.form_schema?.fields;
    if (!Array.isArray(f)) return EMPTY_FIELDS;
    // ``hidden`` fields never show; ``hide_on_create`` ones only skip the
    // create form. Their defaults still apply (seeded from the full list).
    const visible = (f as OperationalModelFieldSpec[]).filter(
      field => !field.hidden && !(mode === 'create' && field.hide_on_create)
    );
    return sortFieldsByOrder(visible);
  }, [selectedType?.form_schema?.fields, mode]);

  // Seed + lock fields that declare ``validation.preview_default_tool``
  // (e.g. Finance invoice_number via ``preview_document_number`` when
  // auto-generate is on). When auto-generate is on the field is read-only.
  useEffect(() => {
    if (!enabled || (mode !== 'create' && mode !== 'edit')) {
      setAutoLockedFieldKeys(new Set());
      return;
    }
    const seedFields = dynamicFields.filter(field => {
      const tool = field.validation?.preview_default_tool;
      return typeof tool === 'string' && tool.trim().length > 0;
    });
    if (!seedFields.length) {
      setAutoLockedFieldKeys(new Set());
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
          const output = appId
            ? requireOperationOutput(await extensionsApi.invokeOperation(appId, tool, input)).output
            : (await toolsApi.call(tool, input)).output;
          if (cancelled) return;
          if (output?.auto_generate !== true) continue;
          locked.add(field.key);
          if (mode !== 'create') continue;
          const number = String(output?.number || '').trim();
          if (!number) continue;
          setFieldValues(prev => {
            const current = prev[field.key];
            if (current !== undefined && current !== null && String(current).trim() !== '') {
              return prev;
            }
            return { ...prev, [field.key]: number };
          });
        } catch {
          /* preview is best-effort; create hook can still assign */
        }
      }
      if (!cancelled) setAutoLockedFieldKeys(locked);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, mode, appId, dynamicFields, type]);

  // Prefill fields that declare ``default_from_setting`` from the parent
  // App's settings (e.g. Finance currency ← default_currency). Editable —
  // never locks the control.
  useEffect(() => {
    if (!enabled || mode !== 'create' || !appId) return;
    const settingFields = dynamicFields.filter(
      field => typeof field.default_from_setting === 'string' && field.default_from_setting.trim(),
    );
    if (!settingFields.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { settings } = await appsApi.getAppSettings(appId);
        if (cancelled) return;
        setFieldValues(prev => {
          const patch = patchFromAppSettings(settingFields, settings, prev);
          if (!Object.keys(patch).length) return prev;
          return { ...prev, ...patch };
        });
      } catch {
        /* settings seed is best-effort; backend still resolves on create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, mode, appId, dynamicFields, type]);

  const applyContributionPatch = useCallback(
    (patch: { custom_fields?: Record<string, unknown> }) => {
      if (!patch.custom_fields) return;
      setFieldValues(prev => {
        const next = { ...prev, ...patch.custom_fields };
        for (const key of Object.keys(patch.custom_fields || {})) {
          const offset = deriveAutoOffsetPatch(dynamicFields, next, key);
          if (offset) Object.assign(next, offset);
        }
        return next;
      });
    },
    [dynamicFields]
  );

  // ── Seed-from: cross-track entry seeding ────────────────────────────────
  // When the employee entry type has a `seed_from` relation field and the
  // user picks an onboarding_form entry, fetch that entry and map all
  // matching custom_field keys + title into the current form values.
  const seedFromValue = fieldValues['seed_from'];
  const hasSeedFromField = useMemo(
    () => dynamicFields.some(f => f.key === 'seed_from'),
    [dynamicFields]
  );
  const prevSeedFromRef = useRef<string>('');

  useEffect(() => {
    if (!hasSeedFromField || mode !== 'create') return;
    const sourceId = typeof seedFromValue === 'string' ? seedFromValue : '';
    if (!sourceId || sourceId === prevSeedFromRef.current) return;
    prevSeedFromRef.current = sourceId;

    (async () => {
      try {
        const sourceEntry = await entriesApi.get(sourceId);
        const cf = (sourceEntry as any).custom_fields || {};
        // Map matching keys from the onboarding form into the employee form.
        // Exclude meta (_*) keys and the seed_from field itself.
        setFieldValues(prev => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(cf)) {
            if (k.startsWith('_') || k === 'seed_from') continue;
            next[k] = v;
          }
          return next;
        });
        // Also propagate the government name (title) from the onboarding form.
        if ((sourceEntry as any).title) {
          setTitle(String((sourceEntry as any).title));
        }
        showToast(
          `Fields imported from "${(sourceEntry as any).title || 'Onboarding Form'}" — review before saving`,
          'success'
        );
      } catch {
        showToast('Could not load onboarding form data', 'error');
      }
    })();
  }, [seedFromValue, hasSeedFromField, mode, showToast]);
  // ── End seed-from ────────────────────────────────────────────────────────

  const composerRows = useMemo((): ComposerRow[] => {
    const rows: ComposerRow[] = [];
    if (titleEnabled) {
      rows.push({
        kind: 'title',
        order: typeof titleBase.order === 'number' ? titleBase.order : 0
      });
    }
    dynamicFields.forEach((field, idx) => {
      if (mode === 'create' && field.hide_on_create) return;
      rows.push({
        kind: 'field',
        field,
        order: typeof field.order === 'number' ? field.order : 200 + idx * 10
      });
    });
    if (bodyEnabled) {
      rows.push({
        kind: 'body',
        order: typeof bodyBase.order === 'number' ? bodyBase.order : 1000
      });
    }
    if (attachmentsEnabled) {
      rows.push({
        kind: 'attachments',
        order: typeof attachmentsBase.order === 'number' ? attachmentsBase.order : 1100
      });
    }
    const kindPri: Record<ComposerRow['kind'], number> = {
      title: 0,
      field: 1,
      body: 2,
      attachments: 3
    };
    rows.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return kindPri[a.kind] - kindPri[b.kind];
    });
    return rows;
  }, [
    dynamicFields,
    mode,
    titleEnabled,
    bodyEnabled,
    attachmentsEnabled,
    titleBase.order,
    bodyBase.order,
    attachmentsBase.order,
  ]);

  const setDynamicField = useCallback(
    (key: string, value: unknown) => {
      setFieldValues(prev => {
        const next = { ...prev, [key]: value };
        if (key === 'project') {
          const nextProjects = projectIdsFromRelationValue(value);
          if (nextProjects.length === 0) {
            next.tasks = [];
          }
        }
        const offset = deriveAutoOffsetPatch(dynamicFields, next, key);
        if (offset) Object.assign(next, offset);
        const field = dynamicFields.find(f => f.key === key);
        const labelPatch = deriveRelationLabelPatch(
          field,
          value,
          relationChoices[key] || []
        );
        if (labelPatch) Object.assign(next, labelPatch);
        return next;
      });
    },
    [dynamicFields, relationChoices]
  );

  useEffect(() => {
    if (slug(String(type || selectedType?.name || '')) !== 'sprint') return;
    // Never drop selected task ids just because they are absent from a
    // truncated choice list (limit=200) — that would clear Task.sprint on save.
    const projectIds = projectIdsFromRelationValue(fieldValues.project);
    if (projectIds.length === 0 && Array.isArray(fieldValues.tasks) && fieldValues.tasks.length > 0) {
      setFieldValues(prev => ({ ...prev, tasks: [] }));
    }
  }, [fieldValues.project, type, selectedType?.name]);

  const relationFieldsFetchSig = dynamicFields
    .filter(f => f.type === 'relation')
    .map(f => `${f.key}:${JSON.stringify(f.relation ?? {})}`)
    .join('\x1e');
  const projectIdsSig = projectIdsFromRelationValue(fieldValues.project).join(
    ','
  );
  const anchorProjectId = String(
    initialEntry?.anchor_source?.id || ''
  ).trim();

  useEffect(() => {
    if (!enabled || !relationsEnabled || !activeTrackId) {
      setRelationChoices(prev => (Object.keys(prev).length === 0 ? prev : {}));
      setRelationLoading(false);
      return;
    }
    const relationFields = dynamicFields.filter(f => f.type === 'relation');
    if (!relationFields.length) {
      setRelationChoices(prev => (Object.keys(prev).length === 0 ? prev : {}));
      setRelationLoading(false);
      return;
    }
    let cancelled = false;
    setRelationLoading(true);
    (async () => {
      try {
        const allTracks =
          tracksListNorm.length > 0 ? tracksListNorm : await tracksApi.list();
        const trackById = new Map(allTracks.map(t => [t.id, t]));
        const choicesByField: Record<string, RelationChoice[]> = {};
        relationEntriesByIdRef.current = new Map();

        await Promise.all(
          relationFields.map(async field => {
            const relation = field.relation || {};
            const allowCrossTrack = Boolean(relation.allow_cross_track);
            const targetEntryTypes = new Set(
              (relation.target_entry_types || []).map(x => slug(String(x)))
            );
            const targetTrackTypes = new Set(
              (relation.target_track_types || []).map(x => slug(String(x)))
            );
            const currentTrack =
              trackById.get(activeTrackId) ||
              track ||
              tracksListNorm.find(t => t.id === activeTrackId);

            if (field.key === 'tasks') {
              const projectIds = projectIdsFromRelationValue(
                fieldValues.project
              );
              if (!projectIds.length) {
                choicesByField[field.key] = [];
                return;
              }
              const detailIds = await detailsTrackIdsForProjects(projectIds);
              if (!detailIds.length) {
                choicesByField[field.key] = [];
                return;
              }
              const entryLists = await Promise.all(
                detailIds.map(async dId => {
                  try {
                    const entries = await entriesApi.list({ track_id: dId, limit: 200 });
                    const knownTrack = trackById.get(dId) || allTracks.find(t => t.id === dId);
                    return { trackTitle: knownTrack?.title || 'Project tasks', entries };
                  } catch {
                    return { trackTitle: 'Project tasks', entries: [] };
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
                  const label = `${primary} (${group.trackTitle})`;
                  deduped.set(item.id, { value: item.id, label });
                  relationEntriesByIdRef.current.set(item.id, item);
                }
              }
              choicesByField[field.key] = Array.from(deduped.values());
              return;
            }

            const candidateTracks = allowCrossTrack
              ? allTracks.filter(t => {
                  if (!targetTrackTypes.size) return true;
                  const typeKey = slug(String(t.template_id || t.relation_type_key || t.title));
                  return targetTrackTypes.has(typeKey);
                })
              : currentTrack
              ? [currentTrack]
              : [];
            const entryLists = await Promise.all(
              candidateTracks.map(async t => {
                try {
                  const entries = await entriesApi.list({ track_id: t.id, limit: 200 });
                  return { track: t, entries };
                } catch {
                  return { track: t, entries: [] };
                }
              })
            );
            const deduped = new Map<string, RelationChoice>();
            for (const group of entryLists) {
              for (const item of group.entries) {
                // The entries endpoint normally supplies the normalized type
                // slug, but older/cross-app list responses can omit it. The
                // track restriction above has already narrowed this to the
                // HR Employees track, so don't hide valid choices merely
                // because type metadata was absent from that response.
                const itemType = String(
                  item.type || item.custom_fields?._entry_type_slug || ''
                ).trim();
                if (targetEntryTypes.size && itemType && !targetEntryTypes.has(slug(itemType))) {
                  continue;
                }
                if (field.key === 'manager' && item.custom_fields?.status === 'terminated') {
                  continue;
                }
                if (
                  field.key === 'sprint' &&
                  anchorProjectId &&
                  !sprintLinkedToProject(item, anchorProjectId)
                ) {
                  continue;
                }
                const primary =
                  String(item.title || '').trim() ||
                  String(item.body || '').trim().slice(0, 80) ||
                  `Entry ${item.id.slice(-6)}`;
                const label = `${primary} (${group.track.title})`;
                deduped.set(item.id, { value: item.id, label });
                relationEntriesByIdRef.current.set(item.id, item);
              }
            }
            choicesByField[field.key] = Array.from(deduped.values());
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
    // `dynamicFields`/`track` are folded into relationFieldsFetchSig above —
    // depending on them directly would re-issue every relation-options
    // request whenever the parent re-rendered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    relationsEnabled,
    activeTrackId,
    relationFieldsFetchSig,
    tracksListNorm,
    trackIdForFetch,
    projectIdsSig,
    anchorProjectId,
  ]);

  useEffect(() => {
    const firstUrl = extractFirstUrl(body);
    if (!bodyEnabled || !firstUrl || firstUrl === dismissedPreviewUrl) {
      setLinkPreview(null);
      setLinkPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        setLinkPreviewLoading(true);
        const preview = await linkPreviewApi.get(firstUrl);
        if (!cancelled) setLinkPreview(preview);
      } catch {
        if (!cancelled) setLinkPreview(null);
      } finally {
        if (!cancelled) setLinkPreviewLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [body, dismissedPreviewUrl, bodyEnabled]);

  const addPendingFiles = (files: File[]) => {
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
  };

  const dismissLinkPreview = () => {
    if (bodyEnabled) {
      const u = extractFirstUrl(body);
      if (u) setDismissedPreviewUrl(u);
    }
    setLinkPreview(null);
    setFieldValues(prev => {
      if (!('_link_preview' in prev)) return prev;
      const next = { ...prev };
      delete next._link_preview;
      return next;
    });
  };

  const addLinkAttachment = (url: string, label?: string) => {
    // URL is expected pre-validated by AddToEntryControl; we only
    // guard against duplicates here. A toast surfaces the dedupe so
    // the user knows their click was acknowledged.
    if (pendingUrlAttachments.some(x => x.url === url)) {
      showToast('That link is already attached', 'error');
      return;
    }
    setPendingUrlAttachments(prev => [...prev, { url, label: label ?? '' }]);
  };

  function renderDynamicField(
    field: OperationalModelFieldSpec,
    extras?: {
      onNavigate?: () => void;
      navContext?: import('./relations/routeForRelationTarget').RelationNavContext | null;
    }
  ): ReactNode {
    const locked =
      Boolean(field.readonly) || autoLockedFieldKeys.has(field.key);
    return (
      <SeamlessField
        field={locked ? { ...field, readonly: true } : field}
        value={fieldValues[field.key]}
        onChange={v => {
          if (autoLockedFieldKeys.has(field.key)) return;
          setDynamicField(field.key, v);
        }}
        relationChoices={relationChoices[field.key]}
        relationLoading={relationLoading}
        enumLabels={workflowEnumLabels?.[field.key]}
        entryId={initialEntry?.id || ''}
        onNavigate={extras?.onNavigate}
        navContext={extras?.navContext}
        siblingFields={dynamicFields}
        siblingValues={fieldValues}
      />
    );
  }

  const validateEmailAndPhone = (
    fields: OperationalModelFieldSpec[],
    values: Record<string, unknown>,
    baseline?: Record<string, unknown> | null
  ): boolean => {
    for (const field of fields) {
      const key = field.key;
      const val = values[key] !== undefined ? values[key] : (baseline?.[key]);
      if (val === undefined || val === null || val === '') continue;

      if (key === 'work_email' || key === 'personal_email') {
        const emailStr = String(val).trim();
        const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        if (!emailRegex.test(emailStr)) {
          showToast(`"${field.name}" must be a valid email address`, 'error');
          return false;
        }
      }

      if (key === 'phone' || key === 'emergency_contact_phone') {
        const phoneStr = String(val).trim();
        const cleaned = phoneStr.replace(/[^\d]/g, '');
        const phoneRegex = /^[0-9+\-()\s]+$/;
        if (cleaned.length < 7 || !phoneRegex.test(phoneStr)) {
          showToast(`"${field.name}" must be a valid phone number (at least 7 digits)`, 'error');
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmitCreate = async () => {
    const tid = track?.id || selectedTrackId;
    if (!tid) {
      showToast('Select a track', 'error');
      return;
    }
    const hasPrimaryContent =
      Boolean(titleEnabled && title.trim()) || Boolean(bodyEnabled && body.trim());
    if (!ownsForm && (titleEnabled || bodyEnabled) && !hasPrimaryContent) {
      showToast('Add some content', 'error');
      return;
    }
    // Validate required custom fields for the selected entry type before
    // submitting — prevents a 400 from the backend when required fields are empty.
    const missingRequiredFields = dynamicFields.filter(field => {
      if (!field.required) return false;
      if (field.hide_on_create) return false;
      const val = fieldValues[field.key];
      if (Array.isArray(val)) return val.length === 0;
      return val === undefined || val === null || val === '';
    });
    if (missingRequiredFields.length > 0) {
      const labels = missingRequiredFields.map(f => `"${f.name || f.key}"`).join(', ');
      const typeName = selectedType?.name
        ? selectedType.name.replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase())
        : 'this type';
      showToast(
        `The '${typeName}' type requires ${labels}. Please fill ${missingRequiredFields.length === 1 ? 'it' : 'them'} in before saving.`,
        'error'
      );
      return;
    }

    // Email and Phone number validation
    if (!validateEmailAndPhone(dynamicFields, fieldValues, null)) {
      return;
    }

    const contributionApi = contributionApiRef?.current;
    if (contributionApi?.hasContribution) {
      const contributionCheck = await contributionApi.requestValidate();
      if (!contributionCheck.ok) {
        showToast(
          contributionCheck.error || 'Fix contribution errors before saving',
          'error',
        );
        return;
      }
    }

    setLoading(true);
    try {
      const firstUrlInBody = bodyEnabled ? extractFirstUrl(body) : '';
      const linkPreviewToStore =
        linkPreview &&
        firstUrlInBody &&
        linkPreview.url === firstUrlInBody &&
        (linkPreview.title ||
          linkPreview.description ||
          linkPreview.image ||
          linkPreview.site_name)
          ? { _link_preview: { ...linkPreview } }
          : {};

      const fallbackValues = createCustomFieldFallback?.() ?? {};
      const mergedFieldValues = { ...fieldValues };
      for (const [key, val] of Object.entries(fallbackValues)) {
        const cur = mergedFieldValues[key];
        if (cur === undefined || cur === null || cur === '') {
          mergedFieldValues[key] = val;
        }
      }
      // seed_from is a UI-only field — never persist it on the saved entry.
      delete mergedFieldValues['seed_from'];

      // Identify and extract File uploads from custom fields
      const cleanedFieldValues = { ...mergedFieldValues };
      const pendingUploads: Record<string, File[]> = {};
      for (const field of dynamicFields) {
        if (field.type === 'file' || field.type === 'files') {
          const val = mergedFieldValues[field.key];
          const files: File[] = [];
          const ids: string[] = [];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item instanceof File) {
                files.push(item);
              } else if (item && typeof item === 'object' && (item as any).file instanceof File) {
                files.push((item as any).file);
              } else if (typeof item === 'string') {
                ids.push(item);
              }
            }
          } else if (val instanceof File) {
            files.push(val);
          } else if (val && typeof val === 'object' && (val as any).file instanceof File) {
            files.push((val as any).file);
          } else if (typeof val === 'string' && val) {
            ids.push(val);
          }

          if (files.length > 0) {
            pendingUploads[field.key] = files;
          }
          cleanedFieldValues[field.key] = field.type === 'files' ? ids : (ids[0] ?? null);
        }
      }

      const derivedTitle =
        title.trim() ||
        (ownsForm ? deriveTitleFromFields(cleanedFieldValues, titleFromFields) : '');
      const created = await entriesApi.create({
        track_id: tid,
        type,
        type_id: selectedTypeId || undefined,
        title: derivedTitle || undefined,
        description: bodyEnabled ? body.trim() || undefined : undefined,
        tags: selectedTagIds.length ? selectedTagIds : undefined,
        custom_fields: (() => {
          const cf = buildCustomFieldsForEntryType(
            dynamicFields,
            cleanedFieldValues,
            null,
            linkPreviewToStore
          );
          if (slug(String(type || selectedType?.name || '')) === 'sprint') {
            // Task.sprint is SoT — do not persist Sprint.tasks (dual REFERENCES).
            delete cf.tasks;
          }
          return cf;
        })(),
      });

      // Assign selected tasks to the newly created sprint
      if (slug(String(type || selectedType?.name || '')) === 'sprint') {
        const taskIds = Array.isArray(cleanedFieldValues.tasks)
          ? (cleanedFieldValues.tasks as string[])
          : typeof cleanedFieldValues.tasks === 'string' && cleanedFieldValues.tasks
          ? [cleanedFieldValues.tasks]
          : [];
        for (const taskId of taskIds) {
          try {
            const currentTask = await entriesApi.get(taskId);
            await entriesApi.update(taskId, {
              custom_fields: {
                ...((currentTask.custom_fields || {}) as Record<string, unknown>),
                sprint: created.id,
              },
            });
          } catch {
            /* skip unreachable or forbidden task updates */
          }
        }
      }

      // Upload the pending files against the newly created entry id
      const finalCustomFields: Record<string, unknown> = {};
      let hasPendingUploads = false;
      for (const [key, files] of Object.entries(pendingUploads)) {
        const field = dynamicFields.find(f => f.key === key);
        const many = field?.type === 'files';
        const uploadedIds: string[] = [];
        for (const file of files) {
          const record = await attachmentsApi.smartUploadForEntry(created.id, file);
          if (record.id) {
            uploadedIds.push(record.id);
          }
        }
        if (uploadedIds.length > 0) {
          const existingIds = many ? (cleanedFieldValues[key] as string[] || []) : (cleanedFieldValues[key] ? [cleanedFieldValues[key] as string] : []);
          const mergedIds = [...existingIds, ...uploadedIds];
          finalCustomFields[key] = many ? mergedIds : mergedIds[0];
          hasPendingUploads = true;
        }
      }

      // Update the entry custom fields if any files were uploaded
      if (hasPendingUploads) {
        await entriesApi.update(created.id, {
          custom_fields: finalCustomFields
        });
        if (created.custom_fields) {
          Object.assign(created.custom_fields, finalCustomFields);
        }
      }

      if (pendingFiles.length) {
        for (const file of pendingFiles) {
          await attachmentsApi.smartUploadForEntry(created.id, file);
        }
      }
      const urlItems = pendingUrlAttachments.filter(
        item =>
          typeof item.url === 'string' &&
          /^https?:\/\//i.test(item.url.trim())
      );
      for (const item of urlItems) {
        await attachmentsApi.createUrlForEntry(
          created.id,
          item.url.trim(),
          item.label?.trim() || undefined
        );
      }

      let contributionFailed = false;
      if (contributionApi?.hasContribution) {
        contributionApi.notifyCommitted(created.id, 'create');
        try {
          const submitResult = await contributionApi.requestSubmit(created.id);
          if (!submitResult.ok) {
            contributionFailed = true;
            showToast(
              submitResult.error ||
                'Entry created but related data could not be saved. Open it to finish the missing rows.',
              submitResult.outcomeRecorded ? 'info' : 'error',
              {
                label: 'View entry',
                href: entryPath(created.id, tid),
              },
            );
          }
        } catch (contribErr) {
          contributionFailed = true;
          showToast(
            contribErr instanceof Error
              ? contribErr.message
              : 'Entry created but related data could not be saved. Open it to finish the missing rows.',
            'error',
            {
              label: 'View entry',
              href: entryPath(created.id, tid),
            },
          );
        }
      }

      setTitle('');
      setBody('');
      // B-ENT-05: do NOT reset type to 'post' — the next entry on the
      // same track most likely shares the same type the user just
      // submitted (e.g. Deal → Deal). Resetting to 'post' caused the
      // quick-add placeholder to flip from "Add a deal…" to "Add a
      // post…" after the first save.
      setSelectedTagIds([]);
      setFieldValues({});
      setPendingFiles([]);
      setPendingUrlAttachments([]);
      setLinkPreview(null);
      setDismissedPreviewUrl('');
      onCreated?.(created);
      if (!contributionFailed) {
        showToast('Entry created!', 'success', {
          label: 'View entry',
          href: entryPath(created.id, tid)
        });
      }
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to create entry'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEdit = async (entryId: string) => {
    const baseline = baselineEntryRef.current;
    if (!baseline) {
      showToast('Nothing to save', 'error');
      throw new Error('missing baseline');
    }
    const hasPrimaryContent =
      Boolean(titleEnabled && title.trim()) || Boolean(bodyEnabled && body.trim());
    if (!ownsForm && (titleEnabled || bodyEnabled) && !hasPrimaryContent) {
      showToast('Add some content', 'error');
      throw new Error('validation');
    }
    // Validate required custom fields for the selected entry type before
    // submitting — prevents a 400 from the backend when the user changes
    // type (e.g. to "Bug") without filling in required fields (e.g. "Severity").
    const missingFields = dynamicFields.filter(field => {
      if (!field.required) return false;
      const mergedValue =
        fieldValues[field.key] !== undefined
          ? fieldValues[field.key]
          : (baseline.custom_fields || {})[field.key];
      if (Array.isArray(mergedValue)) return mergedValue.length === 0;
      return (
        mergedValue === undefined ||
        mergedValue === null ||
        mergedValue === ''
      );
    });
    if (missingFields.length > 0) {
      const labels = missingFields.map(f => `"${f.name || f.key}"`).join(', ');
      const typeName = selectedType?.name
        ? selectedType.name.replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase())
        : 'this type';
      showToast(
        `The '${typeName}' type requires ${labels}. Please fill ${missingFields.length === 1 ? 'it' : 'them'} in before saving.`,
        'error'
      );
      throw new Error('validation');
    }

    // Email and Phone number validation
    if (!validateEmailAndPhone(dynamicFields, fieldValues, baseline.custom_fields)) {
      throw new Error('validation');
    }

    const contributionApi = contributionApiRef?.current;
    if (contributionApi?.hasContribution) {
      const contributionCheck = await contributionApi.requestValidate();
      if (!contributionCheck.ok) {
        showToast(
          contributionCheck.error || 'Fix contribution errors before saving',
          'error',
        );
        throw new Error('validation');
      }
    }

    setLoading(true);
    try {
      const firstUrl = bodyEnabled ? extractFirstUrl(body) : '';
      const linkPreviewPatch =
        linkPreview &&
        firstUrl &&
        linkPreview.url === firstUrl &&
        (linkPreview.title ||
          linkPreview.description ||
          linkPreview.image ||
          linkPreview.site_name)
          ? { _link_preview: { ...linkPreview } }
          : null;
      const linkExtras: Record<string, unknown> = {};
      if (linkPreviewPatch) {
        Object.assign(linkExtras, linkPreviewPatch);
      } else if (!firstUrl) {
        linkExtras._link_preview = null;
      } else if (dismissedPreviewUrl && dismissedPreviewUrl === firstUrl) {
        linkExtras._link_preview = null;
      }
      const custom_fields = buildCustomFieldsForEntryType(
        dynamicFields,
        fieldValues,
        baseline.custom_fields,
        linkExtras,
        { changedOnly: true }
      );
      if (slug(String(type || selectedType?.name || '')) === 'sprint') {
        // Task.sprint is SoT — do not persist Sprint.tasks (dual REFERENCES).
        delete custom_fields.tasks;
      }

      const updated = await entriesApi.update(entryId, {
        title:
          title.trim() ||
          (ownsForm ? deriveTitleFromFields(fieldValues, titleFromFields) : '') ||
          undefined,
        body: bodyEnabled ? body : undefined,
        description: bodyEnabled ? body : undefined,
        custom_fields,
        type_id: selectedTypeId || undefined,
        tags: selectedTagIds
      });

      // Synchronize Task.sprint backlinks for sprint task membership
      if (slug(String(type || selectedType?.name || '')) === 'sprint') {
        const nextTaskIds = Array.isArray(fieldValues.tasks)
          ? (fieldValues.tasks as string[])
          : typeof fieldValues.tasks === 'string' && fieldValues.tasks
          ? [fieldValues.tasks]
          : [];
        const syncPlan = planSprintTaskMembershipSync({
          nextTaskIds,
          referencedBy: baseline.referenced_by as Array<{ id: string; field_key?: string | null }> | undefined,
          currentTaskIds: (baseline.custom_fields || {})?.tasks,
        });
        for (const addId of syncPlan.toAdd) {
          try {
            const currentTask = await entriesApi.get(addId);
            await entriesApi.update(addId, {
              custom_fields: {
                ...((currentTask.custom_fields || {}) as Record<string, unknown>),
                sprint: entryId,
              },
            });
          } catch {
            /* skip */
          }
        }
        for (const remId of syncPlan.toRemove) {
          try {
            const currentTask = await entriesApi.get(remId);
            const currentSprintId = (currentTask.custom_fields || {})?.sprint;
            if (shouldClearTaskSprintLink(currentSprintId, entryId)) {
              await entriesApi.update(remId, {
                custom_fields: { sprint: null },
              });
            }
          } catch {
            /* skip */
          }
        }
      }
      if (pendingFiles.length) {
        for (const file of pendingFiles) {
          await attachmentsApi.smartUploadForEntry(entryId, file);
        }
      }
      const urlItems = pendingUrlAttachments.filter(
        item =>
          typeof item.url === 'string' &&
          /^https?:\/\//i.test(item.url.trim())
      );
      for (const item of urlItems) {
        await attachmentsApi.createUrlForEntry(
          entryId,
          item.url.trim(),
          item.label?.trim() || undefined
        );
      }
      if (contributionApi?.hasContribution) {
        contributionApi.notifyCommitted(entryId, 'edit');
        try {
          const submitResult = await contributionApi.requestSubmit(entryId);
          if (!submitResult.ok) {
            showToast(
              submitResult.error ||
                'Entry updated but contribution data could not be saved',
              submitResult.outcomeRecorded ? 'info' : 'error',
            );
          }
        } catch {
          /* toast already covers create path; keep edit resilient */
        }
      }
      setPendingFiles([]);
      setPendingUrlAttachments([]);
      const entryTrackId =
        baseline.track_id ||
        baseline.track?.id ||
        track?.id ||
        '';
      showToast(
        'Entry updated',
        'success',
        entryTrackId
          ? { label: 'View entry', href: entryPath(entryId, entryTrackId) }
          : undefined,
      );
      return updated;
    } catch (e: unknown) {
      showToast(errorMessageFromAxios(e, 'Failed to update entry'), 'error');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const cancelCreate = () => {
    setTitle('');
    setBody('');
    setPendingFiles([]);
    setPendingUrlAttachments([]);
    setLinkPreview(null);
    setDismissedPreviewUrl('');
  };

  return {
    entryTypes,
    loading,
    needsTrackPicker,
    tracksList,
    selectedTrackId,
    setSelectedTrackId,
    type,
    setType: setTypeFromUser,
    typeOptions,
    profileInformedTags,
    tagOptions,
    selectedTagIds,
    setSelectedTagIds,
    title,
    setTitle,
    body,
    setBody,
    composerRows,
    effectiveTitlePlaceholder,
    effectiveBodyPlaceholder,
    titleBase,
    bodyBase,
    titleEnabled,
    bodyEnabled,
    attachmentsEnabled,
    allowFileUpload,
    allowUrlReference,
    attachmentsHelp,
    linkPreviewLoading,
    linkPreview,
    dismissedPreviewUrl,
    dismissLinkPreview,
    pendingFiles,
    setPendingFiles,
    pendingUrlAttachments,
    setPendingUrlAttachments,
    addPendingFiles,
    addLinkAttachment,
    renderDynamicField,
    handleSubmitCreate,
    handleSubmitEdit,
    cancelCreate,
    composerInviteText,
    composerActionLabel,
    fieldValues,
    setFieldValues,
    applyContributionPatch,
    composeExtraSection,
    ownsForm,
    dynamicFields,
    entryTypeFormSchema,
    appId,
    initialEntry,
  };
}

export interface EntryFormExpandedViewProps
  extends Omit<EntryExpandedFormModel, 'composerInviteText' | 'composerActionLabel'> {
  primaryLabel: string;
  primaryIcon?: ReactNode;
  onPrimary: () => void | Promise<void>;
  onCancel?: () => void;
  /** Optional block inside the attachments row (e.g. existing attachments in edit). */
  extraAttachmentsSection?: ReactNode;
  /**
   * Omit the attachments row entirely — control, pending list and all.
   *
   * For hosts that already own attachments elsewhere on the same surface:
   * the entry dialog puts them in its companion panel, so rendering the
   * form's control too gives one dialog two "Add to this entry" affordances
   * that behave differently (this one queues until save; the panel uploads
   * immediately).
   */
  hideAttachmentsRow?: boolean;
  /** Wiki / inline page: borderless layout, larger title/body, optional status row. */
  layout?: 'composer' | 'wiki';
  /** Shown left of action buttons when ``layout="wiki"``. */
  statusSlot?: ReactNode;
  /** Wiki pages render markdown only — no link-preview fetch UI. */
  hideLinkPreview?: boolean;
  /** Wiki: actions live in a sticky page header — omit the bottom action row. */
  hideActions?: boolean;
  /** Ref for the title input — wired to Modal initialFocusRef on create dialogs. */
  // React 18's RefObject<T> already types `current` as T | null; the extra
  // `| null` here made it un-assignable to the DOM `ref` prop. Callers pass
  // useRef<HTMLInputElement>(null), which is exactly RefObject<HTMLInputElement>.
  titleInputRef?: React.RefObject<HTMLInputElement>;
  /** Focus title on mount with cursor at end (quick-add handoff). */
  focusTitleOnMount?: boolean;
  /** Dismiss host dialog before following relation / anchor-track links. */
  onNavigate?: () => void;
  navContext?: import('./relations/routeForRelationTarget').RelationNavContext | null;
  mode?: 'create' | 'edit';
  workflowEnumLabels?: Record<string, Record<string, string>>;
}

export function EntryFormExpandedView({
  needsTrackPicker,
  tracksList,
  selectedTrackId,
  setSelectedTrackId,
  type,
  setType,
  typeOptions,
  entryTypes,
  profileInformedTags,
  tagOptions,
  selectedTagIds,
  setSelectedTagIds,
  title,
  setTitle,
  body,
  setBody,
  composerRows,
  effectiveTitlePlaceholder,
  effectiveBodyPlaceholder,
  titleBase,
  bodyBase,
  titleEnabled: _titleEnabled,
  bodyEnabled: _bodyEnabled,
  attachmentsEnabled: _attachmentsEnabled,
  allowFileUpload,
  allowUrlReference,
  attachmentsHelp,
  linkPreviewLoading,
  linkPreview,
  dismissedPreviewUrl: _dismissedPreviewUrl,
  dismissLinkPreview,
  pendingFiles,
  setPendingFiles,
  pendingUrlAttachments,
  setPendingUrlAttachments,
  addPendingFiles,
  addLinkAttachment,
  renderDynamicField,
  loading,
  primaryLabel,
  primaryIcon,
  onPrimary,
  onCancel,
  extraAttachmentsSection,
  hideAttachmentsRow = false,
  layout = 'composer',
  statusSlot,
  hideLinkPreview = false,
  hideActions = false,
  titleInputRef,
  focusTitleOnMount = false,
  onNavigate,
  navContext,
  composeExtraSection,
  ownsForm = false,
  dynamicFields: _dynamicFields,
  mode: _mode = 'create',
  workflowEnumLabels: _workflowEnumLabels,
}: EntryFormExpandedViewProps) {
  const dynamicFieldsCount = composerRows.filter(r => r.kind === 'field').length;
  const isWiki = layout === 'wiki';
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!focusTitleOnMount) return;
    const el = titleInputRef?.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [focusTitleOnMount, titleInputRef, title]);

  useEffect(() => {
    if (isWiki) return;
    const el = bodyTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body, isWiki]);

  return (
    <div className={isWiki ? 'space-y-6' : 'p-5 space-y-4'}>
      {isWiki ? (
        <details className="group/properties text-sm">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
              Page properties
            </span>
            <span className="text-xs opacity-60 group-open/properties:hidden">
              · type, tags
            </span>
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]">
            <label className="inline-flex items-center gap-1.5 min-w-0">
              <span className="text-[var(--text-subtle)] shrink-0">Type</span>
              <AppSelect
                variant="field"
                value={type}
                onValueChange={setType}
                options={typeOptions.map(t => {
                  const matchingType = entryTypes.find(x => entryTypeSlug(x) === slug(t));
                  return {
                    value: t,
                    label: matchingType?.name || humanizeEnumValue(t)
                  };
                })}
                className="!min-w-[5.5rem] !w-auto !border-0 !bg-transparent !px-0 !py-0 !shadow-none text-[var(--text)] text-xs font-medium"
                aria-label="Entry type"
              />
            </label>
            {needsTrackPicker && tracksList.length > 0 && (
              <label className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                <span className="text-[var(--text-subtle)] shrink-0">Track</span>
                <AppSelect
                  variant="field"
                  value={selectedTrackId}
                  onValueChange={setSelectedTrackId}
                  options={[
                    { value: '', label: 'Enter track…' },
                    ...tracksList.map(t => ({ value: t.id, label: t.title })),
                  ]}
                  className="!min-w-[6rem] !max-w-[14rem] !w-auto !border-0 !bg-transparent !px-0 !py-0 !shadow-none text-[var(--text)] text-xs"
                  aria-label="Target track"
                />
              </label>
            )}
            <TagLookupControl
              className="flex-1 min-w-[min(100%,10rem)] max-w-full sm:max-w-md [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!py-0.5 [&_button]:!text-xs"
              selectableTags={profileInformedTags}
              labelSource={tagOptions}
              selectedIds={selectedTagIds}
              onChangeSelected={setSelectedTagIds}
            />
          </div>
        </details>
      ) : (
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <AppSelect
          variant="pill"
          value={type}
          onValueChange={setType}
          options={typeOptions.map(t => {
            const matchingType = entryTypes.find(x => entryTypeSlug(x) === slug(t));
            return {
              value: t,
              label: matchingType?.name || humanizeEnumValue(t)
            };
          })}
          className="font-semibold shrink-0"
          aria-label="Entry type"
        />
        {needsTrackPicker && tracksList.length > 0 && (
          <AppSelect
            variant="pill"
            value={selectedTrackId}
            onValueChange={setSelectedTrackId}
            options={[
              { value: '', label: 'Enter track…' },
              ...tracksList.map(t => ({ value: t.id, label: t.title })),
            ]}
            className="font-medium shrink-0 max-w-[min(100%,16rem)]"
            aria-label="Target track"
          />
        )}
        <TagLookupControl
          className="flex-1 min-w-[min(100%,8.5rem)] max-w-full sm:max-w-md"
          selectableTags={profileInformedTags}
          labelSource={tagOptions}
          selectedIds={selectedTagIds}
          onChangeSelected={setSelectedTagIds}
        />
      </div>
      )}

      {ownsForm
        ? null
        : composerRows.map(row => {
        if (row.kind === 'title') {
          const titleSlotLabel = String(titleBase.label || '').trim() || CANONICAL_TITLE_LABEL;
          return (
            <div key="title" className="space-y-1">
              <input
                ref={titleInputRef}
                key={`title-${type}`}
                placeholder={effectiveTitlePlaceholder}
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus={!focusTitleOnMount}
                aria-label={titleSlotLabel}
                className={
                  isWiki
                    ? 'w-full px-0 text-2xl font-semibold tracking-tight text-[var(--text)] placeholder:text-[var(--text-subtle)] border-none outline-none bg-transparent'
                    : 'w-full px-3 text-base font-semibold text-[var(--text)] placeholder:text-[var(--text-muted)] border-none outline-none bg-transparent'
                }
              />
              {titleBase.help ? (
                <p className="text-xs text-[var(--text-muted)] pl-3">{titleBase.help}</p>
              ) : null}
            </div>
          );
        }
        if (row.kind === 'field') {
          return (
            <div key={row.field.key}>
              {renderDynamicField(row.field, { onNavigate, navContext })}
            </div>
          );
        }
        if (row.kind === 'body') {
          const bodySlotLabel = String(bodyBase.label || '').trim() || CANONICAL_BODY_LABEL;
          return (
            <div
              key="body"
              className={`space-y-1.5 ${dynamicFieldsCount > 0 ? 'pt-3' : ''}`}
            >
              {isWiki ? (
                <Suspense
                  fallback={
                    <Skeleton className="h-[18rem] w-full rounded-lg" aria-hidden />
                  }
                >
                  <WikiRichTextEditor
                    key={`wiki-body-${type}`}
                    value={body}
                    onChange={setBody}
                    placeholder={effectiveBodyPlaceholder}
                    trackId={selectedTrackId || undefined}
                    aria-label={bodySlotLabel}
                  />
                </Suspense>
              ) : (
                <MentionableTextarea
                  key={`body-${type}`}
                  ref={bodyTextareaRef}
                  placeholder={effectiveBodyPlaceholder}
                  value={body}
                  onChange={setBody}
                  rows={1}
                  aria-label={bodySlotLabel}
                  className="w-full px-3 py-0.5 text-sm font-normal leading-normal text-[var(--text)] placeholder:text-[var(--text-muted)] border-none outline-none bg-transparent resize-none overflow-hidden"
                  trackId={selectedTrackId || undefined}
                />
              )}
              {bodyBase.help ? (
                <p className="text-xs text-[var(--text-muted)] pl-3">{bodyBase.help}</p>
              ) : null}
              {!hideLinkPreview && (linkPreviewLoading || linkPreview) && (
                <div className="rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[var(--text-muted)]">
                      {linkPreviewLoading ? 'Fetching link preview…' : 'Link preview'}
                    </p>
                    {!linkPreviewLoading && linkPreview?.url && (
                      <button
                        type="button"
                        className="text-[var(--text-muted)] hover:text-[var(--text)]"
                        onClick={dismissLinkPreview}
                        aria-label="Dismiss preview"
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </div>
                  {linkPreview && (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-[var(--text)] font-medium line-clamp-1">
                        {linkPreview.title || linkPreview.url}
                      </p>
                      {linkPreview.description && (
                        <p className="text-[var(--text-muted)] line-clamp-2">
                          {linkPreview.description}
                        </p>
                      )}
                      <p className="text-[var(--link)] line-clamp-1">
                        {linkPreview.site_name || linkPreview.url}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }
        if (row.kind === 'attachments') {
          if (hideAttachmentsRow) return null;
          return (
            <div key="attachments" className="space-y-2">
              <AddToEntryControl
                allowFileUpload={allowFileUpload}
                allowUrlReference={allowUrlReference}
                onFilesAdded={addPendingFiles}
                onLinkAdded={allowUrlReference ? addLinkAttachment : undefined}
                hint={attachmentsHelp || undefined}
              />
              {extraAttachmentsSection}
              {(pendingFiles.length > 0 || pendingUrlAttachments.length > 0) && (
                <div className="space-y-1 rounded-md border border-[var(--panel-border)] border-dashed bg-[var(--panel-2)]/20 px-2 py-2">
                  {pendingFiles.map(file => (
                    <div
                      key={file.name + String(file.lastModified)}
                      className="flex items-center justify-between text-xs text-[var(--text)]"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        className="text-[var(--text-muted)] hover:text-[var(--text)] p-1"
                        onClick={() =>
                          setPendingFiles(prev =>
                            prev.filter(
                              x =>
                                !(
                                  x.name === file.name &&
                                  x.lastModified === file.lastModified
                                )
                            )
                          )
                        }
                        aria-label={`Remove ${file.name}`}
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))}
                  {pendingUrlAttachments.map(item => (
                    <div
                      key={item.url}
                      className="flex items-center justify-between text-xs text-[var(--text)]"
                    >
                      <span className="truncate inline-flex items-center gap-1">
                        <Link2 size={12} />
                        {item.label || item.url}
                      </span>
                      <button
                        type="button"
                        className="text-[var(--text-muted)] hover:text-[var(--text)] p-1"
                        onClick={() =>
                          setPendingUrlAttachments(prev =>
                            prev.filter(x => x.url !== item.url)
                          )
                        }
                        aria-label={`Remove ${item.url}`}
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return null;
      })}
      {composeExtraSection}
      {!hideActions ? (
        <div
          className={
            isWiki
              ? 'flex flex-col gap-2 pt-2 border-t border-[var(--panel-border)] sm:flex-row sm:items-center sm:justify-between'
              : 'flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end'
          }
        >
          {isWiki && statusSlot ? (
            <div className="text-xs text-[var(--text-subtle)] min-h-[1.25rem]">{statusSlot}</div>
          ) : null}
          <div
            className={
              isWiki
                ? 'flex flex-row items-center justify-end gap-2'
                : 'flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end w-full sm:w-auto'
            }
          >
            {onCancel ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              variant={isWiki ? 'secondary' : 'primary'}
              size="sm"
              loading={loading}
              icon={primaryIcon}
              onClick={() => void onPrimary()}
              className="w-full sm:w-auto"
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
