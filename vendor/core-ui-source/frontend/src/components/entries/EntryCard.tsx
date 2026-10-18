import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Link2,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  MessageSquare,
  Share2,
  ThumbsUp
} from 'lucide-react';
import { EntryMetaFields } from './EntryMetaFields';
import { tagColorStyle } from '../../utils/tagColor';
import { ProvenanceBadge } from './ProvenanceBadge';
import { isSamePrincipal, formatStackedDateTime, entryTypeColor } from '../../utils';
import { useCanEditEntry } from '../../utils/entryEditRights';
import { firstImageAttachmentFromAttachments } from '../../utils/entryMedia';
import {
  formatAttachmentSize,
  getAttachmentKind
} from '../../utils/attachmentMime';
import type { Attachment, OperationalModelFieldSpec, Entry, StoredLinkPreview, Track } from '../../types';
import { attachmentsApi, entriesApi, entryTypesApi } from '../../api';
import { AttachmentViewerModal } from './attachments/AttachmentViewerModal';
import { entryTypesForTrackQueryKey, invalidateFeedCaches } from '../../queryKeys';
import {
  FEED_CARD_BODY_PREVIEW_CHARS,
  FEED_CARD_TITLE_CLAMP_CHARS,
  resolveEntryProfileFields,
  slugEntryTypeName
} from '../../utils/entryMetaFields';
import { appPath } from '../../utils/resourcePaths';
import { useAuth } from '../../context/AuthContext';
import { useScope } from '../../context/ScopeContext';
import { publicSharingApi } from '../../api/sharing';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { AuthedImage, Avatar, LINE_ICON_STROKE, MarkdownContent, Pill } from '../ui';

/** Entry-type → Pill variant mapping. Most types fall through to
 *  neutral (gray); a handful of semantic standouts adopt brand or
 *  status colors so attention-worthy posts (decisions, blockers,
 *  shipped work) stand out without wallpapering the feed. */
function prettifyType(type: string): string {
  if (!type) return '';
  const cleaned = type.trim().replace(/[_-]+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

interface EntryCardProps {
  entry: Entry;
  onOpen?(entry: Entry, opts?: { focusComments?: boolean }): void;
  onDelete?(id: string): void;
  onEdit?(entry: Entry): void;
  showTrackChip?: boolean;
  /** When provided, the type pill renders as a button that calls this
   *  with the entry's type slug. Used by the Feed page to filter the
   *  list to a single entry-type without leaving the row. */
  onTypeClick?(typeSlug: string): void;
  /** When set, the type pill renders in its active "this is the
   *  current filter" state. */
  activeTypeFilter?: string;
  /** When provided, individual tag chips render as buttons that call
   *  this with the tag's id. Symmetric to `onTypeClick`. */
  onTagClick?(tagId: string): void;
  /** Tag id to render in active "this is the current filter" state. */
  activeTagFilter?: string;
  /** When provided, the author segment renders as a button that calls
   *  this with the entry's `author_id`. Symmetric to `onTypeClick`. */
  onAuthorClick?(authorId: string): void;
  /** Author id to render in active "this is the current filter" state. */
  activeAuthorFilter?: string;
  /** When set, gates Edit/Delete menu via per-entry rights (track role + author). */
  canEdit?: boolean;
  /** Track context for per-entry edit resolution when ``canEdit`` is omitted. */
  track?: Track | null;
  publicMode?: boolean;
  hideComments?: boolean;
  publicToken?: string;
  publicPermissions?: Record<string, boolean>;
}

function EntryCardInner({
  entry,
  onOpen,
  onDelete,
  onEdit,
  showTrackChip = true,
  onTypeClick,
  activeTypeFilter,
  onTagClick,
  activeTagFilter,
  onAuthorClick,
  activeAuthorFilter,
  canEdit: canEditProp,
  track,
  publicMode = false,
  hideComments = false,
  publicToken,
  publicPermissions
}: EntryCardProps) {
  const { user } = useAuth();
  const { activeWorkspace } = useScope();
  const confirm = useConfirm();
  const { showToast, showPendingToast, resolveToast } = useToast();
  // We need the QueryClient locally so the rollback path
  // (handleDelete on a backend failure) can re-fetch the feed and
  // restore the optimistically-removed row without depending on the
  // page wiring an extra `onDeleteFailed` prop down to every card.
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [openAttachmentId, setOpenAttachmentId] = useState<string | null>(null);

  const commentCount = (() => {
    const n = Number(entry.comment_count);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  })();

  const [reactions, setReactions] = useState(entry.reactions || []);
  useEffect(() => { setReactions(entry.reactions || []); }, [entry.reactions]);
  const totalLikes = reactions.reduce((acc, r) => acc + r.count, 0);
  const quickLikeActive = !!reactions.find(r => r.emoji === '👍')?.user_reacted;

  const canReact = publicMode
    ? (publicPermissions?.create_comments ?? false)
    : true;

  const handleLike = async () => {
    if (publicMode && (!canReact || !publicToken)) return;
    const existing = reactions.find(r => r.emoji === '👍');
    try {
      if (existing?.user_reacted) {
        if (publicMode && publicToken) {
          await publicSharingApi.removePublicReaction(publicToken, entry.id, '👍');
        } else {
          await entriesApi.removeReaction(entry.id, '👍');
        }
        setReactions(prev =>
          prev.map(r => r.emoji === '👍' ? { ...r, count: r.count - 1, user_reacted: false } : r).filter(r => r.count > 0)
        );
      } else {
        if (publicMode && publicToken) {
          await publicSharingApi.addPublicReaction(publicToken, entry.id, '👍');
        } else {
          await entriesApi.addReaction(entry.id, '👍');
        }
        if (existing) {
          setReactions(prev =>
            prev.map(r => r.emoji === '👍' ? { ...r, count: r.count + 1, user_reacted: true } : r)
          );
        } else {
          setReactions(prev => [...prev, { emoji: '👍', count: 1, user_reacted: true }]);
        }
      }
    } catch {
      showToast('Failed to update reaction', 'error');
    }
  };

  const primaryContentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = primaryContentRef.current;
    if (!el || expanded) { setIsOverflowing(false); return; }
    setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    checkOverflow();
  }, [checkOverflow, entry.id, entry.body, entry.title, entry.custom_fields]);

  const canEdit = useCanEditEntry(entry, { track, explicitCanEdit: canEditProp });
  const isAuthor = isSamePrincipal(user, entry.author_id);
  const authorName =
    entry.author?.display_name ||
    (isAuthor ? user?.display_name : undefined) ||
    (entry.author_id ? `Member ${entry.author_id.slice(-6)}` : 'Unknown');

  const handleDelete = async () => {
    setShowMenu(false);
    const ok = await confirm({
      title: 'Delete post',
      message: entry.title?.trim()
        ? `Delete “${entry.title.trim()}”? This removes the post and its comments. This cannot be undone.`
        : 'Delete this post? This removes the post and its comments. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger'
    });
    if (!ok) return;
    // Optimistic: hide the entry from the feed BEFORE awaiting the
    // backend. The backend DELETE currently takes ~5s on tagged
    // entries (jvspatial does two full edge-table scans without an
    // index), so awaiting first leaves the entry stranded in the UI
    // long enough that users perceive the app as broken. The
    // pending toast keeps the action discoverable; on success we
    // flip to "Entry deleted", on failure we surface the error and
    // restore the entry by invalidating the feed cache (the server
    // is still source of truth — the next fetch will re-include
    // it).
    onDelete?.(entry.id);
    const pendingId = showPendingToast('Deleting…');
    try {
      await entriesApi.delete(entry.id);
      resolveToast(pendingId, 'Entry deleted', 'success');
    } catch {
      resolveToast(pendingId, 'Failed to delete; restoring…', 'error');
      // Force a refetch of the feed so the entry comes back if the
      // server still has it. We don't keep a local snapshot — going
      // back to the server is more honest than guessing position
      // and avoids divergence with anything else that may have
      // changed during the in-flight request.
      try {
        // Invalidate the full ['feed'] prefix so both FeedPage's
        // infinite-query and Mission Control's dashboardPreview pick
        // up the rollback.
        await invalidateFeedCaches(queryClient);
      } catch {
        /* non-fatal — toast already explained the failure */
      }
    }
  };

  const bodyPreview = entry.body || '';

  const { data: entryTypes = [] } = useQuery({
    queryKey: entryTypesForTrackQueryKey(entry.track_id),
    queryFn: () => entryTypesApi.list({ track_id: entry.track_id }),
    enabled: Boolean(entry.track_id)
  });

  const profileFields = useMemo((): OperationalModelFieldSpec[] => {
    return resolveEntryProfileFields(entryTypes, entry.type);
  }, [entryTypes, entry.type]);

  const mayNeedClamp =
    bodyPreview.length > FEED_CARD_BODY_PREVIEW_CHARS ||
    (entry.title || '').length > FEED_CARD_TITLE_CLAMP_CHARS;

  useEffect(() => {
    setExpanded(false);
  }, [entry.id]);

  // Close owner-action menu on outside click or Escape. Both mobile and
  // desktop menu instances mark themselves with [data-entry-menu] so a
  // pointerdown that lands inside *either* wrapper is treated as in-menu.
  useEffect(() => {
    if (!showMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('[data-entry-menu]')) setShowMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMenu]);

  const rawLp = entry.custom_fields?._link_preview;
  const storedLinkPreview: StoredLinkPreview | null =
    rawLp &&
    typeof rawLp === 'object' &&
    typeof (rawLp as { url?: unknown }).url === 'string'
      ? (rawLp as StoredLinkPreview)
      : null;

  const heroImage = firstImageAttachmentFromAttachments(
    entry.attachments,
    entry.custom_fields
  );
  const heroImageUrl = heroImage?.url ?? null;
  const showAttachmentHero =
    Boolean(heroImageUrl) &&
    (!storedLinkPreview?.image || heroImageUrl !== storedLinkPreview.image);

  const urlAttachments =
    entry.attachments?.filter(
      att => att.source_type === 'url' && att.external_url
    ) ?? [];
  const fileAttachments = useMemo(
    () =>
      entry.attachments?.filter(
        att => att.source_type === 'file' && att.id !== heroImage?.attachmentId,
      ) ?? [],
    [entry.attachments, heroImage?.attachmentId],
  );

  const visibleFileAttachments = useMemo(
    () => fileAttachments.filter(att => att.scan_status !== 'blocked'),
    [fileAttachments]
  );
  const openAttachment = useMemo(
    () =>
      openAttachmentId
        ? visibleFileAttachments.find(a => a.id === openAttachmentId) ?? null
        : null,
    [openAttachmentId, visibleFileAttachments]
  );
  const advanceOpenAttachment = useCallback(
    (delta: 1 | -1) => {
      if (!openAttachmentId || visibleFileAttachments.length === 0) return;
      const idx = visibleFileAttachments.findIndex(a => a.id === openAttachmentId);
      if (idx < 0) return;
      const next =
        (idx + delta + visibleFileAttachments.length) %
        visibleFileAttachments.length;
      setOpenAttachmentId(visibleFileAttachments[next].id);
    },
    [openAttachmentId, visibleFileAttachments]
  );

  const linkChips = urlAttachments.filter(att => {
    if (storedLinkPreview?.url && att.external_url === storedLinkPreview.url) {
      return false;
    }
    if (heroImageUrl && att.external_url === heroImageUrl) {
      return false;
    }
    return true;
  });

  const hasLinkPreviewBlock = Boolean(
    storedLinkPreview &&
      (storedLinkPreview.title ||
        storedLinkPreview.description ||
        storedLinkPreview.image ||
        storedLinkPreview.site_name)
  );
  const hasSecondaryPreviewBlock =
    hasLinkPreviewBlock ||
    (Boolean(showAttachmentHero) && Boolean(heroImageUrl)) ||
    fileAttachments.length > 0 ||
    linkChips.length > 0;

  const iconForAttachment = (mimeType?: string, filename?: string) => {
    switch (getAttachmentKind({ mime_type: mimeType, filename })) {
      case 'image':
        return FileImage;
      case 'video':
        return FileVideo;
      case 'audio':
        return FileAudio;
      case 'text':
      case 'sheet':
      case 'pdf':
      case 'archive':
        return FileText;
      default:
        return File;
    }
  };

  const handleOpenFileAttachment = (attachment: Attachment) => {
    setOpenAttachmentId(attachment.id);
  };

  const handleDownloadAttachment = useCallback(
    async (attachment: Attachment) => {
      if (attachment.source_type === 'url' && attachment.external_url) {
        window.open(attachment.external_url, '_blank', 'noopener,noreferrer');
        return;
      }
      try {
        const { blob, contentType } = await attachmentsApi.fetchDownloadBlob(
          attachment.id
        );
        const blobUrl = URL.createObjectURL(
          contentType ? new Blob([blob], { type: contentType }) : blob
        );
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = attachment.filename || 'attachment';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Download failed', 'error');
      }
    },
    [showToast]
  );

  // Entry row marker — always brand accent. Per-track identity color
  // is reserved for the vertical bar beside the track title only.
  const trackName = entry.track?.title || '';
  const stamp = formatStackedDateTime(entry.created_at);

  return (
    <>
    <article
      tabIndex={0}
      role="button"
      aria-label={entry.title?.trim() || `Entry by ${authorName}`}
      // `isolate` makes each article its own stacking context, so the
      // owner-actions menu's `z-30` is local. Without an explicit
      // z-index on the article itself, the next sibling card paints
      // on top in document order — which means the menu visually
      // lives behind the next entry and clicks on Edit/Delete fall
      // through to that entry's onClick. When the menu is open we
      // hoist this article above its siblings (z-40 beats the
      // default 0) so the menu actually receives the click.
      className={
        "relative isolate grid gap-x-[20px] py-[34px] px-3 " +
        "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] " +
        "min-w-0 max-w-full " +
        "border-b border-[var(--border-subtle)] " +
        "last:border-b-0 " +
        "cursor-pointer " +
        "group " +
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] rounded-[var(--radius-input)] " +
        (showMenu ? "z-40" : "")
      }
      onClick={() => onOpen?.(entry)}
      onKeyDown={e => {
        // Activation only fires when the article itself has focus — nested
        // buttons/links handle their own keys. Space and Enter both open
        // per native button semantics.
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen?.(entry);
        }
      }}
    >
      {/* Hover surface — fills the article's outer (column-left to
          column-right, matching the composer above) with vertical inset
          to keep adjacent hover states from touching on the hairline. */}
      <span
        aria-hidden
        className="
          pointer-events-none absolute inset-x-0 inset-y-3 -z-10
          rounded-[var(--radius-input)]
          bg-[var(--panel)] opacity-0
          group-hover:opacity-100
          transition-opacity duration-fast
        "
      />

      {/* Entry-tag dot — 10px, top-aligned against the title's optical
          midline. mt-[7px] sits the dot center against the cap-line of
          the 17px title (line-height 1.35 ≈ 23px → midline at ~11–12px
          from the title block top). */}
      <span
        aria-hidden
        className="block w-2.5 h-2.5 rounded-full mt-[7px] shrink-0 transition-opacity duration-fast"
        style={{ backgroundColor: 'var(--brand-accent)' }}
      />

      {/* Main column — title, body, meta row. */}
      <div className="min-w-0">
        <div
          ref={primaryContentRef}
          className={`${hasSecondaryPreviewBlock ? 'pb-3' : isOverflowing || expanded ? 'pb-2' : ''} ${
            mayNeedClamp && !expanded ? 'max-h-[11rem] overflow-hidden' : ''
          }`.trim()}
        >
          {entry.title ? (
            <h3
              className={`text-[17px] font-medium tracking-[-0.012em] text-[var(--text)] leading-[1.35] mb-[5px] ${
                !expanded && entry.title.length > FEED_CARD_TITLE_CLAMP_CHARS
                  ? 'line-clamp-2'
                  : ''
              }`.trim()}
            >
              {entry.title}
            </h3>
          ) : null}
          <EntryMetaFields
            fields={profileFields}
            values={(entry.custom_fields || {}) as Record<string, unknown>}
            variant="card"
            expanded={expanded}
          />
          {bodyPreview ? (
            <div
              className="text-sm text-[var(--text-muted)] leading-[1.55] max-w-[720px] min-w-0"
            >
              <MarkdownContent compact>{bodyPreview}</MarkdownContent>
            </div>
          ) : null}
        </div>
        {isOverflowing || expanded ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setExpanded(s => !s);
            }}
            className="text-xs text-[var(--link)] mt-2 flex items-center gap-0.5 hover:text-[var(--link-hover)] hover:underline"
          >
            {expanded ? (
              <>
                <ChevronUp size={12} strokeWidth={LINE_ICON_STROKE} /> Less
              </>
            ) : (
              <>
                <ChevronDown size={12} strokeWidth={LINE_ICON_STROKE} /> More
              </>
            )}
          </button>
        ) : null}

        {hasSecondaryPreviewBlock ? (
          <div className="mt-3 space-y-3">
            {hasLinkPreviewBlock && storedLinkPreview ? (
              <a
                href={storedLinkPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)] text-left hover:border-[var(--text-muted)]/40 transition-colors duration-fast"
                onClick={e => e.stopPropagation()}
              >
                {storedLinkPreview.image ? (
                  <img
                    src={storedLinkPreview.image}
                    alt=""
                    className="h-44 w-full object-cover bg-[var(--panel)]"
                    loading="lazy"
                  />
                ) : null}
                <div className="p-3 space-y-1">
                  {storedLinkPreview.site_name ? (
                    <p className="text-[13px] uppercase tracking-wide text-[var(--text-subtle)]">
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
            {showAttachmentHero && heroImageUrl ? (
              <AuthedImage
                src={heroImageUrl}
                alt="Entry preview"
                className="w-full max-h-64 rounded-[var(--radius-card)] border border-[var(--panel-border)] object-cover"
              />
            ) : null}
            {fileAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {fileAttachments.map(att => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      void handleOpenFileAttachment(att);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--text-muted)]"
                  >
                    {(() => {
                      const Icon = iconForAttachment(att.mime_type, att.filename);
                      return <Icon size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />;
                    })()}
                    <span className="max-w-[200px] truncate">{att.filename || 'Attachment'}</span>
                    {formatAttachmentSize(att.size) ? (
                      <span className="tabular-nums opacity-70">
                        {formatAttachmentSize(att.size)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {linkChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {linkChips.slice(0, 2).map(att => (
                  <a
                    key={att.id}
                    href={att.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <Link2 size={12} strokeWidth={LINE_ICON_STROKE} />
                    <span className="max-w-[180px] truncate">
                      {att.filename || att.external_url}
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 pt-1 flex flex-wrap items-center gap-x-[14px] gap-y-1 text-xs text-[var(--text-subtle)] min-w-0">
          {entry.author_id ? (() => {
            const isActiveAuthor =
              activeAuthorFilter !== undefined &&
              activeAuthorFilter === entry.author_id;
            const to = isActiveAuthor
              ? '/feed'
              : `/feed?author=${encodeURIComponent(entry.author_id)}`;
            return (
              <Link
                to={to}
                onClick={e => {
                  e.stopPropagation();
                  onAuthorClick?.(entry.author_id);
                }}
                aria-pressed={isActiveAuthor}
                className={[
                  'inline-flex items-center gap-1.5 truncate max-w-[200px] rounded-sm',
                  'transition-colors duration-fast',
                  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
                  isActiveAuthor
                    ? 'text-[var(--text)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                ].join(' ')}
                title={
                  isActiveAuthor
                    ? `Clear author filter (${authorName})`
                    : `Filter feed by ${authorName}`
                }
              >
                <Avatar
                  name={authorName}
                  url={entry.author?.avatar_url}
                  attachmentId={entry.author?.avatar_attachment_id}
                  userId={entry.author?.id}
                  version={entry.author?.updated_at}
                  size="xs"
                  ringVariant="none"
                />
                {authorName}
              </Link>
            );
          })() : (
            <span className="inline-flex items-center gap-1.5 truncate text-[var(--text-muted)]">
              <Avatar
                name={authorName}
                attachmentId={entry.author?.avatar_attachment_id}
                userId={entry.author?.id}
                version={entry.author?.updated_at}
                size="xs"
                ringVariant="none"
              />
              {authorName}
            </span>
          )}
          {entry.type
            ? (() => {
                const label = prettifyType(entry.type);
                const tc = entryTypeColor(entry.type, activeWorkspace?.accent_color);
                // Transparent fill keeps the entry-type's foreground readable
                // against any card surface — the muted-bg fill previously
                // tinted dark text to the point of low contrast. Border +
                // text in tc.fg now carry the identity.
                const pillStyle = {
                  backgroundColor: 'transparent',
                  color: tc.fg,
                  borderWidth: '1px',
                  borderColor: tc.fg
                };
                const isActive =
                  activeTypeFilter !== undefined &&
                  slugEntryTypeName(activeTypeFilter) ===
                    slugEntryTypeName(entry.type);
                if (onTypeClick) {
                  return (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onTypeClick(slugEntryTypeName(entry.type));
                      }}
                      aria-pressed={isActive}
                      className="inline-flex shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] rounded-full"
                      title={
                        isActive
                          ? `Clear filter (currently: ${label})`
                          : `Filter by ${label}`
                      }
                    >
                      <Pill
                        tone="descriptive"
                        style={pillStyle}
                        className={`border-solid ${
                          isActive ? 'ring-1 ring-[var(--text)]' : ''
                        }`}
                      >
                        {label}
                      </Pill>
                    </button>
                  );
                }
                return (
                  <Pill tone="descriptive" style={pillStyle} className="border-solid">
                    {label}
                  </Pill>
                );
              })()
            : null}
          {/* UX-01 — Provenance badge sits next to the type pill so the
              "who wrote this" signal travels alongside the "what kind" signal.
              Human-source renders are intentionally subtle (low chrome). */}
          <ProvenanceBadge entry={entry} />
          {!hideComments && (
            <button
              type="button"
              onClick={!canReact ? undefined : (e => { e.stopPropagation(); void handleLike(); })}
              disabled={!canReact}
              className={`inline-flex items-center gap-1 transition-colors duration-fast ${
                !canReact ? 'cursor-default' : ''
              } ${
                quickLikeActive
                  ? 'text-[var(--brand-accent)]'
                  : 'hover:text-[var(--text)] text-[var(--text-subtle)]'
              }`}
              aria-label={quickLikeActive ? 'Remove like' : 'Like'}
            >
              <ThumbsUp size={13} strokeWidth={LINE_ICON_STROKE} aria-hidden />
              <span className="tabular-nums">{totalLikes}</span>
            </button>
          )}
          {!publicMode && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                const trackId = entry.track?.id || entry.track_id;
                if (!trackId) {
                  showToast('Cannot share — entry has no track', 'error');
                  return;
                }
                const u = new URL(`/tracks/${trackId}`, window.location.origin);
                u.searchParams.set('entry', entry.id);
                void navigator.clipboard.writeText(u.toString()).then(
                  () => showToast('Link copied', 'success'),
                  () => showToast('Could not copy link', 'error')
                );
              }}
              className="inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors duration-fast"
              aria-label="Copy link to this entry"
              title="Copy link"
            >
              <Share2 size={13} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
          )}
          {commentCount > 0 && !hideComments ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onOpen?.(entry, { focusComments: true });
              }}
              className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors duration-fast"
              aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
            >
              <MessageSquare size={13} strokeWidth={LINE_ICON_STROKE} aria-hidden />
              <span className="tabular-nums">
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </span>
            </button>
          ) : null}
          {/* App — Link routes to /apps/{id}, matching the
              dialog's metadata chip. Only renders when the entry has
              a parent app (track-without-app entries skip this). */}
          {entry.app?.id ? (
            <Link
              to={appPath(entry.app.id)}
              onClick={e => e.stopPropagation()}
              className="truncate max-w-[180px] hover:text-[var(--text-muted)] transition-colors duration-fast"
              title={`Open ${entry.app.name?.trim() || 'app'}`}
            >
              {entry.app.name?.trim() || 'App'}
            </Link>
          ) : null}
          {/* Track — Link routes to /tracks/{id}, matching the dialog's
              metadata chip. */}
          {showTrackChip && entry.track?.id && trackName ? (
            <Link
              to={`/tracks/${entry.track.id}`}
              onClick={e => e.stopPropagation()}
              className="truncate max-w-[200px] hover:text-[var(--text-muted)] transition-colors duration-fast"
              title={`Open ${trackName}`}
            >
              {trackName}
            </Link>
          ) : showTrackChip && trackName ? (
            <span className="truncate">{trackName}</span>
          ) : null}
          {/* Tags — descriptive pills that route to /feed?tag={id}.
              Same Link-based pattern as the author segment so the
              behavior is consistent everywhere a row appears. The
              active tag gets a thin ring matching the type-pill
              convention. */}
          {entry.tags && entry.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {entry.tags.map(tag => {
                const isActiveTag =
                  activeTagFilter !== undefined && activeTagFilter === tag.id;
                const label = tag.name?.trim() || 'tag';
                const to = isActiveTag
                  ? '/feed'
                  : `/feed?tag=${encodeURIComponent(tag.id)}`;
                return (
                  <Link
                    key={tag.id}
                    to={to}
                    onClick={e => {
                      e.stopPropagation();
                      onTagClick?.(tag.id);
                    }}
                    aria-pressed={isActiveTag}
                    className="inline-flex shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] rounded-full"
                    title={
                      isActiveTag
                        ? `Clear tag filter (${label})`
                        : `Filter feed by ${label}`
                    }
                  >
                    <Pill
                      tone="descriptive"
                      variant="neutral"
                      style={tagColorStyle(tag.color)}
                      className={
                        isActiveTag ? 'ring-1 ring-[var(--text)]' : ''
                      }
                    >
                      #{label}
                    </Pill>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Date column — sm+ only; on mobile the date sits inline above. */}
      <div className="hidden sm:flex flex-col items-end shrink-0 text-xs text-[var(--text-subtle)] tabular-nums leading-snug">
        <span>{stamp.dateLabel}</span>
        <span>{stamp.timeLabel}</span>
        {canEdit && (onEdit || onDelete) ? (
          <div className="relative mt-1" data-entry-menu>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setShowMenu(s => !s);
              }}
              className="p-1.5 rounded-[var(--radius-input)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors duration-fast"
              aria-expanded={showMenu}
              aria-haspopup="menu"
              aria-label="Post actions"
            >
              <MoreHorizontal size={16} strokeWidth={LINE_ICON_STROKE} />
            </button>
            {showMenu ? (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 bg-[var(--panel)] border border-[var(--panel-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-pop)] z-30 py-1 min-w-[130px] max-w-[calc(100vw-2rem)] animate-fade-in text-left"
                onClick={e => e.stopPropagation()}
              >
                {onEdit ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={e => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onEdit(entry);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--panel-2)] text-[var(--text)]"
                  >
                    <Edit2 size={13} strokeWidth={LINE_ICON_STROKE} /> Edit
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
                  >
                    <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} /> Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile-only owner menu — date column is hidden on mobile, so the
          desktop menu (above) is unreachable. Render an absolute-positioned
          trigger in the article's top-right corner. Same showMenu state and
          handlers; data-entry-menu marks both wrappers for click-outside. */}
      {canEdit && (onEdit || onDelete) ? (
        <div className="absolute top-3 right-3 sm:hidden" data-entry-menu>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setShowMenu(s => !s);
            }}
            className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-input)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors duration-fast"
            aria-expanded={showMenu}
            aria-haspopup="menu"
            aria-label="Post actions"
          >
            <MoreHorizontal size={16} strokeWidth={LINE_ICON_STROKE} />
          </button>
          {showMenu ? (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 bg-[var(--panel)] border border-[var(--panel-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-pop)] z-30 py-1 min-w-[130px] max-w-[calc(100vw-2rem)] animate-fade-in text-left"
              onClick={e => e.stopPropagation()}
            >
              {onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={e => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit(entry);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--panel-2)] text-[var(--text)]"
                >
                  <Edit2 size={13} strokeWidth={LINE_ICON_STROKE} /> Edit
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={e => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
                >
                  <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} /> Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

    </article>
    {openAttachment ? (
      <AttachmentViewerModal
        attachment={openAttachment}
        allAttachments={visibleFileAttachments}
        onClose={() => setOpenAttachmentId(null)}
        onPrev={
          visibleFileAttachments.length > 1
            ? () => advanceOpenAttachment(-1)
            : undefined
        }
        onNext={
          visibleFileAttachments.length > 1
            ? () => advanceOpenAttachment(1)
            : undefined
        }
        onDownload={handleDownloadAttachment}
      />
    ) : null}
    </>
  );
}

// Memoized: in entry lists (feed/table/kanban) parent state changes — search
// typing, opening a modal, infinite-scroll appends — would otherwise re-render
// every mounted card (each re-parsing markdown). With stable callbacks from the
// parents, shallow prop comparison skips cards whose entry/track didn't change.
export const EntryCard = memo(EntryCardInner);
