import { Text } from '../../ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { attachmentsApi } from '../../api/attachments';
import { useScope } from '../../context/ScopeContext';
import type { Attachment } from '../../types';
import { AttachmentViewerModal } from './attachments/AttachmentViewerModal';

/** Resolve only typed file fields through the authenticated attachment API. */
export function FileValue({ value }: { value: unknown }) {
  const values = Array.isArray(value) ? value : [value];
  const ids = [...new Set(values.flatMap(item => {
    const id = typeof item === 'string' ? item : item && typeof item === 'object' && 'id' in item ? item.id : null;
    return typeof id === 'string' && id.trim() ? [id.trim()] : [];
  }))];
  return <div className="flex min-w-0 flex-col gap-1">{ids.length ? ids.map(id => <FileReference key={id} id={id} />) : <span>—</span>}</div>;
}

function FileReference({ id }: { id: string }) {
  const { scope } = useScope();
  const [open, setOpen] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const { data, isPending } = useQuery({
    queryKey: ['attachment', 'field-reference', scope?.workspaceId ?? '', id],
    queryFn: () => attachmentsApi.get(id),
    retry: false,
  });
  const attachment = data?.attachment;
  if (isPending) return <Text variant="body" tone="muted" as="span">Loading file…</Text>;
  if (!attachment || attachment.scan_status === 'blocked') return <Text variant="body" tone="muted" as="span">File unavailable</Text>;
  const download = async (file: Attachment) => {
    try {
      setDownloadError('');
      const { blob, contentType } = await attachmentsApi.fetchDownloadBlob(file.id);
      const url = URL.createObjectURL(contentType ? new Blob([blob], { type: contentType }) : blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setDownloadError('Could not download this file. Please try again.');
    }
  };
  return <>
    <button type="button" onClick={e => { e.stopPropagation(); setOpen(true); }} title={attachment.filename || 'Attached file'}
      className="inline-flex max-w-full items-center gap-1.5 text-left text-sm text-[var(--link)] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring-color)]">
      <Paperclip size={14} className="shrink-0" aria-hidden /><span className="min-w-0 truncate">{attachment.filename || 'Attached file'}</span>
    </button>
    {open && <AttachmentViewerModal attachment={attachment} allAttachments={[attachment]} onClose={() => { setOpen(false); setDownloadError(''); }} onDownload={file => { void download(file); }} />}
    {downloadError && <span role="alert" className="text-xs text-[var(--danger-fg)]">{downloadError}</span>}
  </>;
}
