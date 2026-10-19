import { useCallback, useMemo, useState } from 'react';

import type { Attachment } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { attachmentsApi } from '../../../api/attachments';
import { AttachmentTile } from './AttachmentTile';
import { AttachmentViewerModal } from './AttachmentViewerModal';

/**
 * Responsive grid of attachment tiles + the viewer modal.
 *
 * The grid is the single source of truth for which attachment (if any)
 * is currently being viewed. The viewer modal supports prev/next
 * navigation inside this set so a user opening one PDF can flip
 * through the rest without closing the modal.
 *
 * Delete + download + copy-link are handled here so each tile stays
 * presentational. Delete fires the API and propagates a callback up
 * so the parent can refresh its list optimistically.
 */

interface AttachmentGridProps {
  attachments: Attachment[];
  canDelete?: boolean;
  onDeleted?(attachmentId: string): void;
  /**
   * Optional empty-state slot; when not provided and ``attachments``
   * is empty, the grid renders nothing (the caller's dropzone is the
   * primary affordance for adding files).
   */
  emptyState?: React.ReactNode;
}

export function AttachmentGrid({
  attachments,
  canDelete = false,
  onDeleted,
  emptyState,
}: AttachmentGridProps) {
  const { showToast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const fileAttachments = useMemo(
    () => attachments.filter((a) => a.scan_status !== 'blocked'),
    [attachments]
  );

  const openIndex = useMemo(
    () => fileAttachments.findIndex((a) => a.id === openId),
    [fileAttachments, openId]
  );

  const open = useCallback((att: Attachment) => setOpenId(att.id), []);
  const closeViewer = useCallback(() => setOpenId(null), []);

  const advance = useCallback(
    (delta: 1 | -1) => {
      if (openIndex < 0 || fileAttachments.length === 0) return;
      const nextIndex =
        (openIndex + delta + fileAttachments.length) % fileAttachments.length;
      setOpenId(fileAttachments[nextIndex].id);
    },
    [fileAttachments, openIndex]
  );

  const handleDownload = useCallback(
    async (attachment: Attachment) => {
      if (attachment.source_type === 'url' && attachment.external_url) {
        window.open(attachment.external_url, '_blank', 'noopener,noreferrer');
        return;
      }
      try {
        const { blob, contentType } =
          await attachmentsApi.fetchDownloadBlob(attachment.id);
        const blobUrl = URL.createObjectURL(
          contentType ? new Blob([blob], { type: contentType }) : blob
        );
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = attachment.filename || 'attachment';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after the browser has had a beat to start the
        // download — premature revocation cancels it in Safari.
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Download failed',
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
        showToast(
          e instanceof Error ? e.message : 'Delete failed',
          'error'
        );
      }
    },
    [onDeleted, showToast]
  );

  if (!attachments.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
        {attachments.map((att) => (
          <AttachmentTile
            key={att.id}
            attachment={att}
            onOpen={open}
            onDownload={handleDownload}
            onCopyLink={handleCopyLink}
            onDelete={canDelete ? handleDelete : undefined}
            canDelete={canDelete}
          />
        ))}
      </div>
      {openId && openIndex >= 0 && (
        <AttachmentViewerModal
          attachment={fileAttachments[openIndex]}
          allAttachments={fileAttachments}
          onClose={closeViewer}
          onPrev={fileAttachments.length > 1 ? () => advance(-1) : undefined}
          onNext={fileAttachments.length > 1 ? () => advance(1) : undefined}
          onDownload={handleDownload}
        />
      )}
    </>
  );
}
