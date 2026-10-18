import { useState } from 'react';
import {
  Download,
  Eye,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  MoreVertical,
  Presentation,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Attachment } from '../../../types';
import {
  formatAttachmentSize,
  getAttachmentKind,
} from '../../../utils/attachmentMime';
import { LINE_ICON_STROKE } from '../../ui/IconWell';
import {
  canViewInApp,
  formatDuration,
  resolveViewerKind,
  thumbnailSrc,
} from './attachmentHelpers';

/**
 * One tile in the attachment grid.
 *
 * Renders either:
 *   - A cover area: image thumbnail for image attachments,
 *     a large kind-icon for everything else.
 *   - A meta row: filename, size, and (when present) page count /
 *     duration / dimensions.
 *   - Hover affordances: open / download / external link / delete.
 *
 * The tile itself is a button — clicking it opens the viewer modal
 * (handled by the parent grid). Delete and download are nested action
 * buttons that ``stopPropagation`` so they don't trigger the open.
 */

const KIND_ICON: Record<string, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  archive: File,
  other: File,
};

interface AttachmentTileProps {
  attachment: Attachment;
  onOpen(attachment: Attachment): void;
  onDownload(attachment: Attachment): void;
  onCopyLink(attachment: Attachment): void;
  onDelete?(attachment: Attachment): void;
  canDelete?: boolean;
}

export function AttachmentTile({
  attachment,
  onOpen,
  onDownload,
  onCopyLink,
  onDelete,
  canDelete = false,
}: AttachmentTileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isUrl = attachment.source_type === 'url';
  const kind = getAttachmentKind(attachment);
  const viewerKind = resolveViewerKind(attachment);
  const previewable = canViewInApp(attachment);
  const thumb = thumbnailSrc(attachment);
  const IconComp = kind === 'pdf' ? FileText : KIND_ICON[kind] ?? File;
  const isPpt = viewerKind === 'pptx-preview';
  const isBlocked = attachment.scan_status === 'blocked';

  const stopProp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePrimaryClick = () => {
    if (isBlocked) return;
    if (isUrl && attachment.external_url) {
      window.open(attachment.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (previewable) {
      onOpen(attachment);
    } else {
      onDownload(attachment);
    }
  };

  // Meta-row chips: page count / duration / dimensions from the
  // extracted metadata. We pull from the typed attachment fields
  // first, then fall back to metadata.common when we need to.
  const meta = attachment.metadata?.common ?? {};
  const pageCount =
    attachment.page_count ??
    (typeof meta.page_count === 'number' ? (meta.page_count as number) : null);
  const duration =
    typeof meta.duration_seconds === 'number'
      ? (meta.duration_seconds as number)
      : null;
  const dims =
    attachment.width && attachment.height
      ? `${attachment.width}×${attachment.height}`
      : '';

  return (
    <div
      role="group"
      aria-label={attachment.filename || 'Attachment'}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/40 transition-all duration-fast hover:border-[var(--panel-border)] hover:shadow-[var(--shadow-card)]"
    >
      <button
        type="button"
        onClick={handlePrimaryClick}
        className="flex w-full flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        disabled={isBlocked}
      >
        {/* Cover area */}
        <div className="relative aspect-[4/3] w-full bg-[var(--panel)] flex items-center justify-center overflow-hidden">
          {isBlocked ? (
            <div className="flex flex-col items-center gap-1 text-[var(--danger-fg)]">
              <ShieldAlert size={28} strokeWidth={LINE_ICON_STROKE} />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Blocked
              </span>
            </div>
          ) : thumb ? (
            <img
              src={thumb}
              alt={attachment.filename}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : isPpt ? (
            <Presentation
              size={36}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--text-muted)]"
            />
          ) : isUrl ? (
            <Link2
              size={32}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--text-muted)]"
            />
          ) : (
            <IconComp
              size={36}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--text-muted)]"
            />
          )}

          {/* Format tag in the bottom-left of the cover */}
          {!isBlocked && (
            <span className="absolute bottom-1.5 left-1.5 rounded-[var(--radius-pill)] bg-black/55 backdrop-blur-[1px] px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-white uppercase">
              {isUrl
                ? 'Link'
                : isPpt
                ? 'PPTX'
                : kind === 'pdf'
                ? 'PDF'
                : kind === 'sheet'
                ? 'Sheet'
                : kind === 'image' && attachment.mime_type
                ? attachment.mime_type.split('/')[1] || 'Image'
                : kind}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex min-w-0 flex-col gap-1 px-2.5 py-2">
          <div className="truncate text-sm font-medium text-[var(--text)]">
            {attachment.filename || 'Untitled'}
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
            {!isUrl && formatAttachmentSize(attachment.size) && (
              <span>{formatAttachmentSize(attachment.size)}</span>
            )}
            {pageCount != null && pageCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                </span>
              </>
            )}
            {duration && (
              <>
                <span aria-hidden>·</span>
                <span>{formatDuration(duration)}</span>
              </>
            )}
            {dims && (
              <>
                <span aria-hidden>·</span>
                <span>{dims}</span>
              </>
            )}
          </div>
        </div>
      </button>

      {/* Hover actions */}
      {!isBlocked && (
        <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100">
          {previewable && !isUrl && (
            <button
              type="button"
              onClick={(e) => {
                stopProp(e);
                onOpen(attachment);
              }}
              className="pointer-events-auto rounded-full bg-black/55 p-1.5 text-white backdrop-blur-[1px] hover:bg-black/70"
              aria-label="Open"
            >
              <Eye size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          )}
          {isUrl ? (
            <button
              type="button"
              onClick={(e) => {
                stopProp(e);
                if (attachment.external_url) {
                  window.open(
                    attachment.external_url,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }
              }}
              className="pointer-events-auto rounded-full bg-black/55 p-1.5 text-white backdrop-blur-[1px] hover:bg-black/70"
              aria-label="Open link"
            >
              <ExternalLink size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                stopProp(e);
                onDownload(attachment);
              }}
              className="pointer-events-auto rounded-full bg-black/55 p-1.5 text-white backdrop-blur-[1px] hover:bg-black/70"
              aria-label="Download"
            >
              <Download size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                stopProp(e);
                setMenuOpen((v) => !v);
              }}
              className="pointer-events-auto rounded-full bg-black/55 p-1.5 text-white backdrop-blur-[1px] hover:bg-black/70"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="pointer-events-auto absolute right-0 top-full mt-1 w-44 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow-pop)] z-10"
                onClick={stopProp}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)]"
                  onClick={() => {
                    onCopyLink(attachment);
                    setMenuOpen(false);
                  }}
                >
                  Copy link
                </button>
                {canDelete && onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--danger-fg)] hover:bg-[var(--panel-2)]"
                    onClick={() => {
                      setConfirmingDelete(true);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={11} strokeWidth={LINE_ICON_STROKE} />
                      Delete
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline delete confirmation overlay */}
      {confirmingDelete && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--panel)]/95 backdrop-blur-[2px] p-3">
          <div className="text-center text-xs text-[var(--text)]">
            Delete this attachment? This cannot be undone.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--text)] hover:bg-[var(--panel-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete?.(attachment);
              }}
              className="rounded-[var(--radius-input)] bg-[var(--danger-fg)] px-2.5 py-1 text-xs text-white hover:opacity-90"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
