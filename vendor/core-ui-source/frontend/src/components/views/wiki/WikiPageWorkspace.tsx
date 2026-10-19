import { PageMeta } from '../../../components/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Edit2, Trash2 } from 'lucide-react';
import { attachmentsApi, entriesApi } from '../../../api';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { useEntryComments } from '../../../hooks/useEntryComments';
import { formatRelativeTime } from '../../../utils';
import type { Attachment, Entry } from '../../../types';
import { Button, LINE_ICON_STROKE, MarkdownContent } from '../../ui';
import { EntryCommentsSection } from '../../entries/EntryCommentsSection';
import { EntryFormExpandedView, useEntryExpandedForm } from '../../entries/EntryFormExpanded';
import { EntrySocialActions } from '../../entries/EntrySocialActions';
import { AddToEntryControl } from '../../entries/AddToEntryControl';
import { AttachmentRowList } from '../../entries/attachments';
import type { AttachmentRecord } from '../../../api/attachments';
import { buildBreadcrumbPath } from './buildPageTree';
import { extractMarkdownHeadings } from './extractMarkdownHeadings';
import { getEntryFieldValue, getEntryTitle } from './wikiFieldAccess';
import { isWikiCapableEntryType } from './resolveWikiPageEntryType';

const EMPTY_TRACKS: import('../../../types').Track[] = [];

function buildFormSignature(form: {
  title: string;
  body: string;
  type: string;
  selectedTagIds: string[];
  fieldValues: Record<string, unknown>;
}): string {
  return JSON.stringify({
    title: form.title,
    body: form.body,
    type: form.type,
    tags: form.selectedTagIds,
    fields: form.fieldValues,
  });
}

function prettifyType(type: string): string {
  if (!type) return '';
  const cleaned = type.trim().replace(/[_-]+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export interface WikiPageWorkspaceProps {
  entry: Entry;
  allEntries: Entry[];
  parentField: string;
  bodyField: string;
  titleField: string;
  onSelectPage: (entry: Entry) => void;
  isEditor?: boolean;
  publicPermissions?: Record<string, boolean>;
  publicToken?: string;
  onEntryUpdate?: (entry: Entry) => void;
  onEntryDelete?: (entryId: string) => void;
  viewEntryTypeKeys?: string[];
  /** Open inline editor immediately (e.g. after creating a new page). */
  initialEditMode?: boolean;
  onEditModeChange?: (editing: boolean) => void;
  /** Left PAGES tree sidebar visibility — drives symmetric left padding. */
  sidebarOpen?: boolean;
}

export function WikiPageWorkspace({
  entry,
  allEntries,
  parentField,
  bodyField,
  titleField,
  onSelectPage,
  isEditor,
  publicPermissions,
  publicToken,
  onEntryUpdate,
  onEntryDelete,
  viewEntryTypeKeys,
  initialEditMode = false,
  onEditModeChange,
  sidebarOpen = true,
}: WikiPageWorkspaceProps) {
  const confirm = useConfirm();
  const { showToast, showPendingToast, resolveToast } = useToast();
  const [localEntry, setLocalEntry] = useState(entry);
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saveError, setSaveError] = useState(false);
  const savedSigRef = useRef('');

  useEffect(() => {
    setLocalEntry(entry);
    setIsEditing(initialEditMode);
    // Keyed on entry.id: this resets local edit state, so depending on the
    // `entry` object would discard an in-progress edit whenever the parent
    // re-rendered with a new object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, initialEditMode]);

  const setEditing = useCallback(
    (next: boolean) => {
      setIsEditing(next);
      onEditModeChange?.(next);
    },
    [onEditModeChange]
  );

  const canEdit = publicPermissions ? !!publicPermissions.update_entries : Boolean(isEditor);
  const canDelete = publicPermissions ? false : Boolean(onEntryDelete);
  const canReadComments = publicPermissions ? !!publicPermissions.read_comments : true;
  const canCreateComments = publicPermissions ? !!publicPermissions.create_comments : true;

  const editForm = useEntryExpandedForm({
    mode: 'edit',
    enabled: canEdit && isEditing,
    track: localEntry.track,
    tracksList: EMPTY_TRACKS,
    needsTrackPicker: false,
    initialEntry: localEntry,
    viewEntryTypeKeys,
    showToast,
  });

  useEffect(() => {
    if (!canEdit || !isEditing) return;
    savedSigRef.current = buildFormSignature({
      title: localEntry.title || '',
      body: localEntry.body || '',
      type: String(localEntry.type || '').toLowerCase(),
      selectedTagIds: (localEntry.tags || []).map(t => t.id),
      fieldValues: { ...(localEntry.custom_fields || {}) },
    });
  }, [
    localEntry.id,
    canEdit,
    isEditing,
    localEntry.title,
    localEntry.body,
    localEntry.type,
    localEntry.custom_fields,
    localEntry.tags,
  ]);

  useEffect(() => {
    let cancelled = false;
    attachmentsApi
      .listForEntry(localEntry.id)
      .then(next => {
        if (!cancelled) setAttachments(next);
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [localEntry.id]);

  const commentsModel = useEntryComments({
    entryId: localEntry.id,
    trackId: localEntry.track_id,
    onCommentCountChange: count => {
      const next = { ...localEntry, comment_count: count };
      setLocalEntry(next);
      onEntryUpdate?.(next);
    },
    enabled: canReadComments,
    publicToken,
  });

  const breadcrumbs = useMemo(
    () => buildBreadcrumbPath(localEntry.id, allEntries, parentField),
    [localEntry.id, allEntries, parentField]
  );

  const bodyText = getEntryFieldValue(localEntry, bodyField);
  const pageTitle = getEntryTitle(localEntry, titleField);
  const headings = useMemo(() => {
    if (isEditing) return [];
    const all = extractMarkdownHeadings(bodyText);
    if (!all.length) return [];
    // The page header already renders the title. Strip from the TOC any
    // heading that duplicates that label so the aside reflects only the
    // real sub-structure of the body.
    //
    // Two patterns covered:
    //   1. Top-level H1 — common when bodies are seeded from a doc-style
    //      template (`# Title` at the top). Drop any H1 unconditionally,
    //      since H1 = page-level scope and the page already has one in
    //      the header.
    //   2. First H2/H3 whose text normalizes to the page title — wiki
    //      bodies authored in markdown often open with `## Title` instead
    //      of an explicit H1. Drop only when the *first* heading matches
    //      the title (don't strip later duplicates).
    const normalize = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const normTitle = normalize(pageTitle);
    const filtered = all.filter(h => h.level !== 1);
    if (
      filtered.length &&
      normTitle &&
      normalize(filtered[0].text) === normTitle
    ) {
      return filtered.slice(1);
    }
    return filtered;
  }, [isEditing, bodyText, pageTitle]);

  const updatedLabel = localEntry.updated_at
    ? `Edited ${formatRelativeTime(localEntry.updated_at)}`
    : localEntry.created_at
      ? `Created ${formatRelativeTime(localEntry.created_at)}`
      : null;

  const handleDelete = async () => {
    const label = pageTitle.trim() || 'Untitled';
    const ok = await confirm({
      title: 'Delete page',
      message: `Delete “${label}”? This removes the page, its subpages links, and comments. This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (!ok) return;
    onEntryDelete?.(localEntry.id);
    const pendingId = showPendingToast('Deleting…');
    try {
      await entriesApi.delete(localEntry.id);
      resolveToast(pendingId, 'Page deleted', 'success');
    } catch {
      resolveToast(pendingId, 'Failed to delete page', 'error');
    }
  };

  const exitEditMode = () => {
    setSaveError(false);
    setEditing(false);
  };

  const quickUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      const uploaded: AttachmentRecord[] = [];
      if (files.length === 1) {
        uploaded.push(await attachmentsApi.uploadForEntry(localEntry.id, files[0]));
      } else {
        const result = await attachmentsApi.batchUploadForEntry(localEntry.id, files);
        result.results.forEach(r => {
          if ('attachment' in r) uploaded.push(r.attachment);
        });
      }
      if (uploaded.length) {
        setAttachments(prev => {
          const seen = new Set(prev.map(a => a.id));
          const fresh = uploaded.filter(r => r.id && !seen.has(r.id)) as unknown as Attachment[];
          return [...prev, ...fresh];
        });
        showToast('Attachment uploaded', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    }
  };

  const quickAddLink = async (url: string, label?: string) => {
    try {
      const record = await attachmentsApi.createUrlForEntry(localEntry.id, url, label);
      setAttachments(prev => {
        if (prev.some(a => a.id === record.id)) return prev;
        return [...prev, record as unknown as Attachment];
      });
      showToast('Link attached', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not attach link', 'error');
    }
  };

  const handleReactionsChange = (reactions: Entry['reactions']) => {
    const next = { ...localEntry, reactions };
    setLocalEntry(next);
    onEntryUpdate?.(next);
  };

  const handleSaveNow = useCallback(async () => {
    setSaveError(false);
    try {
      const updated = await editForm.handleSubmitEdit(localEntry.id);
      const merged: Entry = {
        ...localEntry,
        ...updated,
        type:
          updated.type &&
          isWikiCapableEntryType(updated.type, viewEntryTypeKeys)
            ? updated.type
            : localEntry.type,
        custom_fields: {
          ...(localEntry.custom_fields || {}),
          ...(updated.custom_fields || {}),
        },
      };
      setLocalEntry(merged);
      onEntryUpdate?.(merged);
      savedSigRef.current = buildFormSignature(editForm);
      setEditing(false);
    } catch {
      setSaveError(true);
    }
  }, [editForm, localEntry, onEntryUpdate, setEditing, viewEntryTypeKeys]);

  const showAside = !isEditing && headings.length >= 1;

  return (
    <div className="flex flex-1 min-w-0 items-start">
      <article className="flex-1 min-w-0 wiki-doc-scroll">
        <div
          className={`w-full min-w-0 py-6 md:py-8 pb-16 pl-6 md:pl-10 ${
            showAside || sidebarOpen ? 'pr-6 md:pr-10' : 'pr-0'
          }`}
        >
          {breadcrumbs.length > 1 ? (
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-subtle)] mb-6"
            >
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                const label = getEntryTitle(crumb, titleField);
                return (
                  <span key={crumb.id} className="inline-flex items-center gap-1 min-w-0">
                    {i > 0 ? (
                      <ChevronRight
                        size={12}
                        strokeWidth={LINE_ICON_STROKE}
                        className="shrink-0 opacity-50"
                        aria-hidden
                      />
                    ) : null}
                    {isLast ? (
                      <span className="truncate text-[var(--text-muted)]">{label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectPage(crumb)}
                        className="truncate hover:text-[var(--text)] hover:underline underline-offset-2"
                      >
                        {label}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : null}

          {canEdit && isEditing ? (
            <div className="mb-8">
              <div
                className="
                  sticky top-0 z-20
                  flex items-center justify-end gap-2 py-2.5 mb-4
                  bg-[var(--bg)]/95 backdrop-blur-sm
                  border-b border-[var(--panel-border)]
                "
              >
                {saveError ? (
                  <span className="mr-auto text-xs text-[var(--danger-fg)] truncate min-w-0">
                    Could not save — try again
                  </span>
                ) : (
                  <span className="mr-auto" aria-hidden />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={exitEditMode}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={editForm.loading}
                  onClick={() => void handleSaveNow()}
                >
                  Save changes
                </Button>
              </div>
              <EntryFormExpandedView
                {...editForm}
                layout="wiki"
                hideLinkPreview
                hideActions
                primaryLabel="Save changes"
                onPrimary={handleSaveNow}
              />
            </div>
          ) : (
            <>
              <header className="mb-8">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] leading-snug min-w-0">
                    {pageTitle}
                  </h1>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-1.5"
                      >
                        <Edit2 size={14} strokeWidth={LINE_ICON_STROKE} />
                        Edit
                      </Button>
                      {canDelete ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete()}
                          className="inline-flex items-center gap-1.5 text-[var(--danger-fg)] border-[color:var(--danger-fg)]/25 hover:bg-[var(--danger-bg)]"
                          aria-label="Delete page"
                        >
                          <Trash2 size={14} strokeWidth={LINE_ICON_STROKE} />
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <PageMeta>
                  {localEntry.type ? (
                    <span className="text-[var(--text-muted)]">
                      {prettifyType(localEntry.type)}
                    </span>
                  ) : null}
                  {localEntry.type && updatedLabel ? (
                    <span className="text-[var(--text-subtle)]" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {updatedLabel ? <span>{updatedLabel}</span> : null}
                </PageMeta>
              </header>
              <div className="wiki-doc-body">
                {bodyText ? (
                  <MarkdownContent mutedBody={false}>{bodyText}</MarkdownContent>
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--panel-border)] px-6 py-12 text-center">
                    <p className="text-sm text-[var(--text-muted)] mb-4">
                      This page is empty.
                    </p>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(true)}
                      >
                        Write something
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="mt-10 pt-8 border-t border-[var(--panel-border)] space-y-8">
            <EntrySocialActions
              entryId={localEntry.id}
              trackId={localEntry.track_id}
              reactions={localEntry.reactions || []}
              onReactionsChange={handleReactionsChange}
              commentCount={commentsModel.comments.length}
              onCommentsClick={() => {
                document
                  .getElementById(`wiki-comments-${localEntry.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              publicMode={!!publicPermissions}
              hideComments={!canReadComments}
              publicToken={publicToken}
              publicPermissions={publicPermissions}
            />

            {(attachments.length > 0 || (canEdit && !isEditing)) && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Attachments · {attachments.length}
                </p>
                {attachments.length > 0 && (
                  <AttachmentRowList
                    attachments={attachments}
                    canDelete={canEdit && !isEditing}
                    onDeleted={attachmentId =>
                      setAttachments(prev => prev.filter(a => a.id !== attachmentId))
                    }
                  />
                )}
                {canEdit && !isEditing ? (
                  <AddToEntryControl
                    onFilesAdded={quickUploadFiles}
                    onLinkAdded={quickAddLink}
                  />
                ) : null}
              </div>
            )}

            {canReadComments && (
              <div id={`wiki-comments-${localEntry.id}`} className="scroll-mt-6">
                <EntryCommentsSection model={commentsModel} canCreateComments={canCreateComments} />
              </div>
            )}
          </div>
        </div>
      </article>

      {showAside ? (
        <aside
          className="hidden xl:block w-48 shrink-0 sticky py-8 pr-3 pl-2 text-[var(--text-subtle)]"
          style={{ top: 'calc(var(--system-bar-h, 0px) + 1rem)' }}
          aria-label="On this page"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-3">
            On this page
          </p>
          <ul className="space-y-1.5">
            {headings.map((h, index) => (
              <li key={`${h.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    const els = document.querySelectorAll(
                      '.wiki-doc-body h1, .wiki-doc-body h2, .wiki-doc-body h3'
                    );
                    els[index]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  className="w-full text-left text-xs text-[var(--text-muted)] hover:text-[var(--text)] leading-snug truncate"
                  style={{ paddingLeft: (h.level - 1) * 8 }}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
