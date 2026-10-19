import { useState, useMemo, useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { ViewWidgetProps } from './types';
import type { Attachment, Entry } from '../../types';
import { entriesApi } from '../../api/entries';
import { attachmentsApi } from '../../api/attachments';
import { useToast } from '../../context/ToastContext';
import { isImageAttachment } from '../../utils/attachmentMime';
import {
  CARD_PREVIEW_ATTACHMENT_FIELD,
  firstImageAttachmentFromAttachments,
  firstImageUrlFromAttachments,
} from '../../utils/entryMedia';
import { AuthedImage, LINE_ICON_STROKE, MarkdownContent } from '../ui';
import { AttachmentViewerModal } from '../entries/attachments/AttachmentViewerModal';

interface GalleryLayout {
  cardSize?: 'sm' | 'md' | 'lg';
  aspectRatio?: string;
  showTitle?: boolean;
  showBody?: boolean;
  imageField?: string;
}

const CARD_SIZES: Record<string, { cols: string; imgHeight: string }> = {
  sm: { cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5', imgHeight: 'h-28' },
  md: { cols: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4', imgHeight: 'h-40' },
  lg: { cols: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3', imgHeight: 'h-56' },
};

function getImageUrl(entry: Entry, imageField?: string): string | null {
  const fromAttachments = firstImageUrlFromAttachments(
    entry.attachments,
    entry.custom_fields
  );
  if (fromAttachments) return fromAttachments;
  if (imageField) {
    let val: unknown = entry;
    const parts = imageField.split('.');
    for (const p of parts) {
      val = (val as Record<string, unknown>)?.[p];
      if (val === undefined) return null;
    }
    if (typeof val === 'string' && val.startsWith('http')) return val;
  }
  return null;
}

function entryImageAttachments(entry: Entry): Attachment[] {
  return (entry.attachments ?? []).filter(
    att => att.scan_status !== 'blocked' && isImageAttachment(att)
  );
}

function resolveGalleryOpenAttachment(entry: Entry): Attachment | null {
  const images = entryImageAttachments(entry);
  if (!images.length) return null;

  const preferredId = entry.custom_fields?.[CARD_PREVIEW_ATTACHMENT_FIELD];
  if (typeof preferredId === 'string' && preferredId.trim()) {
    const preferred = images.find(att => att.id === preferredId.trim());
    if (preferred) return preferred;
  }

  const hero = firstImageAttachmentFromAttachments(
    entry.attachments,
    entry.custom_fields
  );
  if (hero?.attachmentId) {
    const fromHero = images.find(att => att.id === hero.attachmentId);
    if (fromHero) return fromHero;
  }

  return images[0];
}

function GalleryWidgetInner({
  entries,
  view,
  onEntryOpen,
  onEntryUpdate,
  entryTypeSlugs,
  filterType,
  onFilterChange,
  isEditor,
}: ViewWidgetProps) {
  const { showToast } = useToast();
  const config = (view.config || {}) as Record<string, unknown>;
  const layout = (config.layout || {}) as GalleryLayout;

  const cardSize = layout.cardSize || 'md';
  const showTitle = layout.showTitle !== false;
  const showBody = layout.showBody !== false;
  const sizeConfig = CARD_SIZES[cardSize] || CARD_SIZES.md;

  const [viewerEntryId, setViewerEntryId] = useState<string | null>(null);
  const [openAttachmentId, setOpenAttachmentId] = useState<string | null>(null);
  const [settingCardPreview, setSettingCardPreview] = useState(false);

  const filteredEntries = useMemo(() => {
    if (!filterType) return entries;
    return entries.filter(e => e.type === filterType);
  }, [entries, filterType]);

  const viewerEntry = useMemo(
    () =>
      viewerEntryId
        ? filteredEntries.find(entry => entry.id === viewerEntryId) ?? null
        : null,
    [filteredEntries, viewerEntryId]
  );

  const viewerImageAttachments = useMemo(
    () => (viewerEntry ? entryImageAttachments(viewerEntry) : []),
    [viewerEntry]
  );

  const openIndex = useMemo(
    () => viewerImageAttachments.findIndex(att => att.id === openAttachmentId),
    [viewerImageAttachments, openAttachmentId]
  );

  const openAttachment = useMemo(
    () => (openIndex >= 0 ? viewerImageAttachments[openIndex] : null),
    [openIndex, viewerImageAttachments]
  );

  const openGalleryViewer = useCallback(
    (gridIndex: number) => {
      const entry = filteredEntries[gridIndex];
      if (!entry) return;
      const attachment = resolveGalleryOpenAttachment(entry);
      if (!attachment) return;
      setViewerEntryId(entry.id);
      setOpenAttachmentId(attachment.id);
    },
    [filteredEntries]
  );

  const closeViewer = useCallback(() => {
    setViewerEntryId(null);
    setOpenAttachmentId(null);
  }, []);

  const advanceViewer = useCallback(
    (delta: 1 | -1) => {
      if (openIndex < 0 || viewerImageAttachments.length <= 1) return;
      const nextIndex =
        (openIndex + delta + viewerImageAttachments.length) %
        viewerImageAttachments.length;
      setOpenAttachmentId(viewerImageAttachments[nextIndex].id);
    },
    [openIndex, viewerImageAttachments]
  );

  const handleDownload = useCallback(
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

  const cardPreviewAttachmentId = useMemo(() => {
    if (!viewerEntry) return null;
    const stored = viewerEntry.custom_fields?.[CARD_PREVIEW_ATTACHMENT_FIELD];
    if (typeof stored === 'string' && stored.trim()) return stored.trim();
    return (
      firstImageAttachmentFromAttachments(
        viewerEntry.attachments,
        viewerEntry.custom_fields
      )?.attachmentId ?? null
    );
  }, [viewerEntry]);

  const handleSetCardPreview = useCallback(
    async (attachment: Attachment) => {
      if (!viewerEntry || !isEditor) return;
      setSettingCardPreview(true);
      try {
        const updated = await entriesApi.update(viewerEntry.id, {
          custom_fields: {
            ...(viewerEntry.custom_fields ?? {}),
            [CARD_PREVIEW_ATTACHMENT_FIELD]: attachment.id,
          },
        });
        onEntryUpdate?.(updated);
        showToast('Card preview updated', 'success');
      } catch {
        showToast('Failed to update card preview', 'error');
      } finally {
        setSettingCardPreview(false);
      }
    },
    [isEditor, onEntryUpdate, showToast, viewerEntry]
  );

  return (
    <>
      {entryTypeSlugs && entryTypeSlugs.length > 0 && onFilterChange && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => onFilterChange('')}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
              !filterType
                ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'
            }`}
          >
            All
          </button>
          {entryTypeSlugs.map(slug => (
            <button
              key={slug}
              type="button"
              onClick={() => onFilterChange(slug)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-all ${
                filterType === slug
                  ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                  : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'
              }`}
            >
              {slug}
            </button>
          ))}
        </div>
      )}

      <div className={`grid ${sizeConfig.cols} gap-3`}>
        {filteredEntries.map((entry, i) => {
          const imageUrl = getImageUrl(entry, layout.imageField);

          return (
            <div
              key={entry.id}
              onClick={() => onEntryOpen(entry)}
              className="group cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-[var(--collection-border)] bg-[var(--panel)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--text-muted)]"
            >
              {imageUrl ? (
                <div
                  className={`relative ${sizeConfig.imgHeight} bg-[var(--panel-2)] overflow-hidden`}
                  onClick={e => {
                    e.stopPropagation();
                    openGalleryViewer(i);
                  }}
                >
                  <AuthedImage
                    src={imageUrl}
                    alt={entry.title || ''}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-base"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ) : (
                <div
                  className={`${sizeConfig.imgHeight} flex items-center justify-center bg-[var(--panel-2)]`}
                >
                  <LayoutGrid
                    size={32}
                    strokeWidth={LINE_ICON_STROKE}
                    className="text-[var(--text-subtle)]"
                  />
                </div>
              )}

              {(showTitle || showBody) && (
                <div className="p-3">
                  {showTitle && entry.title && (
                    <p className="text-sm font-medium text-[var(--text)] line-clamp-2 mb-1">
                      {entry.title}
                    </p>
                  )}
                  {showBody && entry.body ? (
                    <div className="text-xs text-[var(--text-muted)] line-clamp-3 overflow-hidden">
                      <MarkdownContent compact>{entry.body}</MarkdownContent>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs capitalize bg-[var(--panel-2)] text-[var(--text-muted)] px-2 py-0.5 rounded">
                      {entry.type}
                    </span>
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex gap-1">
                        {entry.tags.slice(0, 2).map(tag => (
                          <span
                            key={tag.id}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: tag.color ? `${tag.color}20` : 'var(--panel-2)',
                              color: tag.color || 'var(--text-muted)',
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredEntries.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--collection-border)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--text-muted)]">
          No entries to display.
        </div>
      )}

      {openAttachment && viewerEntry ? (
        <AttachmentViewerModal
          attachment={openAttachment}
          allAttachments={viewerImageAttachments}
          onClose={closeViewer}
          onPrev={
            viewerImageAttachments.length > 1 ? () => advanceViewer(-1) : undefined
          }
          onNext={
            viewerImageAttachments.length > 1 ? () => advanceViewer(1) : undefined
          }
          onDownload={handleDownload}
          canSetCardPreview={Boolean(isEditor)}
          isCardPreview={
            Boolean(cardPreviewAttachmentId) &&
            openAttachment.id === cardPreviewAttachmentId
          }
          onSetCardPreview={
            isEditor ? att => void handleSetCardPreview(att) : undefined
          }
          settingCardPreview={settingCardPreview}
        />
      ) : null}
    </>
  );
}

export const GalleryWidget = GalleryWidgetInner;
