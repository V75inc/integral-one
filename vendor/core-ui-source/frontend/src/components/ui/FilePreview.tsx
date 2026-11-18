import { useEffect, useMemo, type ReactNode } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from './Button';
import { Surface, Text } from '../../ui';

/**
 * A file shown in the page: a PDF in a frame, an image as itself, anything else as a download. The bytes come
 * from the caller (base64 or a URL), so it shows the document of any record, from any App. The preview is
 * made in the browser and released when it goes away; nothing is stored.
 */

export interface FilePreviewProps {
  title: string;
  /** The file's bytes, base64 encoded. */
  data?: string;
  url?: string;
  mime?: string;
  filename?: string;
  /** CSS height of the preview frame. */
  height?: string;
  emptyTitle?: ReactNode;
  emptyMessage?: ReactNode;
}

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function kindOf(mime: string, filename: string): 'pdf' | 'image' | 'other' {
  const type = (mime || '').toLowerCase();
  const name = (filename || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/u.test(name)) return 'image';
  return 'other';
}

export function FilePreview({ title, data, url, mime, filename, height = '78vh', emptyTitle, emptyMessage }: FilePreviewProps) {
  const kind = kindOf(mime || '', filename || '');
  const type = mime || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream');
  const made = useMemo(() => {
    if (url || !data) return '';
    try { return URL.createObjectURL(new Blob([bytesOf(data)], { type })); } catch { return ''; }
  }, [data, url, type]);
  useEffect(() => () => { if (made) URL.revokeObjectURL(made); }, [made]);
  const src = url || made;

  if (!src) {
    return (
      <Surface tone="panel-2" radius="input" padding="md">
        <Text as="p" variant="body-sm" weight="semibold">{emptyTitle ?? 'Nothing to show yet'}</Text>
        {emptyMessage ? <Text as="p" variant="body-sm" tone="muted">{emptyMessage}</Text> : null}
      </Surface>
    );
  }
  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename || title;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" icon={<Download size={14} aria-hidden />} onClick={download}>Download</Button>
        <Button variant="ghost" size="sm" icon={<ExternalLink size={14} aria-hidden />} onClick={() => window.open(src, '_blank', 'noopener')}>Open in a new tab</Button>
      </div>
      {kind === 'pdf' ? (
        <iframe title={title} src={src} style={{ width: '100%', height, border: 0, borderRadius: 'var(--radius-input)' }} />
      ) : kind === 'image' ? (
        <img src={src} alt={title} style={{ maxWidth: '100%', maxHeight: height, borderRadius: 'var(--radius-input)' }} />
      ) : (
        <Surface tone="panel-2" radius="input" padding="md">
          <Text as="p" variant="body-sm" tone="muted">This kind of file can't be shown here. Use Download to open it.</Text>
        </Surface>
      )}
    </div>
  );
}
