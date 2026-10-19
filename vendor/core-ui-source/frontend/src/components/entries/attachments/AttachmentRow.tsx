import { useState } from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  Eye,
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
  attachmentFormatLabel,
  formatAttachmentSize,
  getAttachmentKind,
} from '../../../utils/attachmentMime';
import { LINE_ICON_STROKE } from '../../ui/IconWell';
import { AuthedImage } from '../../ui/AuthedImage';
import { attachmentImageDisplayUrl } from '../../../utils/entryMedia';
import {
  canViewInApp,
  formatDuration,
  resolveViewerKind,
} from './attachmentHelpers';

/**
 * Compact single-row representation of an attachment.
 *
 * Layout:
 *   - 24px leading slot — the image itself when there is one, otherwise a
 *     kind glyph tinted by file family
 *   - filename (truncates) with an optional "Cover" badge
 *   - metadata line beneath it (format · size · pages · dims / duration)
 *   - hover-revealed action cluster (eye / download / more), trailing
 *
 * Roughly 54px tall — versus the ~200px tile in AttachmentTile — which
 * is the density story for the entry-detail surface. Same delete-with-
 * confirmation pattern as the tile; the confirm overlay swaps in for
 * the row rather than overlaying an image.
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

// Tint mapping kept narrow: the row is a quiet UI element, the icon
// colour is the only colour signal. PDF / image / sheet earn a hint;
// everything else stays neutral so the eye doesn't bounce.
const KIND_ICON_COLOR: Record<string, string> = {
  image: 'var(--info-fg)',
  pdf: 'var(--danger-fg)',
  sheet: 'var(--success-fg)',
  // text / video / audio / archive / other / link → muted
};

interface AttachmentRowProps {
  attachment: Attachment;
  onOpen(attachment: Attachment): void;
  onDownload(attachment: Attachment): void;
  onCopyLink(attachment: Attachment): void;
  onDelete?(attachment: Attachment): void;
  canDelete?: boolean;
  /**
   * Render the image itself in the row's icon slot instead of a generic kind
   * glyph. Every image becomes scannable at a glance — which is the job a
   * single large "first image" preview above the list was doing badly, since
   * it privileged one arbitrary file and duplicated its own row.
   */
  showThumbnail?: boolean;
  /**
   * Mark this row as the entry's card preview — the image that represents the
   * entry on cards elsewhere. The "set as card preview" action already exists
   * in the row menu, but nothing showed which attachment was currently chosen,
   * so the setting was invisible at the point you set it.
   */
  isCardPreview?: boolean;
}

export function AttachmentRow({
  attachment,
  onOpen,
  onDownload,
  onCopyLink,
  onDelete,
  canDelete = false,
  showThumbnail = false,
  isCardPreview = false,
}: AttachmentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isUrl = attachment.source_type === 'url';
  const kind = getAttachmentKind(attachment);
  const viewerKind = resolveViewerKind(attachment);
  const previewable = canViewInApp(attachment);
  const isBlocked = attachment.scan_status === 'blocked';
  const isPpt = viewerKind === 'pptx-preview';
  /* Reuses the same URL derivation the cards and gallery use, so a row
     thumbnail and the entry's card image can never disagree about what an
     attachment looks like. Blocked attachments keep the shield icon. */
  const thumbnailUrl =
    showThumbnail && !isBlocked ? attachmentImageDisplayUrl(attachment) : null;
  const IconComp = isUrl
    ? Link2
    : isPpt
    ? Presentation
    : KIND_ICON[kind] ?? File;
  const iconColor = isUrl
    ? 'var(--info-fg)'
    : KIND_ICON_COLOR[kind] ?? 'var(--text-muted)';

  // Inline metadata: prefer typed fields, fall back to extractor output.
  const common = attachment.metadata?.common ?? {};
  const pageCount =
    attachment.page_count ??
    (typeof common.page_count === 'number'
      ? (common.page_count as number)
      : null);
  const duration =
    typeof common.duration_seconds === 'number'
      ? (common.duration_seconds as number)
      : null;
  const dims =
    attachment.width && attachment.height
      ? `${attachment.width}×${attachment.height}`
      : '';

  // Compose one metadata line, rendered under the filename.
  // Order: format · size · pages · dims · duration.
  const metaParts: string[] = [];
  // Format first: with thumbnails in the icon slot an image row no longer
  // carries a type glyph at all, and a glyph could not tell PNG from WEBP
  // even when it was there.
  const formatLabel = attachmentFormatLabel(attachment);
  if (formatLabel) metaParts.push(formatLabel);
  if (!isUrl) {
    const sz = formatAttachmentSize(attachment.size);
    if (sz) metaParts.push(sz);
  }
  if (pageCount != null && pageCount > 0) {
    metaParts.push(`${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`);
  }
  if (dims) metaParts.push(dims);
  if (duration) metaParts.push(formatDuration(duration));
  if (isUrl) {
    try {
      const host = attachment.external_url
        ? new URL(attachment.external_url).host
        : '';
      if (host) metaParts.push(host);
    } catch {
      // Bad URL — skip the host chip.
    }
  }
  // Added time distinguishes retained files that share a filename.
  const addedAt = attachment.created_at ? new Date(attachment.created_at) : null;
  if (addedAt && Number.isFinite(addedAt.getTime())) {
    metaParts.push(`Added ${addedAt.toLocaleString()}`);
  }
  const metaLabel = metaParts.join(' · ');

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

  if (confirmingDelete) {
    return (
      <div className="group/row flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--danger-fg)]/30 bg-[var(--danger-fg)]/10 px-2 py-1.5">
        <ShieldAlert
          size={14}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--danger-fg)] shrink-0"
        />
        <span className="flex-1 truncate text-xs text-[var(--text)]">
          Delete <span className="font-medium">{attachment.filename}</span>?
          This cannot be undone.
        </span>
        <button
          type="button"
          onClick={() => setConfirmingDelete(false)}
          className="rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-0.5 text-[11px] text-[var(--text)] hover:bg-[var(--panel-2)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(false);
            onDelete?.(attachment);
          }}
          className="rounded-[var(--radius-input)] bg-[var(--danger-fg)] px-2 py-0.5 text-[11px] text-white hover:opacity-90"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group/row flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)]/40 px-2 py-1.5 transition-colors hover:bg-[var(--panel-2)] ${
        isBlocked ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={isBlocked}
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-[var(--panel-border)] bg-[var(--panel)]">
          {isBlocked ? (
            <ShieldAlert
              size={13}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--danger-fg)]"
            />
          ) : thumbnailUrl ? (
            /* The image in place of its own glyph. A blocked attachment keeps
               the shield — never render bytes we have refused to trust. */
            <AuthedImage
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <IconComp
              size={13}
              strokeWidth={LINE_ICON_STROKE}
              style={{ color: iconColor }}
            />
          )}
        </div>
        {/* Name over metadata, not name beside metadata. Sharing one line in
            a ~360px column meant one of them always lost: as a shrink-0 chip
            the metadata squeezed "chart.png" to "chart…", and letting it
            yield instead just moved the damage onto itself ("PNG · 2 K…").
            Stacked, both read whole. */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm text-[var(--text)]">
              {isBlocked
                ? `${attachment.filename || 'attachment'} (blocked)`
                : attachment.filename || 'Untitled'}
            </span>
            {isCardPreview && !isBlocked && (
              <span
                title="Shown on this entry's card"
                className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--badge-muted-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--badge-muted-fg)]"
              >
                Cover
              </span>
            )}
          </span>
          {metaLabel && (
            <span title={metaLabel} className="min-w-0 truncate text-[11px] tabular-nums text-[var(--text-muted)]">
              {metaLabel}
            </span>
          )}
        </span>
      </button>

      {!isBlocked && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          {previewable && !isUrl && (
            <button
              type="button"
              onClick={(e) => {
                stopProp(e);
                onOpen(attachment);
              }}
              className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
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
              className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
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
              className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
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
              className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-40 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow-pop)]"
                onClick={stopProp}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCopyLink(attachment);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)]"
                >
                  <Copy size={11} strokeWidth={LINE_ICON_STROKE} />
                  Copy link
                </button>
                {canDelete && onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmingDelete(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[var(--danger-fg)] hover:bg-[var(--panel-2)]"
                  >
                    <Trash2 size={11} strokeWidth={LINE_ICON_STROKE} />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
