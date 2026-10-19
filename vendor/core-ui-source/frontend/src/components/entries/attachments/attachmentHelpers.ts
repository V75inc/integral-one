/**
 * Shared helpers for the Plan 03 attachment grid + viewer.
 *
 * Keeping the type-discriminator and the "what renderer should I open"
 * logic in one file so the grid tile and the viewer modal agree on
 * what each MIME type means.
 */

import type { Attachment } from '../../../types';
import type { AttachmentKind } from '../../../utils/attachmentMime';
import {
  attachmentKindFromMime,
  resolveAttachmentMime,
} from '../../../utils/attachmentMime';

// Formats with no in-browser renderer that the server converts to a PDF
// preview (LibreOffice). Keep in step with attachment_preview.py.
const SERVER_PREVIEW_MIMES = new Set([
  'application/msword',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.graphics',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-word.document.macroenabled.12',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
  'application/vnd.ms-visio.drawing',
  'application/vnd.visio',
  'application/vnd.ms-publisher',
]);

export type ViewerKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'docx'
  | 'xlsx'
  | 'pptx-preview'
  | 'audio'
  | 'video'
  | 'unsupported';

/**
 * Map a MIME type to the renderer the viewer modal should mount. The
 * mapping is conservative — anything we're not sure we can render
 * faithfully in-app falls through to ``unsupported`` (download-only).
 */
export function resolveViewerKind(attachment: Attachment): ViewerKind {
  if (attachment.source_type === 'url') return 'unsupported';
  const mime = resolveAttachmentMime(attachment);
  const kind: AttachmentKind = attachmentKindFromMime(mime);

  if (kind === 'image') return 'image';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'audio') return 'audio';
  if (kind === 'video') return 'video';

  // Office docs — client-side render where possible, server-rendered
  // PDF preview for pptx (the backend converts via LibreOffice).
  if (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (kind === 'sheet') return 'xlsx';
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint' ||
    SERVER_PREVIEW_MIMES.has(mime)
  ) {
    return 'pptx-preview';
  }

  if (kind === 'text') return 'text';
  return 'unsupported';
}

export function canViewInApp(attachment: Attachment): boolean {
  return resolveViewerKind(attachment) !== 'unsupported';
}

/** Truncate a hex hash for compact display. */
export function shortHash(hash?: string, head = 6, tail = 4): string {
  if (!hash || hash.length <= head + tail + 1) return hash ?? '';
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** Format a duration in seconds as "M:SS" or "H:MM:SS". */
export function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0) {
    return '';
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Resolve the best display URL for a tile thumbnail.
 *
 * Order of preference:
 *   1. Server-generated thumbnail (image/* attachments — fast).
 *   2. The original image (when it's small enough to render inline).
 *   3. null — caller falls back to an icon tile.
 */
export function thumbnailSrc(attachment: Attachment): string | null {
  if (attachment.scan_status === 'blocked') return null;
  if (attachment.thumb_url) return attachment.thumb_url;
  // For images without a generated thumb we can render the original.
  if (attachment.source_type === 'file') {
    const kind = attachmentKindFromMime(resolveAttachmentMime(attachment));
    if (kind === 'image' && attachment.download_url) {
      return attachment.download_url;
    }
  }
  return null;
}
