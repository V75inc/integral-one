import type { Attachment } from '../types';

export type AttachmentKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'sheet'
  | 'archive'
  | 'other';

type AttachmentMimeInput = {
  mime_type?: Attachment['mime_type'];
  filename?: Attachment['filename'];
};

const EXT_MIME_MAP: Record<string, string> = {
  csv: 'text/csv',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

function mimeFromFilename(filename?: string): string {
  const name = String(filename || '').trim().toLowerCase();
  if (!name.includes('.')) return '';
  const ext = name.split('.').pop() || '';
  return EXT_MIME_MAP[ext] || '';
}

export function resolveAttachmentMime(attachment: AttachmentMimeInput): string {
  return String(attachment.mime_type || '').trim().toLowerCase() || mimeFromFilename(attachment.filename);
}

export function attachmentKindFromMime(mimeType: string): AttachmentKind {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'
  ) {
    return 'text';
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return 'sheet';
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar')
  ) {
    return 'archive';
  }
  return 'other';
}

export function getAttachmentKind(attachment: AttachmentMimeInput): AttachmentKind {
  return attachmentKindFromMime(resolveAttachmentMime(attachment));
}

export function isImageAttachment(attachment: AttachmentMimeInput): boolean {
  return getAttachmentKind(attachment) === 'image';
}

export function shouldOpenAttachmentInNewTab(
  attachment: AttachmentMimeInput
): boolean {
  const kind = getAttachmentKind(attachment);
  return kind === 'pdf' || kind === 'video' || kind === 'audio';
}

export function formatAttachmentSize(size?: number): string {
  if (typeof size !== 'number' || size <= 0) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}


/**
 * Short uppercase format token for a row chip — ``PNG``, ``PDF``, ``XLSX``,
 * ``LINK``.
 *
 * The kind icon answers "what family is this" (image / sheet / video), and a
 * thumbnail answers "what does it look like", but neither distinguishes a PNG
 * from a WEBP or a DOC from a DOCX — which is what you need before
 * downloading something or handing it to another tool.
 *
 * Filename extension wins when there is one: it is what the user named the
 * file and what their OS will open it as. Mime is the fallback, since an
 * upload can arrive without an extension.
 */
export function attachmentFormatLabel(
  attachment: AttachmentMimeInput & {
    filename?: string;
    source_type?: string;
  }
): string {
  if (attachment.source_type === 'url') return 'LINK';

  const name = String(attachment.filename || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot + 1);
    // Guard against "report.final version" being read as a format.
    if (/^[a-z0-9]{1,5}$/i.test(ext)) return ext.toUpperCase();
  }

  const mime = resolveAttachmentMime(attachment);
  const subtype = mime.split("/")[1] || "";
  if (!subtype) return "";
  // application/vnd.openxmlformats-officedocument.spreadsheetml.sheet → XLSX
  const OFFICE: Record<string, string> = {
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "vnd.ms-excel": "XLS",
    "msword": "DOC",
    "vnd.ms-powerpoint": "PPT",
  };
  if (OFFICE[subtype]) return OFFICE[subtype];
  // "svg+xml" → SVG; drop any parameters and vendor prefixes.
  const base = subtype.split("+")[0].split(";")[0].replace(/^x-/, "");
  if (!/^[a-z0-9.-]{1,12}$/i.test(base)) return "";
  return base.toUpperCase();
}
