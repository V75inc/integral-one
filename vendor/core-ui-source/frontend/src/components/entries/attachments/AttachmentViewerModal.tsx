import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Star,
} from 'lucide-react';

import type { Attachment } from '../../../types';
import { Modal } from '../../ui/Modal';
import { LINE_ICON_STROKE } from '../../ui/IconWell';
import { formatAttachmentSize } from '../../../utils/attachmentMime';
import { formatDuration, shortHash } from './attachmentHelpers';
import { AttachmentPane } from './AttachmentPane';
import { MetadataPanel } from './MetadataPanel';

/**
 * The attachment viewer.
 *
 * Single modal that switches its body component based on the resolved
 * viewer kind. The footer shows file metadata, navigation buttons
 * (prev/next within the entry's attachment set), and a download
 * affordance. Metadata toggle reveals a side panel with the extracted
 * fields from the Phase 1.5 metadata pipeline.
 *
 * Keyboard:
 *   - Esc: close (handled by Modal)
 *   - ←/→: prev / next when ``onPrev``/``onNext`` are provided
 */

interface AttachmentViewerModalProps {
  attachment: Attachment;
  allAttachments: Attachment[];
  onClose(): void;
  onPrev?(): void;
  onNext?(): void;
  onDownload(attachment: Attachment): void;
  /** When set, show a star action to pin this attachment as the entry card preview. */
  canSetCardPreview?: boolean;
  isCardPreview?: boolean;
  onSetCardPreview?(attachment: Attachment): void;
  settingCardPreview?: boolean;
}

export function AttachmentViewerModal({
  attachment,
  allAttachments,
  onClose,
  onPrev,
  onNext,
  onDownload,
  canSetCardPreview = false,
  isCardPreview = false,
  onSetCardPreview,
  settingCardPreview = false,
}: AttachmentViewerModalProps) {
  const [metadataOpen, setMetadataOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPrev, onNext]);

  const position = useMemo(() => {
    const idx = allAttachments.findIndex((a) => a.id === attachment.id);
    return { current: idx + 1, total: allAttachments.length };
  }, [allAttachments, attachment.id]);

  // Compact info row shown under the modal title.
  const sizeLabel = formatAttachmentSize(attachment.size);
  const duration =
    typeof attachment.metadata?.common?.duration_seconds === 'number'
      ? formatDuration(
          attachment.metadata.common.duration_seconds as number
        )
      : '';
  const dims =
    attachment.width && attachment.height
      ? `${attachment.width}×${attachment.height}`
      : '';
  const pages =
    typeof attachment.page_count === 'number' && attachment.page_count > 0
      ? `${attachment.page_count} ${attachment.page_count === 1 ? 'page' : 'pages'}`
      : '';

  return (
    <Modal
      open
      onClose={onClose}
      title={attachment.filename || 'Attachment'}
      /* Content-viewer exception: images / PDFs / video need the larger
         canvas. Standard control modals use ``max-w-dialog-form`` (720px,
         --dialog-w-form); this viewer uses ``max-w-dialog-wide`` (1024px,
         --dialog-w-wide) per the three-token dialog dimension set. See
         .planning/ui-templating/TOKENS.md. */
      width="max-w-dialog-wide"
    >
      <div className="flex h-[80vh] min-h-0 flex-col">
        {/* Sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] px-5 py-2 text-[11px] tabular-nums text-[var(--text-muted)]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {position.total > 1 && (
              <span>
                {position.current} of {position.total}
              </span>
            )}
            {sizeLabel && <span>{sizeLabel}</span>}
            {pages && <span>{pages}</span>}
            {duration && <span>{duration}</span>}
            {dims && <span>{dims}</span>}
            {attachment.content_hash && (
              <span title={attachment.content_hash}>
                sha256:{shortHash(attachment.content_hash)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canSetCardPreview && onSetCardPreview ? (
              <button
                type="button"
                onClick={() => onSetCardPreview(attachment)}
                disabled={settingCardPreview || isCardPreview}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-input)] px-2 py-1 text-[11px] ${
                  isCardPreview
                    ? 'bg-[var(--panel-2)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
                aria-pressed={isCardPreview}
                title={
                  isCardPreview ? 'Card preview image' : 'Use as card preview image'
                }
              >
                <Star
                  size={12}
                  strokeWidth={LINE_ICON_STROKE}
                  className={isCardPreview ? 'fill-current' : undefined}
                />
                Card preview
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMetadataOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-[var(--radius-input)] px-2 py-1 text-[11px] ${
                metadataOpen
                  ? 'bg-[var(--panel-2)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
              aria-pressed={metadataOpen}
            >
              <Info size={12} strokeWidth={LINE_ICON_STROKE} />
              Metadata
            </button>
            <button
              type="button"
              onClick={() => onDownload(attachment)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-input)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Download size={12} strokeWidth={LINE_ICON_STROKE} />
              Download
            </button>
          </div>
        </div>

        {/* Body + optional metadata side panel */}
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--panel-2)]/30">
            <AttachmentPane attachment={attachment} onDownload={onDownload} />
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous attachment"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-[1px] hover:bg-black/70"
              >
                <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} />
              </button>
            )}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                aria-label="Next attachment"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-[1px] hover:bg-black/70"
              >
                <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} />
              </button>
            )}
          </div>
          {metadataOpen && (
            <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--panel-border)] bg-[var(--panel)] px-3 py-3">
              <MetadataPanel attachment={attachment} />
            </aside>
          )}
        </div>
      </div>
    </Modal>
  );
}
