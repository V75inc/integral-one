import { useState } from 'react';
import { AuthedImage } from '../ui';
import { Surface, Text } from '../../ui';
import { attachmentImageDisplayUrl } from '../../utils/entryMedia';
import { attachmentsApi } from '../../api/attachments';
import { useToast } from '../../context/ToastContext';
import { AttachmentViewerModal } from './attachments/AttachmentViewerModal';
import type { Attachment } from '../../types';

interface GalleryProps {
  attachments: Attachment[];
  onOpen: (attachment: Attachment) => void;
  primaryId?: string;
}

/** Stable across list/detail endpoints, whose returned orders may differ. */
export function orderGalleryAttachments(attachments: Attachment[], primaryId?: string): Attachment[] {
  const ordered = [...attachments].sort((left, right) =>
    String(left.created_at || '').localeCompare(String(right.created_at || '')) || left.id.localeCompare(right.id));
  if (!primaryId) return ordered;
  return [...ordered.filter(a => a.id === primaryId), ...ordered.filter(a => a.id !== primaryId)];
}

/** Compact shared mosaic; tiles crop proportionally and the viewer shows originals. */
export function AttachmentGallery({ attachments, onOpen, primaryId }: GalleryProps) {
  const images = orderGalleryAttachments(attachments.filter(a => attachmentImageDisplayUrl(a)), primaryId);
  if (!images.length) return null;
  const visible = images.slice(0, 4);
  const layout = visible.length === 1 ? 'flex justify-center' : `grid grid-cols-2 ${visible.length > 2 ? 'grid-rows-2' : 'grid-rows-1'} aspect-[16/9] max-h-96 gap-1`;
  return <Surface tone="panel-2" padding="none" className={layout} aria-label="Image attachments">
    {visible.map((image, index) => <button type="button" key={image.id}
      aria-label={`Open image ${index + 1} of ${images.length}: ${image.filename || 'Attachment'}`}
      className={`relative flex items-center justify-center min-w-0 min-h-0 overflow-hidden ${visible.length === 1 ? 'w-full' : ''} ${visible.length === 3 && index === 0 ? 'row-span-2' : ''}`}
      onClick={e => { e.stopPropagation(); onOpen(image); }}>
      <AuthedImage src={attachmentImageDisplayUrl(image)!} alt={image.filename || 'Image attachment'} loading="lazy"
        className={visible.length === 1 ? 'block h-auto w-auto max-h-96 max-w-full object-contain' : 'block h-full w-full object-cover'} />
      {index === 3 && images.length > 4 && <Surface tone="panel" padding="sm" className="absolute bottom-0 right-0"><Text variant="body" weight="semibold">+{images.length - 4}</Text></Surface>}
    </button>)}
  </Surface>;
}

/** Detail uses the same inline mosaic; full resolution stays in the viewer. */
export function EntryInlineImageGallery({ attachments, primaryId }: Omit<GalleryProps, 'onOpen'>) {
  const { showToast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const images = orderGalleryAttachments(attachments.filter(a => attachmentImageDisplayUrl(a)), primaryId);
  const open = images.find(a => a.id === openId);
  const advance = (delta: number) => {
    const index = images.findIndex(a => a.id === openId);
    if (index >= 0) setOpenId(images[(index + delta + images.length) % images.length].id);
  };
  const download = async (attachment: Attachment) => {
    try {
      const { blob, contentType } = await attachmentsApi.fetchDownloadBlob(attachment.id);
      const url = URL.createObjectURL(contentType ? new Blob([blob], { type: contentType }) : blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { showToast('This image could not be downloaded. Try again or check its availability.', 'error'); }
  };
  return <>
    <AttachmentGallery attachments={attachments} primaryId={primaryId} onOpen={attachment => {
      if (attachment.source_type === 'url' && attachment.external_url) window.open(attachment.external_url, '_blank', 'noopener,noreferrer');
      else setOpenId(attachment.id);
    }} />
    {open && <AttachmentViewerModal attachment={open} allAttachments={images} onClose={() => setOpenId(null)}
      onPrev={images.length > 1 ? () => advance(-1) : undefined} onNext={images.length > 1 ? () => advance(1) : undefined} onDownload={attachment => void download(attachment)} />}
  </>;
}
