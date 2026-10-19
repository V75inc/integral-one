import type { Attachment } from '../types';
import { isImageAttachment } from './attachmentMime';

const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i;

/** Internal custom_fields slot for the gallery/card hero attachment. */
export const CARD_PREVIEW_ATTACHMENT_FIELD = '_card_preview_attachment_id';

export interface EntryImageSource {
  url: string;
  attachmentId?: string;
  needsAuth: boolean;
}

/** Whether a display URL must be fetched via apiClient (Bearer auth). */
export function urlNeedsAuthFetch(url: string): boolean {
  return url.startsWith('/api/');
}

/** Best display URL for a single attachment (URL link or uploaded file image). */
export function attachmentImageDisplayUrl(attachment: Attachment): string | null {
  if (attachment.scan_status === 'blocked') return null;

  if (attachment.source_type === 'url' && attachment.external_url) {
    const url = attachment.external_url.trim();
    if (!url) return null;
    if (IMAGE_URL_RE.test(url)) return url;
    if (attachment.mime_type?.startsWith('image/')) return url;
    return null;
  }

  const isUploadedFile =
    attachment.source_type === 'file' ||
    Boolean(attachment.storage_key) ||
    (attachment.source_type !== 'url' && !attachment.external_url);

  if (isUploadedFile && isImageAttachment(attachment)) {
    if (attachment.thumb_url) return attachment.thumb_url;
    if (attachment.download_url) return attachment.download_url;
    if (attachment.thumb_storage_key && attachment.id) {
      return `/api/attachments/${attachment.id}/thumb`;
    }
    if (attachment.id) {
      return `/api/attachments/${attachment.id}/download`;
    }
  }

  return null;
}

/** Resolve attachment id whose display URL matches ``url``. */
export function attachmentIdForDisplayUrl(
  attachments: Attachment[] | null | undefined,
  url: string
): string | null {
  if (!attachments?.length || !url) return null;
  for (const att of attachments) {
    const displayUrl = attachmentImageDisplayUrl(att);
    if (displayUrl && displayUrl === url) return att.id;
  }
  return null;
}

function entryImageSourceFromAttachment(att: Attachment): EntryImageSource | null {
  const url = attachmentImageDisplayUrl(att);
  if (!url) return null;
  return {
    url,
    attachmentId: att.id,
    needsAuth: urlNeedsAuthFetch(url),
  };
}

/** Preferred card/gallery hero image — honors ``_card_preview_attachment_id`` when set. */
export function firstImageAttachmentFromAttachments(
  attachments?: Attachment[] | null,
  customFields?: Record<string, unknown> | null
): EntryImageSource | null {
  if (!attachments?.length) return null;

  const preferredId = customFields?.[CARD_PREVIEW_ATTACHMENT_FIELD];
  if (typeof preferredId === 'string' && preferredId.trim()) {
    const preferred = attachments.find(a => a.id === preferredId.trim());
    const fromPreferred = preferred ? entryImageSourceFromAttachment(preferred) : null;
    if (fromPreferred) return fromPreferred;
  }

  for (const att of attachments) {
    const source = entryImageSourceFromAttachment(att);
    if (source) return source;
  }
  return null;
}

/** First image-suitable URL from entry attachments (for cards / gallery). */
export function firstImageUrlFromAttachments(
  attachments?: Attachment[] | null,
  customFields?: Record<string, unknown> | null
): string | null {
  return firstImageAttachmentFromAttachments(attachments, customFields)?.url ?? null;
}

/** All image-suitable attachments on an entry, in attachment order. */
export function allImageAttachmentsFromAttachments(
  attachments?: Attachment[] | null
): EntryImageSource[] {
  if (!attachments?.length) return [];
  const results: EntryImageSource[] = [];
  for (const att of attachments) {
    const source = entryImageSourceFromAttachment(att);
    if (source) results.push(source);
  }
  return results;
}
