import { useCallback, useMemo, useState } from 'react';

import type { Attachment } from '../../../types';
import { isImageAttachment } from '../../../utils/attachmentMime';
import { useToast } from '../../../context/ToastContext';
import { attachmentsApi } from '../../../api/attachments';
import { AttachmentRow } from './AttachmentRow';
import { AttachmentViewerModal } from './AttachmentViewerModal';

/**
 * Compact row-list rendering for the entry-detail surface.
 *
 * Drop-in replacement for ``AttachmentGrid`` — same prop shape, same
 * viewer modal, same download/copy/delete plumbing. The visual axis
 * is vertical density: ~32px per attachment vs. ~200px for the tile
 * grid, so a typical four-attachment entry collapses from ~320px of
 * page real estate to ~140px including the inline upload affordance.
 *
 * Feed surfaces (EntryCard) keep the existing pill-row rendering;
 * this component is intentionally scoped to the detail modal where
 * the user wants to scan a list, not preview a gallery.
 */

interface AttachmentRowListProps {
  attachments: Attachment[];
  layout?: 'list' | 'strip';
  canDelete?: boolean;
  onDeleted?(attachmentId: string): void;
  canSetCardPreview?: boolean;
  cardPreviewAttachmentId?: string | null;
  onSetCardPreview?(attachmentId: string): void | Promise<void>;
  /**
   * Optional empty-state slot. Most callers leave this empty — the
   * dropzone rendered next to the list is the primary affordance
   * when there's nothing here yet.
   */
  emptyState?: React.ReactNode;
}

export function AttachmentRowList({
  attachments,
  layout = 'list',
  canDelete = false,
  onDeleted,
  canSetCardPreview = false,
  cardPreviewAttachmentId,
  onSetCardPreview,
  emptyState,
}: AttachmentRowListProps) {
  const { showToast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingCardPreview, setSettingCardPreview] = useState(false);

  // The viewer modal navigates *visible* attachments only — blocked
  // items stay in the graph for audit but shouldn't show up in the
  // prev/next loop.
  const visibleAttachments = useMemo(
    () => attachments.filter((a) => a.scan_status !== 'blocked'),
    [attachments]
  );

  const openIndex = useMemo(
    () => visibleAttachments.findIndex((a) => a.id === openId),
    [visibleAttachments, openId]
  );

  const open = useCallback((att: Attachment) => setOpenId(att.id), []);
  const closeViewer = useCallback(() => setOpenId(null), []);

  const openAttachment = useMemo(
    () =>
      openId ? visibleAttachments.find(a => a.id === openId) ?? null : null,
    [openId, visibleAttachments]
  );

  const handleSetCardPreview = useCallback(
    async (attachment: Attachment) => {
      if (!onSetCardPreview || !isImageAttachment(attachment)) return;
      setSettingCardPreview(true);
      try {
        await onSetCardPreview(attachment.id);
      } catch {
        showToast('Failed to update card preview', 'error');
      } finally {
        setSettingCardPreview(false);
      }
    },
    [onSetCardPreview, showToast]
  );

  const advance = useCallback(
    (delta: 1 | -1) => {
      if (openIndex < 0 || visibleAttachments.length === 0) return;
      const nextIndex =
        (openIndex + delta + visibleAttachments.length) %
        visibleAttachments.length;
      setOpenId(visibleAttachments[nextIndex].id);
    },
    [visibleAttachments, openIndex]
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
        const status = (e as { response?: { status?: number } })?.response
          ?.status;
        showToast(
          status === 404
            ? 'This file is no longer available — it may have been deleted.'
            : e instanceof Error
              ? e.message
              : 'Download failed',
          'error'
        );
      }
    },
    [showToast]
  );

  const handleCopyLink = useCallback(
    async (attachment: Attachment) => {
      const url =
        attachment.source_type === 'url'
          ? attachment.external_url
          : attachment.download_url ||
            `${window.location.origin}/api/attachments/${attachment.id}/download`;
      if (!url) {
        showToast('No link available', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied', 'success');
      } catch {
        showToast('Could not copy link', 'error');
      }
    },
    [showToast]
  );

  const handleDelete = useCallback(
    async (attachment: Attachment) => {
      try {
        await attachmentsApi.delete(attachment.id);
        onDeleted?.(attachment.id);
        showToast('Attachment deleted', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
      }
    },
    [onDeleted, showToast]
  );

  if (!attachments.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <>
      <div className={layout === 'strip' ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-1'}>
        {attachments.map((att) => (
          <AttachmentRow
            key={att.id}
            attachment={att}
            onOpen={open}
            onDownload={handleDownload}
            onCopyLink={handleCopyLink}
            onDelete={canDelete ? handleDelete : undefined}
            canDelete={canDelete}
            showThumbnail
            isCardPreview={
              Boolean(cardPreviewAttachmentId) && att.id === cardPreviewAttachmentId
            }
          />
        ))}
      </div>
      {openAttachment ? (
        <AttachmentViewerModal
          attachment={openAttachment}
          allAttachments={visibleAttachments}
          onClose={closeViewer}
          onPrev={
            visibleAttachments.length > 1 ? () => advance(-1) : undefined
          }
          onNext={
            visibleAttachments.length > 1 ? () => advance(1) : undefined
          }
          onDownload={handleDownload}
          canSetCardPreview={
            canSetCardPreview &&
            isImageAttachment(openAttachment) &&
            Boolean(onSetCardPreview)
          }
          isCardPreview={
            Boolean(cardPreviewAttachmentId) &&
            openAttachment.id === cardPreviewAttachmentId
          }
          onSetCardPreview={
            canSetCardPreview && onSetCardPreview
              ? att => void handleSetCardPreview(att)
              : undefined
          }
          settingCardPreview={settingCardPreview}
        />
      ) : null}
    </>
  );
}
