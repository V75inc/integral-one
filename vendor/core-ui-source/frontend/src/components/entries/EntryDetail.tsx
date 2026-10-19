import { PostToFeedDialog } from './PostToFeedDialog';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { entryTypesForTrackQueryKey, invalidateFeedCaches, viewsForTrackQueryKey } from '../../queryKeys';
import {
  Edit2,
  X,
  Trash2,
  File,
  CornerUpLeft,
  ArrowUpRight,
  ChevronLeft,
  PanelRightOpen,
  PanelRightClose,
  MessageSquare,
  Paperclip,
  Activity,
  Rocket,
  LayoutTemplate,
  Maximize2,
  Send,
  Minimize2,
} from 'lucide-react';
import { isSamePrincipal, formatRelativeTime, entryTypeColor } from '../../utils';
import { appPath, entryPagePath } from '../../utils/resourcePaths';
import {
  attachmentsApi,
  commentsApi,
  entriesApi,
  entryTypesApi,
  tracksApi,
  trackViewsApi,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useScope } from '../../context/ScopeContext';
import { useChatPageContext } from '../../context/ChatPageFocusContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../features/settings/store';
import { Avatar, Button, KebabMenu, type KebabMenuItem, LINE_ICON_STROKE, MarkdownContent, Pill } from '../ui';
import { Modal } from '../ui/Modal';
import { EntryDetailPageChrome } from './EntryDetailPageChrome';
import { EntryCanvasPane } from './EntryCanvasPane';
import { AddToEntryControl } from './AddToEntryControl';
import { CommentsPanel, COMMENT_FOOTER_CLASS } from './comments/CommentsPanel';
import { CommentComposer } from './comments/CommentComposer';
import {
  RelatedViewsSection,
  splitRelatedViewsByPosition,
} from './RelatedViewsSection';
import { ViewTabs, type ViewTabOption } from '../ui/ViewTabs';
import { EmptyState } from '../ui/EmptyState';
import { IconButton, Text } from '../../ui';
import { useSidePanelRoom } from '../../hooks/useSidePanelRoom';
import { COMMENT_REFETCH_EVENT } from '../../services/graphMutationInvalidation';
import { EntrySocialActions } from './EntrySocialActions';
import { AttachmentRowList } from './attachments';
import type { AttachmentRecord } from '../../api/attachments';
import { EntryFormExpandedView, useEntryExpandedForm } from './EntryFormExpanded';
import { EntryMetaFields } from './EntryMetaFields';
import { EntryComposeModal, type EntryComposeSeed } from './EntryComposer';
import {
  isViewDesignerEnabled,
  resolveDesignerTargetView,
  viewMissingManifestKey,
  ViewDesignerShell,
} from '../../features/view-designer';
import { useTrackViews } from '../../hooks/useTrackViews';
import {
  EntryContributionSlot,
  contributionOwnsForm,
  resolveEntryContribution,
  type EntryContributionSlotHandle,
} from './EntryContributionSlot';
import { ProvenanceBadge } from './ProvenanceBadge';
import { EntryAgentUndoButton } from './EntryAgentUndoButton';
import { ImproveThisButton } from '../tracks/ImproveThisButton';
import { WatchersControl } from './WatchersControl';
import {
  planSprintTaskMembershipSync,
  shouldClearTaskSprintLink,
} from './sprintTaskSync';
import { ActivityPanel } from '../activity/ActivityPanel';
import { firstImageAttachmentFromAttachments, CARD_PREVIEW_ATTACHMENT_FIELD } from '../../utils/entryMedia';
import { sortFieldsByOrder } from '../../utils/entryMetaFields';
import { tagColorStyle } from '../../utils/tagColor';
import type {
  Attachment,
  Comment,
  OperationalModelFieldSpec,
  Entry,
  EntryTypeNode,
  Reaction,
  SavedView,
  StoredLinkPreview,
  Track
} from '../../types';
import { useCanEditEntry, resolveTrackPermissions, fetchTrackWithCollaborators } from '../../utils/entryEditRights';
import type { EntryCreateInput } from '../../views/types';

function prettifyType(type: string): string {
  if (!type) return '';
  const cleaned = type.trim().replace(/[_-]+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** Stable empty list for ``useEntryExpandedForm`` — inline ``[]`` is a new reference every render and retriggers fetch effects. */
const EMPTY_TRACKS_LIST: Track[] = [];

function slug(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface EntryDetailProps {
  entry: Entry;
  onClose(): void;
  onUpdate?(e: Entry): void;
  /** Optimistically remove the entry from the parent list (feed / track cache). */
  onDelete?(entryId: string): void;
  /** When true, scroll the comments section into view after load (e.g. from Comments on card). */
  initialFocusComments?: boolean;
  /** When true (e.g. opened from card ⋯ → Edit), show the entry editor immediately. */
  initialEditMode?: boolean;
  /** Track-level edit authority (editor / admin / owner). When omitted, resolved via hook. */
  canEdit?: boolean;
  /** When omitted, derived from ``track`` + signed-in user. */
  canComment?: boolean;
  /** Optional track context to avoid a per-entry fetch when the parent already has it. */
  track?: Track | null;
  /** Kanban workflow field key → enum key → display label (for select / multi_select). */
  workflowEnumLabels?: Record<string, Record<string, string>>;
  /**
   * ``'modal'`` (default): today's overlay dialog, unchanged.
   * ``'page'``: full-page chrome (EntryDetailPageChrome) instead of Modal —
   * used by EntryPage.tsx for entry types with
   * ``form_schema.open_as_page: true``. Every other caller keeps passing
   * nothing and gets the exact same Modal behavior as before.
   */
  variant?: 'modal' | 'page';
}

type PanelTabKey = 'comments' | 'attachments' | 'activity';

/** Companion-column tabs, in reading order. */
const PANEL_TABS: { key: PanelTabKey; label: string }[] = [
  { key: 'comments', label: 'Comments' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'activity', label: 'Activity' },
];

export function EntryDetail({
  entry: initialEntry,
  onClose,
  onUpdate,
  onDelete,
  initialFocusComments = false,
  initialEditMode = false,
  canEdit: canEditProp,
  canComment: canCommentProp,
  track,
  workflowEnumLabels,
  variant
}: EntryDetailProps) {
  const navigateToEntryPage = useNavigate();
  const { user } = useAuth();
  const { activeWorkspace } = useScope();
  const trackId = initialEntry.track_id || '';
  const shouldFetchTrack = !track && !!trackId;
  const { data: fetchedTrack } = useQuery({
    queryKey: ['track', trackId, 'edit-rights'],
    queryFn: () => fetchTrackWithCollaborators(trackId),
    enabled: shouldFetchTrack,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 5_000
  });
  const trackContext = track ?? fetchedTrack ?? null;
  const canComment =
    canCommentProp ??
    resolveTrackPermissions(user, trackContext).canComment;
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { showToast, showPendingToast, resolveToast } = useToast();
  const { setDialogContext, clearDialogContext } = useChatPageContext();
  const [settings, updateSettings] = useSettings();
  const entryDialogExpanded = Boolean(settings.appearance.entryDialogExpanded);

  const { data: watchersData, refetch: refetchWatchers } = useQuery({
    queryKey: ['entry', initialEntry.id, 'watchers'],
    queryFn: () => entriesApi.getWatchers(initialEntry.id),
    enabled: !!initialEntry.id
  });

  const handleToggleWatch = async () => {
    const isWatching = !!watchersData?.is_watching;
    try {
      if (isWatching) {
        await entriesApi.unwatch(initialEntry.id);
        showToast('Stopped watching entry', 'success');
      } else {
        await entriesApi.watch(initialEntry.id);
        showToast('Watching entry for updates', 'success');
      }
      refetchWatchers();
    } catch {
      showToast('Failed to update watch status', 'error');
    }
  };
  const [entry, setEntry] = useState(initialEntry);
  const [parentEntry, setParentEntry] = useState<Entry | null>(null);
  const [postToFeedOpen, setPostToFeedOpen] = useState(false);
  const canEdit = useCanEditEntry(entry, {
    track:
      trackContext && trackContext.id === entry.track_id
        ? trackContext
        : undefined,
    // Parent surface's canEditProp must not apply to a drilled-in child entry.
    explicitCanEdit: parentEntry ? undefined : canEditProp,
  });
  const [layoutDesignerOpen, setLayoutDesignerOpen] = useState(false);
  const [designerView, setDesignerView] = useState<SavedView | null>(null);
  const designerEnabled = isViewDesignerEnabled();
  const trackViewsQuery = useTrackViews(
    designerEnabled && canEdit ? entry.track_id : undefined
  );

  useEffect(() => {
    setEntry(initialEntry);
    setParentEntry(null);
  }, [initialEntry.id]);

  useEffect(() => {
    setDialogContext({
      pageKind: 'entry_dialog',
      focusedTrackId: entry.track_id || trackContext?.id || null,
      focusedEntryId: entry.id,
      visibleData: {
        entries: [
          {
            id: entry.id,
            title: entry.title || undefined,
            status: entry.status || undefined,
            entry_type: entry.type || undefined
          },
        ]
      },
      metadata: {
        entry_title: entry.title || undefined,
        track_title: trackContext?.title || undefined,
        track_id: entry.track_id || undefined
      }
    });
    return () => clearDialogContext();
  }, [
    entry.id,
    entry.title,
    entry.status,
    entry.type,
    entry.track_id,
    trackContext?.id,
    trackContext?.title,
    setDialogContext,
    clearDialogContext,
  ]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  // Backend-computed (`can_moderate` on the comments read): may this caller
  // delete comments they did not write. Drives the delete affordance only.
  const [canModerateComments, setCanModerateComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [startingProject, setStartingProject] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const entryTypeSlug = slug(entry.type || '');
  const stageValue = String(
    (entry.custom_fields as Record<string, unknown> | undefined)?.stage ?? ''
  ).toLowerCase();
  const alreadyHandedOff = (entry.referenced_by || []).some(
    (ref) => slug(ref.field_key || '') === 'transform_source'
  );
  const showStartProject =
    canEdit &&
    !isEditing &&
    entryTypeSlug === 'opportunity' &&
    stageValue === 'won' &&
    !alreadyHandedOff;

  const handleStartDeliveryProject = async () => {
    if (startingProject) return;
    setStartingProject(true);
    const toastId = showPendingToast('Starting delivery project…');
    try {
      let toTrack: string | undefined;
      try {
        const tracks = await tracksApi.list();
        // Prefer Customer Projects (CRM handoff). Title used to be "Projects";
        // template_id stays ``projects``. Never pick Internal Projects.
        const ranked = (tracks || [])
          .map((t: { id?: string; title?: string; template_id?: string }) => {
            const titleSlug = slug(t.title || '');
            const templateSlug = slug(t.template_id || '');
            let rank = 99;
            if (titleSlug === 'customer_projects') rank = 0;
            else if (titleSlug === 'projects') rank = 1;
            else if (
              templateSlug === 'projects' &&
              titleSlug !== 'internal_projects'
            )
              rank = 2;
            return { id: t.id, rank };
          })
          .filter(t => t.rank < 99 && t.id)
          .sort((a, b) => a.rank - b.rank);
        if (ranked[0]?.id) toTrack = ranked[0].id;
      } catch {
        // Resolver on the backend can still succeed without to_track.
      }
      const result = await entriesApi.transform(entry.id, {
        ...(toTrack ? { to_track: toTrack } : {}),
        hook_key: 'opportunity_to_project',
      });
      resolveToast(toastId, 'Delivery project created', 'success');
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['entry', entry.id] });
      if (result?.new_entry_id) {
        showToast('Open Projects to enrich scope and tasks', 'info');
      }
      // Refresh detail so referenced_by hides the button.
      try {
        const refreshed = await entriesApi.get(entry.id);
        setEntry(refreshed);
        onUpdate?.(refreshed);
      } catch {
        /* ignore refresh failure */
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; detail?: string } } })
          ?.response?.data?.message ||
        (err as { response?: { data?: { message?: string; detail?: string } } })
          ?.response?.data?.detail ||
        'Could not start project — is Projects installed in this workspace?';
      resolveToast(toastId, String(msg), 'error');
    } finally {
      setStartingProject(false);
    }
  };

  // Activity section is collapsed by default — it's a secondary
  // reference signal (live ChangeEvent stream) and the primary content
  // is the entry body + comments + related views. Users open it on
  // demand when they need the audit trail.
  /** Drop placeholder/duplicate rows so we do not render empty “Remove” rows. */
  const attachmentsForDisplay = useMemo(() => {
    const seen = new Set<string>();
    const out: Attachment[] = [];
    for (const a of attachments) {
      if (!a.id || !String(a.id).trim()) continue;
      const display = String(a.filename || a.external_url || '').trim();
      if (!display) continue;
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    /* Sort client-side too, matching the API's newest-first order. This list
       also carries optimistic uploads that have not round-tripped yet, so
       relying on the server's ordering alone would let a just-added file
       land in an arbitrary spot until the next fetch. */
    out.sort((a, b) => {
      const at = String(a.created_at || '');
      const bt = String(b.created_at || '');
      if (at !== bt) return at < bt ? 1 : -1;
      return String(a.id) < String(b.id) ? 1 : -1;
    });
    return out;
  }, [attachments]);

  /** Parent callbacks are often inline; must not re-trigger fetches when their identity changes. */
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const commitCustomField = useCallback(
    async (key: string, value: unknown) => {
      try {
        // Sprint.tasks is UI-managed: Task.sprint remains the source of truth.
        if (key === 'tasks' && slug(entry.type || '') === 'sprint') {
          const nextTaskIds = Array.isArray(value)
            ? (value as string[])
            : typeof value === 'string' && value
            ? [value]
            : [];
          const currentCustomTasks = (entry.custom_fields || {})?.tasks;
          const { toAdd, toRemove } = planSprintTaskMembershipSync({
            nextTaskIds,
            referencedBy: entry.referenced_by,
            currentTaskIds: currentCustomTasks,
          });

          // Optimistically update entry state immediately so UI chips remove/clear instantly
          const optimisticEntry: Entry = {
            ...entry,
            custom_fields: {
              ...((entry.custom_fields || {}) as Record<string, unknown>),
              tasks: nextTaskIds,
            },
            referenced_by: (entry.referenced_by || []).filter(
              r =>
                !(
                  toRemove.includes(r.id) &&
                  (r.field_key || '').trim().toLowerCase() === 'sprint'
                )
            ),
          };
          setEntry(optimisticEntry);
          onUpdateRef.current?.(optimisticEntry);

          // Task.sprint is SoT — do not persist Sprint.tasks (dual REFERENCES).
          await Promise.all([
            ...toAdd.map(taskId =>
              entriesApi.update(taskId, {
                custom_fields: { sprint: entry.id },
              })
            ),
            ...toRemove.map(async taskId => {
              try {
                const task = await entriesApi.get(taskId);
                if (
                  !shouldClearTaskSprintLink(
                    (task.custom_fields || {}).sprint,
                    entry.id
                  )
                ) {
                  return;
                }
                await entriesApi.update(taskId, {
                  custom_fields: { sprint: null },
                });
              } catch {
                /* best-effort clear */
              }
            }),
          ]);
          try {
            const refreshed = await entriesApi.get(entry.id);
            const merged = { ...entry, ...refreshed };
            setEntry(merged);
            onUpdateRef.current?.(merged);
          } catch {
            /* keep optimistic */
          }
          return;
        }
        const updated = await entriesApi.update(entry.id, {
          custom_fields: { [key]: value },
        });
        const merged = { ...entry, ...updated };
        setEntry(merged);
        onUpdateRef.current?.(merged);
      } catch {
        showToast('Failed to save field', 'error');
        throw new Error('save failed');
      }
    },
    [entry, showToast]
  );
  const commentsAnchorRef = useRef<HTMLDivElement>(null);
  const didFocusComments = useRef(false);
  // Remember the reader's choice across records and reopenings on this device.
  // Until they choose, dialogs show discussion and pages retain reading width.
  const commentsPanelOpen = settings.appearance.entryDetailsPanelOpen ?? (variant !== 'page');
  const setCommentsPanelOpen = useCallback((next: boolean | ((value: boolean) => boolean)) => {
    updateSettings(previous => ({
      ...previous,
      appearance: {
        ...previous.appearance,
        entryDetailsPanelOpen: typeof next === 'function'
          ? next(previous.appearance.entryDetailsPanelOpen ?? (variant !== 'page'))
          : next,
      },
    }));
  }, [updateSettings, variant]);
  const pagePanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRecordRef = useRef({ id: initialEntry.id, variant });
  const [panelTab, setPanelTab] = useState<PanelTabKey>(variant === 'page' ? 'attachments' : 'comments');
  /* Below `sm` the dialog is full-bleed, so there is no "beside" to render
     into — the panel moves into the body instead of vanishing, which is what
     it did when it was `hidden sm:flex` with no fallback: comments,
     attachments, activity AND the composer were unreachable on a phone. */
  const showSideColumn = useSidePanelRoom();

  useEffect(() => {
    // Initial state already matches this record; do not erase an early utility click.
    if (panelRecordRef.current.id === initialEntry.id && panelRecordRef.current.variant === variant) return;
    panelRecordRef.current = { id: initialEntry.id, variant };
    didFocusComments.current = false;
    // Reset utilities for each record: page files, dialog discussion.
    setPanelTab(variant === 'page' ? 'attachments' : 'comments');
  }, [initialEntry.id, variant]);

  // ESC closes the entry detail modal. Modal's built-in ESC handler is
  // disabled via `disableEscape` (below) because EntryDetail hosts inline
  // editors (entry edit form, comment compose) that should consume ESC
  // for their own cancel path BEFORE the dialog closes. We re-implement
  // ESC at the document level with that focus-aware skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || postToFeedOpen) return;
      // The page stays open. Nested drawers/viewers own their own dismissal.
      if (variant === 'page') {
        if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
        if (commentsPanelOpen && !(e.target as HTMLElement | null)?.isContentEditable &&
          !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement | null)?.tagName ?? '')) {
          setCommentsPanelOpen(false);
          pagePanelTriggerRef.current?.focus();
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          // No [aria-modal="true"] qualifier: this dialog opts into
          // allowAssistantDock, which (correctly) omits aria-modal — the old
          // selector silently stopped matching and the inner-editor skip died.
          target.closest('[role="dialog"]')?.querySelector(
            '[data-entry-detail-editing="true"]',
          )
        ) {
          // Inner editor owns ESC.
          return;
        }
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, variant, commentsPanelOpen, postToFeedOpen]);

  // Opening from a "Comments" affordance should land on that tab.
  useEffect(() => {
    if (initialFocusComments) {
      setPanelTab('comments');
      setCommentsPanelOpen(true);
    }
  }, [initialFocusComments, initialEntry.id]);

  useEffect(() => {
    if (isEditing) return;
    // While drilled into an embedded entry, do not snap back to the parent's
    // list payload when the parent refetch updates initialEntry.
    if (parentEntry) return;
    setEntry(initialEntry);
  }, [initialEntry, isEditing, parentEntry]);

  // List/card opens omit referenced_by; fetch full entry once for backlinks /
  // Start Project / sprint task membership.
  useEffect(() => {
    if (parentEntry) return;
    if (entry.referenced_by !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await entriesApi.get(entry.id);
        if (!cancelled) setEntry(prev => ({ ...prev, ...full }));
      } catch {
        /* keep list payload */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.referenced_by, parentEntry]);

  useEffect(() => {
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  const initialEntryForForm = useMemo(() => {
    if (entryTypeSlug !== 'sprint') return entry;
    const taskRefs = (entry.referenced_by ?? []).filter(
      ref => (ref.field_key || '').trim().toLowerCase() === 'sprint'
    );
    return {
      ...entry,
      custom_fields: {
        ...((entry.custom_fields || {}) as Record<string, unknown>),
        tasks: taskRefs.map(r => r.id),
      },
    };
  }, [entry, entryTypeSlug]);

  const editContributionApiRef = useRef<EntryContributionSlotHandle | null>(null);
  const editForm = useEntryExpandedForm({
    mode: 'edit',
    enabled: isEditing,
    track: entry.track,
    tracksList: EMPTY_TRACKS_LIST,
    needsTrackPicker: false,
    initialEntry: initialEntryForForm,
    workflowEnumLabels,
    showToast,
    contributionApiRef: editContributionApiRef,
    contributionPlacement: 'entry_detail',
  });

  // Canonical entry-type cache for this track. Schema edits in the
  // TrackConfigPanel invalidate this exact key, so the entry-detail
  // view re-renders with the live form_schema (fields, base_fields,
  // related_views) without needing a modal close/reopen.
  const entryTypesQuery = useQuery({
    queryKey: entryTypesForTrackQueryKey(entry.track_id),
    enabled: Boolean(entry.track_id),
    queryFn: () => entryTypesApi.list({ track_id: entry.track_id }),
    // Rematerialize may add fields (e.g. Task.sprint) — always revalidate
    // when reopening so stale cached schemas without new fields do not stick.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const matchedEntryType = useMemo(() => {
    if (entryTypesQuery.isPending || entryTypesQuery.isError) {
      return null;
    }
    const typeList = (entryTypesQuery.data ?? []) as EntryTypeNode[];
    return (
      typeList.find(
        x => slug(String(x.name || '')) === slug(entry.type || '')
      ) ?? null
    );
  }, [
    entry.type,
    entryTypesQuery.data,
    entryTypesQuery.isPending,
    entryTypesQuery.isError,
  ]);

  const dynamicFields = useMemo((): OperationalModelFieldSpec[] => {
    if (!matchedEntryType) return [];
    return sortFieldsByOrder(
      ((matchedEntryType.form_schema?.fields ?? []) as OperationalModelFieldSpec[]).filter(
        field => !field.hidden
      )
    );
  }, [matchedEntryType]);

  // Phase 3.1 Plan 03.1-04 (ANC-06) — retain related_views for RelatedViewsSection.
  const entryTypeFormSchema = matchedEntryType?.form_schema ?? null;

  // Entry canvas (entry type ``canvas`` + page variant): keep the file beside
  // the entry current. A tool or the assistant can render a new file or change
  // the entry while this page is open, so refetch on graph / staging events and
  // on a slow timer while the tab is visible.
  const canvasConfig =
    variant === 'page' ? (entryTypeFormSchema?.canvas ?? null) : null;
  const canvasEntryId = entry.id;
  useEffect(() => {
    if (!canvasConfig) return undefined;
    let cancelled = false;
    let busy = false;
    const refresh = async () => {
      if (busy || cancelled || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const [nextAttachments, nextEntry] = await Promise.all([
          attachmentsApi.listForEntry(canvasEntryId),
          entriesApi.get(canvasEntryId),
        ]);
        if (cancelled) return;
        setAttachments(prev =>
          prev.length === nextAttachments.length &&
          prev.every((a, i) => a.id === nextAttachments[i]?.id)
            ? prev
            : nextAttachments
        );
        // Compare the fields too: a tool that renders a file updates
        // custom_fields without always moving updated_at.
        setEntry(prev =>
          prev.updated_at === nextEntry.updated_at &&
          JSON.stringify(prev.custom_fields) === JSON.stringify(nextEntry.custom_fields)
            ? prev
            : nextEntry
        );
      } catch {
        /* keep showing what we have */
      } finally {
        busy = false;
      }
    };
    const onEvent = () => void refresh();
    window.addEventListener('integral:graph-changed', onEvent);
    window.addEventListener('integral:staging-state-changed', onEvent);
    const timer = window.setInterval(onEvent, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('integral:graph-changed', onEvent);
      window.removeEventListener('integral:staging-state-changed', onEvent);
    };
  }, [canvasConfig, canvasEntryId]);

  const contributionViewKey = useMemo(() => {
    const schema = editForm.entryTypeFormSchema || entryTypeFormSchema;
    const contrib =
      resolveEntryContribution(schema, 'entry_detail') ||
      resolveEntryContribution(schema, 'entry_compose');
    return contrib?.view?.trim() || null;
  }, [editForm.entryTypeFormSchema, entryTypeFormSchema]);

  const detailOwnsForm = contributionOwnsForm(
    editForm.entryTypeFormSchema || entryTypeFormSchema,
    'entry_detail'
  );

  const designerTargetView = useMemo((): SavedView | null => {
    return resolveDesignerTargetView(
      trackViewsQuery.data ?? [],
      contributionViewKey
    );
  }, [contributionViewKey, trackViewsQuery.data]);

  const showLayoutDesignerButton =
    Boolean(canEdit && designerEnabled) &&
    Boolean(contributionViewKey || designerTargetView);

  const openLayoutDesigner = useCallback(async () => {
    let target = designerTargetView;
    if (!target) {
      showToast(
        'No layout view found on this track. Open Config → Views → Design layout.',
        'error'
      );
      return;
    }
    // Heal wiped _manifest_view_key so contributions keep resolving after prior saves.
    if (contributionViewKey && viewMissingManifestKey(target)) {
      try {
        const healed = await trackViewsApi.update(target.id, {
          config: {
            ...(target.config || {}),
            _manifest_view_key: contributionViewKey,
          },
        });
        target = { ...target, ...healed };
        queryClient.setQueryData(
          viewsForTrackQueryKey(entry.track_id),
          (old: SavedView[] | undefined) =>
            old?.map(v => (v.id === target!.id ? { ...v, ...target! } : v)) ?? old
        );
      } catch {
        /* still open designer with best-effort match */
      }
    }
    setDesignerView(target);
    setLayoutDesignerOpen(true);
  }, [
    contributionViewKey,
    designerTargetView,
    entry.track_id,
    queryClient,
    showToast,
  ]);

  const editContributionSlot = (
    <EntryContributionSlot
      ref={editContributionApiRef}
      placement="entry_detail"
      appId={track?.app?.id || entry.track?.app?.id || editForm.appId}
      formSchema={editForm.entryTypeFormSchema || entryTypeFormSchema}
      trackId={entry.track_id}
      entryId={entry.id}
      entryTypeKey={entry.type}
      mode="edit"
      customFields={editForm.fieldValues}
      onDraftPatch={patch => editForm.applyContributionPatch(patch)}
    />
  );

  // ``position: 'primary'`` related_views render as the entry's main content
  // (after fields, before Comments). Non-primary keep placement after social.
  const { primaryRelatedViewsSchema, relatedRelatedViewsSchema } = useMemo(() => {
    const { primary, related } = splitRelatedViewsByPosition(
      entryTypeFormSchema?.related_views
    );
    return {
      primaryRelatedViewsSchema: { ...entryTypeFormSchema, related_views: primary },
      relatedRelatedViewsSchema: { ...entryTypeFormSchema, related_views: related },
    };
  }, [entryTypeFormSchema]);
  const relatedViewAppId =
    trackContext?.app?.id || entry.track?.app?.id || '';

  useEffect(() => {
    setIsEditing(Boolean(initialEditMode && canEdit));
  }, [initialEntry.id, initialEditMode, canEdit]);

  const isAuthor = isSamePrincipal(user, entry.author_id);

  const handleDeleteEntry = useCallback(async () => {
    const title = entry.title?.trim();
    const ok = await confirm({
      title: 'Delete entry',
      message: title
        ? `Delete “${title}”? This removes the entry and its comments. This cannot be undone.`
        : 'Delete this entry? This removes the entry and its comments. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger'
    });
    if (!ok) return;
    onDelete?.(entry.id);
    onClose();
    const pendingId = showPendingToast('Deleting…');
    try {
      await entriesApi.delete(entry.id);
      resolveToast(pendingId, 'Entry deleted', 'success');
    } catch {
      resolveToast(pendingId, 'Failed to delete; restoring…', 'error');
      try {
        await invalidateFeedCaches(queryClient);
        if (entry.track_id) {
          await queryClient.invalidateQueries({
            queryKey: ['track', entry.track_id, 'entries']
          });
        }
      } catch {
        /* non-fatal */
      }
    }
  }, [
    confirm,
    entry.id,
    entry.title,
    entry.track_id,
    onClose,
    onDelete,
    queryClient,
    resolveToast,
    showPendingToast,
  ]);

  const entryAuthorName =
    entry.author?.display_name ||
    (isAuthor ? user?.display_name : undefined) ||
    (entry.author_id ? `Member ${entry.author_id.slice(-6)}` : 'Unknown');

  // Phase 3.1 Plan 03.1-04 (ANC-06) — derive the entry's first anchored
  // Track id by inspecting relation fields whose ``target='track'`` and
  // reading the matching ``custom_fields[fieldKey]`` value. This is the
  // pre-resolution path that the synchronous :anchored_track resolver
  // consumes (RelatedViewsSection → resolveTemplateVar).
  const anchoredTrackId = useMemo<string | undefined>(() => {
    const cf = entry.custom_fields || {};
    for (const f of dynamicFields) {
      if (f.type !== 'relation') continue;
      if (f.relation?.target !== 'track') continue;
      const raw = cf[f.key];
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (id && typeof id === 'string') return id;
      if (id && typeof id === 'number') return String(id);
    }
    return undefined;
  }, [dynamicFields, entry.custom_fields]);

  const { data: anchoredEntryTypes } = useQuery({
    queryKey: entryTypesForTrackQueryKey(anchoredTrackId || ''),
    queryFn: () => entryTypesApi.list({ track_id: anchoredTrackId! }),
    enabled: Boolean(anchoredTrackId),
  });

  const anchoredTaskFields = useMemo((): OperationalModelFieldSpec[] => {
    const types = (anchoredEntryTypes ?? []) as EntryTypeNode[];
    const taskType = types.find(et => slug(et.name || '') === 'task');
    return sortFieldsByOrder(
      (taskType?.form_schema?.fields ?? []) as OperationalModelFieldSpec[]
    );
  }, [anchoredEntryTypes]);

  const handleEmbeddedEntryOpen = useCallback((task: Entry) => {
    setParentEntry(entry);
    setEntry(task);
    setIsEditing(false);
  }, [entry]);

  const handleBackToParent = useCallback(() => {
    if (!parentEntry) return;
    setEntry(parentEntry);
    setParentEntry(null);
    setIsEditing(false);
  }, [parentEntry]);

  const handleEmbeddedEntryPersist = useCallback(async (updated: Entry) => {
    const payload: Record<string, unknown> = {};
    if (updated.custom_fields !== undefined) {
      payload.custom_fields = updated.custom_fields;
    }
    if (Object.keys(payload).length === 0) return updated;
    const saved = await entriesApi.update(updated.id, payload);
    onUpdateRef.current?.(saved);
    return saved;
  }, []);

  const [embeddedViewsRevision, setEmbeddedViewsRevision] = useState(0);
  const [embeddedCompose, setEmbeddedCompose] = useState<{ track: Track; seed: EntryComposeSeed } | null>(null);

  const handleEmbeddedEntryCreate = useCallback(
    async (input: EntryCreateInput) => {
      const targetTrackId = input.track_id || anchoredTrackId;
      if (!targetTrackId) return;
      if (input.source === 'calendar') {
        const targetTrack = await tracksApi.get(targetTrackId);
        setEmbeddedCompose({
          track: targetTrack,
          seed: {
            title: input.title === 'New event' ? '' : input.title,
            type: input.type,
            custom_fields: input.custom_fields,
          },
        });
        return;
      }
      const created = await entriesApi.create({
        track_id: targetTrackId,
        title: input.title,
        type: input.type || 'task',
        custom_fields: input.custom_fields,
      });
      return created;
    },
    [anchoredTrackId]
  );

  const primaryRelatedViewsNode =
    user && !parentEntry ? (
      <RelatedViewsSection
        key={`primary-related:${entry.id}:${embeddedViewsRevision}`}
        entry={{ id: entry.id, custom_fields: entry.custom_fields }}
        entryTypeSpec={primaryRelatedViewsSchema}
        user={{ id: user.id }}
        currentTrackId={initialEntry.track_id}
        anchoredTrackId={anchoredTrackId}
        fields={anchoredTaskFields.length ? anchoredTaskFields : dynamicFields}
        entryTypes={(anchoredEntryTypes ?? []) as EntryTypeNode[]}
        onEntryOpen={handleEmbeddedEntryOpen}
        onEntryPersist={canEdit ? handleEmbeddedEntryPersist : undefined}
        onEntryCreate={canEdit ? handleEmbeddedEntryCreate : undefined}
        isEditor={canEdit}
        appId={relatedViewAppId}
        heading={null}
        testId="primary-related-views-section"
      />
    ) : null;

  const editComposeExtraSection = (
    <>
      {editContributionSlot}
      {user && !parentEntry ? (
        <RelatedViewsSection
          key={`edit-related:${entry.id}:${embeddedViewsRevision}`}
          entry={{ id: entry.id, custom_fields: editForm.fieldValues }}
          entryTypeSpec={primaryRelatedViewsSchema}
          user={{ id: user.id }}
          currentTrackId={initialEntry.track_id}
          anchoredTrackId={anchoredTrackId}
          fields={anchoredTaskFields.length ? anchoredTaskFields : dynamicFields}
          entryTypes={(anchoredEntryTypes ?? []) as EntryTypeNode[]}
          onEntryOpen={handleEmbeddedEntryOpen}
          onEntryPersist={canEdit ? handleEmbeddedEntryPersist : undefined}
          onEntryCreate={canEdit ? handleEmbeddedEntryCreate : undefined}
          isEditor={canEdit}
          appId={relatedViewAppId}
          heading={null}
          testId="primary-related-views-section"
        />
      ) : null}
    </>
  );

  useEffect(() => {
    let cancelled = false;
    attachmentsApi
      .listForEntry(entry.id)
      .then(next => {
        if (!cancelled) setAttachments(next);
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    const loadComments = () => {
      const currentRequestId = ++requestId;
      setLoadingComments(true);
      entriesApi
        .getCommentsWithMeta(entry.id)
        .then(({ comments: nextComments, canModerate }) => {
          if (cancelled || currentRequestId !== requestId) return;
          setComments(nextComments);
          setCanModerateComments(canModerate);
          setEntry(prev => {
            const n = nextComments.length;
            if (prev.comment_count === n) return prev;
            const nextEntry = { ...prev, comment_count: n };
            onUpdateRef.current?.(nextEntry);
            return nextEntry;
          });
        })
        .catch(() => {
          if (cancelled || currentRequestId !== requestId) return;
          setComments([]);
          // Fail closed — never leave a moderation control from a previous
          // entry standing after a failed read.
          setCanModerateComments(false);
        })
        .finally(() => {
          if (!cancelled && currentRequestId === requestId) {
            setLoadingComments(false);
          }
        });
    };
    const onCommentRefetch = (event: Event) => {
      const detail = (event as CustomEvent<{ entryId?: string }>).detail;
      if (detail?.entryId === entry.id) loadComments();
    };

    loadComments();
    window.addEventListener(COMMENT_REFETCH_EVENT, onCommentRefetch);
    return () => {
      cancelled = true;
      window.removeEventListener(COMMENT_REFETCH_EVENT, onCommentRefetch);
    };
  }, [entry.id]);

  useEffect(() => {
    if (
      !initialFocusComments ||
      loadingComments ||
      didFocusComments.current ||
      isEditing
    ) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      commentsAnchorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      didFocusComments.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [initialFocusComments, loadingComments, isEditing]);

  /** Quick-attach: upload one or more files directly to this entry. Drives
   * the AddToEntryControl pinned at the top of the Attachments tab. */
  const quickUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const pendingMsg =
      files.length === 1
        ? `Uploading ${files[0].name}…`
        : `Uploading ${files.length} files…`;
    showToast(pendingMsg, 'info');
    try {
      const uploaded: AttachmentRecord[] = [];
      if (files.length === 1) {
        uploaded.push(await attachmentsApi.smartUploadForEntry(entry.id, files[0]));
      } else {
        const result = await attachmentsApi.uploadManyForEntry(entry.id, files);
        result.results.forEach(r => {
          if ('attachment' in r) uploaded.push(r.attachment);
        });
      }
      if (uploaded.length) {
        setAttachments(prev => {
          const seen = new Set(prev.map(a => a.id));
          const fresh = uploaded.filter(
            r => r.id && !seen.has(r.id)
          ) as unknown as Attachment[];
          return [...prev, ...fresh];
        });
        showToast(
          uploaded.length === 1
            ? '1 attachment uploaded'
            : `${uploaded.length} attachments uploaded`,
          'success'
        );
      } else {
        showToast('Upload failed', 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      showToast(msg, 'error');
    }
  };

  /** Read-only quick-attach: add a URL reference. Validation already
   * happened in AddToEntryControl, so we just call the API + refresh. */
  const quickAddLink = async (url: string, label?: string) => {
    try {
      const record = await attachmentsApi.createUrlForEntry(entry.id, url, label);
      setAttachments(prev => {
        if (prev.some(a => a.id === record.id)) return prev;
        return [...prev, record as unknown as Attachment];
      });
      showToast('Link attached', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not attach link';
      showToast(msg, 'error');
    }
  };

  const bumpCommentCount = (next: Comment[]) => {
    const nextCount = next.length;
    setEntry(prev => {
      const nextEntry = { ...prev, comment_count: nextCount };
      onUpdateRef.current?.(nextEntry);
      return nextEntry;
    });
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const c = await entriesApi.addComment(entry.id, commentText.trim());
      setComments(p => {
        const next = [...p, c];
        bumpCommentCount(next);
        return next;
      });
      setCommentText('');
    } catch {
      showToast('Failed to post comment', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const submitReply = async () => {
    if (!replyingToId || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const c = await entriesApi.addComment(
        entry.id,
        replyText.trim(),
        replyingToId
      );
      setComments(p => {
        const next = [...p, c];
        bumpCommentCount(next);
        return next;
      });
      setReplyText('');
      setReplyingToId(null);
    } catch {
      showToast('Failed to post reply', 'error');
    } finally {
      setSubmittingReply(false);
    }
  };

  const deleteComment = async (id: string) => {
    const target = comments.find(c => c.id === id);
    const raw = target?.text?.trim() || '';
    const excerpt =
      raw.length > 160 ? `${raw.slice(0, 160)}…` : raw || '(empty comment)';
    const ok = await confirm({
      title: 'Delete comment',
      message: `Permanently delete this comment?\n\n“${excerpt}”`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await commentsApi.delete(id);
      setComments(p => {
        const next = p.filter(c => c.id !== id);
        bumpCommentCount(next);
        return next;
      });
      if (replyingToId === id) {
        setReplyingToId(null);
        setReplyText('');
      }
    } catch {
      showToast('Failed to delete comment', 'error');
    }
  };

  const saveEditComment = async (id: string) => {
    try {
      const updated = await commentsApi.update(id, editCommentText);
      setComments(p =>
        p.map(c =>
          c.id === id ? { ...c, text: updated.text || editCommentText } : c
        )
      );
      setEditingCommentId(null);
    } catch {
      showToast('Failed to update comment', 'error');
    }
  };

  /* "Go to comments" — from the deep link, or any caller that wants the
     thread. This used to `scrollIntoView` on the panel's scroll container,
     which is null whenever the panel is closed, on another tab, or (before
     the body fallback) on mobile — so the click was a silent no-op. Opening
     the panel and selecting the tab always lands somewhere real. */
  const openComments = () => {
    setCommentsPanelOpen(true);
    setPanelTab('comments');
    // The panel may be mounting this tick; scroll once it exists.
    window.setTimeout(() => {
      commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleReactionsChange = (next: Reaction[]) => {
    setEntry(e => {
      const merged = { ...e, reactions: next };
      onUpdateRef.current?.(merged);
      return merged;
    });
  };

  const rawLp = entry.custom_fields?._link_preview;
  const storedLinkPreview: StoredLinkPreview | null =
    rawLp &&
    typeof rawLp === 'object' &&
    typeof (rawLp as { url?: unknown }).url === 'string'
      ? (rawLp as StoredLinkPreview)
      : null;
  /* The entry's cover: the explicit `_card_preview_attachment_id` when set,
     otherwise the first image — the same resolution the entry's card uses
     elsewhere. Now consumed only to badge the matching row, so the panel
     reports which attachment represents the entry rather than showing a
     second copy of it. */
  const heroImage = firstImageAttachmentFromAttachments(
    attachmentsForDisplay,
    entry.custom_fields
  );

  const metaRow = (
    <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1.5 text-xs text-[var(--text-subtle)] pb-4 mb-1">
      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
        <Avatar
          name={entryAuthorName}
          url={entry.author?.avatar_url}
          attachmentId={entry.author?.avatar_attachment_id}
          userId={entry.author?.id}
          version={entry.author?.updated_at}
          size="xs"
          ringVariant="none"
        />
        {entryAuthorName}
      </span>
      {entry.type ? (() => {
        const tc = entryTypeColor(entry.type, activeWorkspace?.accent_color);
        return (
          <Pill tone="descriptive" style={{
            backgroundColor: 'transparent',
            color: tc.fg,
            borderWidth: '1px',
            borderColor: tc.fg
          }} className="border-solid">
            {prettifyType(entry.type)}
          </Pill>
        );
      })() : null}
      {entry.created_at ? (
        <span className="tabular-nums">{formatRelativeTime(entry.created_at)}</span>
      ) : null}
      {entry.app?.id ? (
        <Link
          to={appPath(entry.app.id)}
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-fast"
          onClick={e => e.stopPropagation()}
        >
          {entry.app.name || 'App'}
        </Link>
      ) : null}
      {entry.track?.id ? (
        <Link
          to={`/tracks/${entry.track.id}`}
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-fast"
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
        >
          {entry.track.title}
        </Link>
      ) : null}
      <WatchersControl
        entryId={entry.id}
        watchers={watchersData?.watchers || []}
        isWatching={!!watchersData?.is_watching}
        onToggle={handleToggleWatch}
        showLabel
      />
      {entry.tags?.map(tag => (
        <Link
          key={tag.id}
          to={`/feed?tag=${encodeURIComponent(tag.id)}`}
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-fast"
          onClick={e => e.stopPropagation()}
        >
          <Pill tone="descriptive" style={tagColorStyle(tag.color)}>#{tag.name || 'Untitled tag'}</Pill>
        </Link>
      ))}
    </div>
  );

  // Standard backlinks header — surfaces inbound graph context so the
  // entry view always answers "where does this entry live in the wider
  // graph?". Driven by `attach_backlinks` (backend/app/services/
  // entry_context.py): `anchor_source` for the entry whose ANCHORS edge
  // points at this entry's parent Track (e.g. a Task in a "Project: …"
  // anchor track links back to its source Project), and `referenced_by`
  // for every Entry whose REFERENCES relation field points at this Entry
  // (e.g. a Contact lists the Projects that reference it). Renders
  // nothing when both buckets are empty so ordinary entries stay clean.
  const anchorSource = entry.anchor_source ?? null;
  const referencedBy = entry.referenced_by ?? [];
  const referencedByTotal = entry.referenced_by_total ?? referencedBy.length;
  // Sprint entries: inbound Task.sprint REFERENCES are the primary related
  // list — label them as tasks rather than generic "Referenced by".
  const sprintTaskRefs = referencedBy.filter(
    ref => (ref.field_key || '').trim().toLowerCase() === 'sprint'
  );
  const otherRefs = referencedBy.filter(
    ref => (ref.field_key || '').trim().toLowerCase() !== 'sprint'
  );
  const renderBacklinkList = (
    refs: typeof referencedBy,
    label: string,
    totalHint?: number
  ) => {
    const total = totalHint ?? refs.length;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[var(--text-subtle)]">
          <ArrowUpRight
            size={12}
            strokeWidth={LINE_ICON_STROKE}
            aria-hidden
          />
          <span>
            {label} ({total}
            {total > refs.length ? `; showing ${refs.length}` : ''})
          </span>
        </div>
        <ul className="ml-[18px] flex flex-wrap gap-x-3 gap-y-1">
          {refs.map(ref => (
            <li key={ref.id} className="inline-flex items-center gap-1">
              <Link
                to={`/tracks/${ref.track_id}?entry=${encodeURIComponent(ref.id)}`}
                className="text-[var(--link)] hover:underline"
                onClick={e => e.stopPropagation()}
              >
                {ref.title || 'Untitled'}
              </Link>
              {ref.track_title ? (
                <span className="text-[var(--text-subtle)]">
                  · {ref.track_title}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  };
  const backlinksRow =
    anchorSource ||
    referencedBy.length > 0 ||
    entryTypeSlug === 'sprint' ? (
      <div className="mb-4 space-y-2 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)]/40 px-3 py-2 text-xs text-[var(--text-muted)]">
        {anchorSource ? (
          <div className="flex items-center gap-1.5">
            <CornerUpLeft
              size={12}
              strokeWidth={LINE_ICON_STROKE}
              aria-hidden
              className="text-[var(--text-subtle)]"
            />
            <span className="text-[var(--text-subtle)]">Linked from</span>
            <Link
              to={`/tracks/${anchorSource.track_id}?entry=${encodeURIComponent(anchorSource.id)}`}
              className="truncate text-[var(--link)] hover:underline"
              onClick={e => e.stopPropagation()}
            >
              {anchorSource.title || 'Untitled'}
            </Link>
            {anchorSource.track_title ? (
              <span className="truncate text-[var(--text-subtle)]">
                · {anchorSource.track_title}
              </span>
            ) : null}
          </div>
        ) : null}
        {sprintTaskRefs.length > 0
          ? renderBacklinkList(
              sprintTaskRefs,
              'Tasks in this sprint',
              otherRefs.length === 0 ? referencedByTotal : sprintTaskRefs.length
            )
          : entryTypeSlug === 'sprint'
            ? (
                <div className="flex items-center gap-1.5 text-[var(--text-subtle)]">
                  <ArrowUpRight
                    size={12}
                    strokeWidth={LINE_ICON_STROKE}
                    aria-hidden
                  />
                  <span>No tasks in this sprint</span>
                </div>
              )
            : null}
        {otherRefs.length > 0
          ? renderBacklinkList(
              otherRefs,
              'Referenced by',
              // Preserve server total when we only filtered sprint refs out of
              // the same capped list (sprint-only totals stay local).
              sprintTaskRefs.length > 0
                ? Math.max(0, referencedByTotal - sprintTaskRefs.length)
                : referencedByTotal
            )
          : null}
      </div>
    ) : null;

  // Header title — prefer the entry title; fall back to the prettified
  // type. Keeps the dialog consistent with the Modal primitive (which
  // always shows a title row) instead of an empty header bar.
  const headerTitle =
    entry.title?.trim() ||
    (entry.type ? entry.type.trim() : 'Entry').replace(/^./, c =>
      c.toUpperCase()
    );

  const titleSlot = (
    <>
      {parentEntry ? (
        <button
          type="button"
          onClick={handleBackToParent}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] shrink-0"
        >
          <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} />
          Back
        </button>
      ) : null}
      <span
        aria-hidden
        className="block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: 'var(--brand-accent)' }}
      />
      <span className="min-w-0 flex-1 truncate">{headerTitle}</span>
      {/* UX-01 — provenance signal in the entry detail header. Sits
          immediately next to the title so the "who wrote this" axis is
          visible without scrolling into the meta row. */}
      <ProvenanceBadge entry={entry} className="shrink-0" />
    </>
  );


  /* The dialog's companion panel: comments, attachments and activity.

     All three are commentary ON the record rather than part of it, so they
     share one tabbed surface instead of stacking down the body — reading a
     thread used to scroll the record itself out of sight.

     ONE node, two hosts. At `sm+` it is passed to `Modal sidePanel` and
     renders as a column beside the fields; below `sm` the dialog is
     full-bleed with no room alongside, so the same node renders at the
     bottom of the body instead. Rendering it twice would duplicate the
     composer and the thread's DOM ids, so the host is chosen, never both. */
  const panelTabOptions: ViewTabOption<PanelTabKey>[] = [
    {
      value: 'comments',
      label: 'Comments',
      icon: <MessageSquare size={14} strokeWidth={LINE_ICON_STROKE} />,
      count: comments.length,
    },
    {
      value: 'attachments',
      label: 'Attachments',
      icon: <Paperclip size={14} strokeWidth={LINE_ICON_STROKE} />,
      count: attachmentsForDisplay.length,
    },
    {
      value: 'activity',
      label: 'Activity',
      icon: <Activity size={14} strokeWidth={LINE_ICON_STROKE} />,
    },
  ];

  const panelNode = (
    <>
      {variant !== 'page' && <ViewTabs
        options={panelTabOptions}
        value={panelTab}
        onChange={setPanelTab}
        ariaLabel="Entry details"
        size="sm"
        className="shrink-0 px-2"
      />}
      <div
        ref={commentsAnchorRef}
        id="entry-panel-body"
        role={variant === 'page' ? 'region' : 'tabpanel'}
        aria-label={PANEL_TABS.find(t => t.key === panelTab)?.label}
        className={
          variant === 'page'
            ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3'
            : showSideColumn
            ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3'
            : 'px-1 py-3'
        }
      >
        {panelTab === 'attachments' ? (
          attachmentsForDisplay.length === 0 && !canEdit ? (
            /* A viewer without edit rights used to get a blank tab here —
               the section was gated on `|| canEdit`, so "nothing" and "you
               may not add" looked identical. */
            <EmptyState
              size="dense"
              icon={<Paperclip size={20} strokeWidth={LINE_ICON_STROKE} aria-hidden />}
              title="No attachments"
              description="Files and links added to this entry appear here."
            />
          ) : (
            <div className="space-y-2">
              {canEdit && (
                /* Anchored ABOVE the preview and the list: with it at the
                   bottom, "add another" moved further down every time you
                   added one, and on a long list it fell below the fold. Same
                   AddToEntryControl as the edit form — drag a file, click the
                   paperclip, or expand the link form; these handlers upload
                   immediately rather than queueing. */
                <AddToEntryControl
                  onFilesAdded={quickUploadFiles}
                  onLinkAdded={quickAddLink}
                />
              )}
              {attachmentsForDisplay.length > 0 && (
                <AttachmentRowList
                  attachments={attachmentsForDisplay}
                  canDelete={canEdit}
                  canSetCardPreview={canEdit}
                  cardPreviewAttachmentId={
                    typeof entry.custom_fields?.[CARD_PREVIEW_ATTACHMENT_FIELD] ===
                    'string'
                      ? entry.custom_fields[CARD_PREVIEW_ATTACHMENT_FIELD]
                      : heroImage?.attachmentId ?? null
                  }
                  onSetCardPreview={async attachmentId => {
                    const updated = await entriesApi.update(entry.id, {
                      custom_fields: {
                        ...(entry.custom_fields ?? {}),
                        [CARD_PREVIEW_ATTACHMENT_FIELD]: attachmentId
                      }
                    });
                    setEntry(updated);
                    onUpdateRef.current?.(updated);
                    showToast('Card preview updated', 'success');
                  }}
                  onDeleted={attachmentId =>
                    setAttachments(prev =>
                      prev.filter(att => att.id !== attachmentId)
                    )
                  }
                />
              )}
            </div>
          )
        ) : panelTab === 'activity' ? (
          /* Rendered directly. This used to sit behind its own collapsed
             chevron, which made sense at the bottom of a long body but not
             in a tab — choosing the tab IS the request to see it, and the
             disclosure just added a second click inside the surface you
             already opened. ActivityPanel supplies its own empty state. */
          <ActivityPanel
            scope={`track:${entry.track_id}`}
            filterResourceId={entry.id}
            title="Entry activity"
            dense
          />
        ) : (
          /* Shared with the wiki inline view and the public share link, so
             one thread renders the same everywhere. */
          <CommentsPanel
            comments={comments}
            loading={loadingComments}
            user={user}
            canComment={canComment}
            canModerate={canModerateComments}
            replyingToId={replyingToId}
            replyText={replyText}
            onReplyTextChange={setReplyText}
            onStartReply={id => {
              setReplyingToId(id);
              setReplyText('');
            }}
            onCancelReply={() => {
              setReplyingToId(null);
              setReplyText('');
            }}
            onSubmitReply={submitReply}
            submittingReply={submittingReply}
            editingId={editingCommentId}
            editText={editCommentText}
            setEditingId={setEditingCommentId}
            setEditText={setEditCommentText}
            onSaveEdit={saveEditComment}
            onDelete={deleteComment}
            trackId={entry.track_id || initialEntry.track_id || undefined}
          />
        )}
      </div>
      {panelTab === 'comments' && !isEditing && canComment ? (
        <div className={COMMENT_FOOTER_CLASS}>
          <CommentComposer
            value={commentText}
            onChange={setCommentText}
            onSubmit={() => void submitComment()}
            submitting={submittingComment}
            trackId={entry.track_id || initialEntry.track_id || undefined}
          />
        </div>
      ) : null}
    </>
  );

  const secondaryActions: KebabMenuItem[] = [];
  if (canEdit && !isEditing) {
    secondaryActions.push({
      key: 'post-to-feed', label: 'Post to feed',
      icon: <Send size={16} strokeWidth={LINE_ICON_STROKE} />,
      onClick: () => setPostToFeedOpen(true),
    });
  }
  if (variant !== 'page' && !isEditing) {
    secondaryActions.push({
      key: 'open-page', label: 'Open full page',
      icon: <ArrowUpRight size={16} strokeWidth={LINE_ICON_STROKE} />,
      onClick: () => navigateToEntryPage(entryPagePath(entry.id)),
    });
  }
  if (variant !== 'page') {
    secondaryActions.push({
      key: 'dialog-size', label: entryDialogExpanded ? 'Exit full size' : 'Expand dialog',
      icon: entryDialogExpanded
        ? <Minimize2 size={16} strokeWidth={LINE_ICON_STROKE} />
        : <Maximize2 size={16} strokeWidth={LINE_ICON_STROKE} />,
      onClick: () => updateSettings(prev => ({
        ...prev,
        appearance: { ...prev.appearance, entryDialogExpanded: !prev.appearance.entryDialogExpanded },
      })),
    });
  }
  if (canEdit && designerEnabled && showLayoutDesignerButton) {
    secondaryActions.push({
      key: 'edit-layout', label: 'Edit layout',
      icon: <LayoutTemplate size={16} strokeWidth={LINE_ICON_STROKE} />,
      onClick: () => { void openLayoutDesigner(); },
    });
  }
  if (canEdit && !isEditing && onDelete) {
    secondaryActions.push({
      key: 'delete-entry', label: 'Delete entry', danger: true, dividerAbove: true,
      icon: <Trash2 size={16} strokeWidth={LINE_ICON_STROKE} />,
      onClick: () => { void handleDeleteEntry(); },
    });
  }

  const headerActions = (
    <div className="flex flex-wrap items-center gap-1.5">
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={isEditing ? 'Cancel edit' : 'Edit entry'}
          icon={isEditing ? <X size={14} strokeWidth={LINE_ICON_STROKE} /> : <Edit2 size={14} strokeWidth={LINE_ICON_STROKE} />}
          onClick={() => setIsEditing(editing => !editing)}
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </Button>
      ) : null}
      {canEdit && !isEditing ? (
        <ImproveThisButton
          target="entry"
          subjectName={entry.title}
          subjectId={initialEntry.id}
          trackId={trackId}
        />
      ) : null}
      {canEdit && !isEditing && showStartProject ? (
        <Button variant="outline" size="sm" loading={startingProject}
          aria-label="Start delivery project" onClick={() => void handleStartDeliveryProject()}
          icon={<Rocket size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />}>
          {startingProject ? 'Starting…' : 'Start project'}
        </Button>
      ) : null}
      <EntryAgentUndoButton entryId={entry.id} trackId={entry.track_id} />
      {/* Panel toggle — desktop only. Below `sm` the panel is part of the
          body and always present, so a show/hide control there would toggle
          nothing the user cannot already see. Icon swaps with state
          (PanelRightOpen/Close), matching the track activity-rail toggle. */}
      {variant === 'page' ? (
        <>
          {panelTabOptions.map(option => {
            const selected = commentsPanelOpen && panelTab === option.value;
            return <IconButton key={option.value}
              label={`${selected ? 'Hide' : 'Show'} ${option.value}`}
              title={`${option.label}${option.count != null ? ` (${option.count})` : ''}`}
              size="md" aria-expanded={selected} aria-controls="entry-panel-body"
              onClick={event => {
                pagePanelTriggerRef.current = event.currentTarget;
                setPanelTab(option.value);
                setCommentsPanelOpen(!selected);
              }}>
              {option.icon}
            </IconButton>;
          })}
        </>
      ) : showSideColumn && (
        <IconButton
          label={commentsPanelOpen ? 'Hide details panel' : 'Show details panel'}
          title={commentsPanelOpen ? 'Hide details panel' : 'Show details panel'}
          size="md"
          onClick={() => setCommentsPanelOpen(o => !o)}
          aria-expanded={commentsPanelOpen}
          aria-controls="entry-panel-body"
        >
          {commentsPanelOpen ? (
            <PanelRightClose size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          ) : (
            <PanelRightOpen size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          )}
        </IconButton>
      )}
      {secondaryActions.length > 0 ? (
        <KebabMenu ariaLabel="More entry actions" items={secondaryActions} portal />
      ) : null}
    </div>
  );

  const Chrome = variant === 'page' ? EntryDetailPageChrome : Modal;

  return (
    <>
    <Chrome
      open
      onClose={postToFeedOpen ? () => {} : onClose}
      title={titleSlot}
      headerActions={headerActions}
      sidePanel={commentsPanelOpen && (variant === 'page' || showSideColumn) ? panelNode : undefined}
      {...(variant === 'page' ? {
        panelTitle: PANEL_TABS.find(t => t.key === panelTab)?.label,
        onPanelClose: () => {
          setCommentsPanelOpen(false);
          pagePanelTriggerRef.current?.focus();
        },
      } : {})}
      /* The panel is part of this surface even when it is hidden or stacked
         into the body, so the dialog keeps its height either way. */
      hasCompanionPanel
      {...(canvasConfig
        ? {
            canvas: (
              <EntryCanvasPane
                entry={entry}
                attachments={attachments}
                fileField={canvasConfig.file_field || undefined}
                editable={canvasConfig.editor === 'body'}
                canEdit={canEdit}
                onBodySaved={updated => {
                  setEntry(updated);
                  onUpdate?.(updated);
                }}
              />
            ),
          }
        : {})}
      disableEscape
      /* This dialog publishes its entry as the agent's context on open
         (`pageKind: "entry_dialog"` above), so the assistant is primed to
         discuss exactly what is on screen — the dock has to stay reachable
         while it is open. Opt-in per dialog: a confirm prompt gets the
         normal full-viewport scrim. */
      allowAssistantDock
      width={
        variant !== 'page' && entryDialogExpanded
          ? 'max-w-dialog-workspace-max'
          : undefined
      }
      tall={variant !== 'page' && entryDialogExpanded}
    >
      <div className="px-4 sm:px-6 py-4 sm:py-5">
          {isEditing ? (
            <EntryFormExpandedView
              {...editForm}
              mode="edit"
              composeExtraSection={editComposeExtraSection}
              workflowEnumLabels={workflowEnumLabels}
              primaryLabel="Save"
              onNavigate={onClose}
              navContext={{
                fromEntryId: entry.id,
                fromTrackId: entry.track_id,
                fromTitle: entry.title || 'Untitled',
              }}
              onPrimary={async () => {
                try {
                  const updated = await editForm.handleSubmitEdit(entry.id);
                  const nextAttachments = await attachmentsApi.listForEntry(entry.id);
                  setAttachments(nextAttachments);
                  const merged = { ...entry, ...updated };
                  setEntry(merged);
                  onUpdateRef.current?.(merged);
                  setIsEditing(false);
                } catch {
                  /* errors toasted in hook */
                }
              }}
              onCancel={() => setIsEditing(false)}
              /* The companion panel's Attachments tab owns attachments on this
                 surface, so the form must not render a second "Add to this
                 entry" beside it — two controls, two behaviours (queue on save
                 vs upload now), one dialog. */
              hideAttachmentsRow
            />
          ) : (
            <>
              {metaRow}
              {backlinksRow}
              <div
                className="mt-4"
                key={`contrib-detail-${entry.track_id}-${(
                  designerTargetView?.updated_at ||
                  designerTargetView?.id ||
                  contributionViewKey ||
                  'none'
                )}`}
              >
                <EntryContributionSlot
                  placement="entry_detail"
                  appId={track?.app?.id || trackContext?.app?.id || entry.track?.app?.id}
                  formSchema={entryTypeFormSchema}
                  trackId={entry.track_id}
                  entryId={entry.id}
                  entryTypeKey={entry.type}
                  mode="detail"
                  customFields={(entry.custom_fields || {}) as Record<string, unknown>}
                />
              </div>
              {!detailOwnsForm ? (
              <div className="mt-4">
                {Object.values(entry.read_time_fields?.status || {}).includes('unavailable') ? (
                  <div role="status"><Text as="p" variant="body-sm" tone="muted">Some live fields could not be checked. Their values are unknown.</Text></div>
                ) : null}
                <EntryMetaFields
                  fields={dynamicFields}
                  readOnlyKeys={Object.keys(entry.read_time_fields?.values || {})}
                  values={{
                    ...((entry.custom_fields || {}) as Record<string, unknown>),
                    ...(entry.read_time_fields?.values || {}),
                    ...(entryTypeSlug === 'sprint'
                      ? {
                          tasks: Array.isArray((entry.custom_fields || {}).tasks)
                            ? ((entry.custom_fields || {}).tasks as string[])
                            : sprintTaskRefs.map(r => r.id),
                        }
                      : {}),
                  }}
                  variant="detail"
                  readOnly={!canEdit}
                  trackId={entry.track_id}
                  anchorProjectId={anchorSource?.id || ''}
                  workflowEnumLabels={workflowEnumLabels}
                  onNavigate={onClose}
                  navContext={{
                    fromEntryId: entry.id,
                    fromTrackId: entry.track_id,
                    fromTitle: entry.title || 'Untitled',
                  }}
                  onCommitField={canEdit ? commitCustomField : undefined}
                  entryId={canEdit ? entry.id : undefined}
                />
              </div>
              ) : null}
              {entry.body && canvasConfig?.editor !== 'body' ? (
                <div className="mt-4 text-[15px] text-[var(--text)] leading-[1.55]">
                  <MarkdownContent>{entry.body}</MarkdownContent>
                </div>
              ) : null}
              {storedLinkPreview &&
              (storedLinkPreview.title ||
                storedLinkPreview.description ||
                storedLinkPreview.image ||
                storedLinkPreview.site_name) ? (
                <a
                  href={storedLinkPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 block overflow-hidden rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] text-left hover:border-[var(--text-muted)]/40 transition-colors duration-fast"
                >
                  {storedLinkPreview.image ? (
                    <img
                      src={storedLinkPreview.image}
                      alt=""
                      className="h-48 w-full object-cover bg-[var(--panel)]"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="p-3 space-y-1">
                    {storedLinkPreview.site_name ? (
                      <p className="text-[13px] uppercase tracking-wide text-[var(--text-muted)]">
                        {storedLinkPreview.site_name}
                      </p>
                    ) : null}
                    {storedLinkPreview.title ? (
                      <p className="text-sm font-semibold text-[var(--text)] line-clamp-2">
                        {storedLinkPreview.title}
                      </p>
                    ) : null}
                    {storedLinkPreview.description ? (
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {storedLinkPreview.description}
                      </p>
                    ) : null}
                    <p className="text-[13px] text-[var(--link)] truncate pt-0.5">
                      {storedLinkPreview.url}
                    </p>
                  </div>
                </a>
              ) : null}
              {primaryRelatedViewsNode}
              <EntrySocialActions
                entryId={entry.id}
                trackId={entry.track_id}
                reactions={entry.reactions || []}
                onReactionsChange={handleReactionsChange}
                commentCount={comments.length}
                hideComments
                onCommentsClick={openComments}
                className="mt-5 pt-2"
              />
              {/* Phase 3.1 Plan 03.1-04 (ANC-06). Inline related views are an
                  extension OF the record (e.g. a Project entry's sub-tasks
                  board), not commentary on it — so they stay in the body
                  rather than moving to the companion panel. Skips rendering
                  entirely when the entry type declares no related_views. */}
              {user && !parentEntry ? (
                <RelatedViewsSection
          key={`secondary-related:${entry.id}:${embeddedViewsRevision}`}
                  entry={{ id: entry.id, custom_fields: entry.custom_fields }}
                  entryTypeSpec={relatedRelatedViewsSchema}
                  user={{ id: user.id }}
                  currentTrackId={initialEntry.track_id}
                  anchoredTrackId={anchoredTrackId}
                  fields={anchoredTaskFields.length ? anchoredTaskFields : dynamicFields}
                  entryTypes={(anchoredEntryTypes ?? []) as EntryTypeNode[]}
                  onEntryOpen={handleEmbeddedEntryOpen}
                  onEntryPersist={canEdit ? handleEmbeddedEntryPersist : undefined}
                  onEntryCreate={canEdit ? handleEmbeddedEntryCreate : undefined}
                  isEditor={canEdit}
                  appId={relatedViewAppId}
                />
              ) : null}

              {/* Companion panel's mobile host. Same `panelNode` as the
                  desktop column — chosen, never duplicated — so comments,
                  attachments and activity stay reachable on a phone instead
                  of disappearing with the side column. */}
              {!showSideColumn && variant !== 'page' && (
                <section className="mt-6 border-t border-[var(--panel-border)] pt-2">
                  {panelNode}
                </section>
              )}
            </>
          )}
        </div>

    </Chrome>
    <PostToFeedDialog entry={entry} open={postToFeedOpen} onClose={() => setPostToFeedOpen(false)} />
      {embeddedCompose && (
        <EntryComposeModal
          open
          track={embeddedCompose.track}
          seed={embeddedCompose.seed}
          onClose={() => setEmbeddedCompose(null)}
          onCreated={() => {
            setEmbeddedViewsRevision(revision => revision + 1);
            void queryClient.invalidateQueries({ queryKey: ['track', embeddedCompose.track.id, 'entries'] });
            invalidateFeedCaches(queryClient);
          }}
        />
      )}
      {previewImageUrl && (
        <div
          /* Image preview is already viewport-filling on every size;
             dropping the desktop p-4 on mobile makes the picture itself
             stretch to the screen edges. */
          className="fixed inset-0 z-overlay-nested flex items-center justify-center bg-black/80 p-0 sm:p-4"
          onClick={() => {
            URL.revokeObjectURL(previewImageUrl);
            setPreviewImageUrl(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              URL.revokeObjectURL(previewImageUrl);
              setPreviewImageUrl(null);
            }
          }}
        >
          <img
            src={previewImageUrl}
            alt="Attachment preview"
            className="max-h-[90vh] max-w-[90vw] rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--bg)] object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      {designerEnabled && designerView ? (
        <ViewDesignerShell
          open={layoutDesignerOpen}
          onClose={() => {
            setLayoutDesignerOpen(false);
            setDesignerView(null);
          }}
          trackId={entry.track_id}
          view={designerView}
          previewFields={
            (entry.custom_fields || {}) as Record<string, unknown>
          }
          entryId={entry.id}
          appId={track?.app?.id || entry.track?.app?.id}
          entryTypeKey={entry.type}
        />
      ) : null}
    </>
  );
}
