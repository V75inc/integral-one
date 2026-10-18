import { useCallback, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { attachmentsApi } from '../../api/attachments';
import { useToast } from '../../context/ToastContext';
import type { Attachment, Entry } from '../../types';
import { formatAttachmentSize } from '../../utils/attachmentMime';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import { AttachmentPane } from './attachments/AttachmentPane';
import { EntryDocumentEditor } from './EntryDocumentEditor';

/** The attachment id(s) a file field holds, whatever shape the value has. */
function fileFieldIds(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(fileFieldIds);
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown; attachment_id?: unknown });
    return fileFieldIds(id.id ?? id.attachment_id);
  }
  return [];
}

/**
 * The file beside an entry (the entry "canvas").
 *
 * Shows the attachment the entry's file field points at, or the newest file
 * when the field is empty, with the same viewers the attachment dialog uses.
 * Older files stay selectable, so a re-render does not lose the earlier one.
 * The parent refetches the entry and its attachments; this pane only renders.
 */
export function EntryCanvasPane({
  entry,
  attachments,
  fileField,
  editable = false,
  canEdit = false,
  onBodySaved,
}: {
  entry: Entry;
  attachments: Attachment[];
  fileField?: string;
  /** Show the document editor tab (entry type ``canvas.editor``). */
  editable?: boolean;
  canEdit?: boolean;
  onBodySaved?(entry: Entry): void;
}) {
  const { showToast } = useToast();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'document' | 'file'>(editable ? 'document' : 'file');

  const files = useMemo(
    () =>
      attachments
        .filter(a => a.source_type !== 'url')
        .slice()
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [attachments]
  );

  const current = useMemo(() => {
    const picked = pickedId ? files.find(a => a.id === pickedId) : undefined;
    if (picked) return picked;
    const fieldValue = fileField
      ? (entry.custom_fields as Record<string, unknown> | undefined)?.[fileField]
      : undefined;
    for (const id of fileFieldIds(fieldValue)) {
      const hit = files.find(a => a.id === id);
      if (hit) return hit;
    }
    return files[0];
  }, [pickedId, files, fileField, entry.custom_fields]);

  const download = useCallback(
    async (attachment: Attachment) => {
      try {
        const { blob, contentType } = await attachmentsApi.fetchDownloadBlob(
          attachment.id
        );
        const url = URL.createObjectURL(
          contentType ? new Blob([blob], { type: contentType }) : blob
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.filename || 'file';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Download failed', 'error');
      }
    },
    [showToast]
  );

  const fileView = !current ? (
      <Surface
        data-testid="entry-canvas-empty"
        tone="panel"
        border="default"
        borderStyle="dashed"
        className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <Text as="span" variant="meta" tone="muted">
          <FileText
          size={32}
          strokeWidth={LINE_ICON_STROKE}
          />
        </Text>
        <Text as="div" variant="body" weight="medium">No file yet</Text>
        <Text as="div" variant="body-sm" tone="muted">
          The file shows here once it is created. Use the buttons on this page,
          or ask the assistant.
        </Text>
      </Surface>
    ) : (
    <Surface
      data-testid="entry-canvas"
      className="flex h-full min-h-[420px] flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-3 py-2 text-xs">
        <div className="min-w-0">
          {files.length > 1 ? (
            <select
              aria-label="File version"
              value={current.id}
              onChange={e => setPickedId(e.target.value)}
              className="app-input max-w-full truncate"
            >
              {files.map((a, i) => (
                <option key={a.id} value={a.id}>
                  {i === 0 ? 'Latest: ' : ''}
                  {a.filename || 'file'}
                  {a.created_at ? ` (${new Date(a.created_at).toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <Text as="span" variant="body-sm" weight="medium" truncate>
              {current.filename || 'file'}
            </Text>
          )}
          {formatAttachmentSize(current.size) ? (
            <Text as="span" variant="body-sm" tone="muted" className="ml-2">
              {formatAttachmentSize(current.size)}
            </Text>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void download(current)}
          className="shrink-0"
        >
          <Download size={12} strokeWidth={LINE_ICON_STROKE} />
          Download
        </Button>
      </div>
      <Surface
        as="div"
        tone="panel-2"
        border="none"
        radius="none"
        backgroundOpacity={30}
        className="relative min-h-0 flex-1 overflow-auto"
      >
        <AttachmentPane key={current.id} attachment={current} onDownload={download} />
      </Surface>
    </Surface>
    );

  if (!editable) return fileView;

  // The file is out of date when the entry changed after it was made (a render
  // updates the entry a moment after attaching, so allow for that).
  const stale =
    !!current?.created_at &&
    !!entry.updated_at &&
    Date.parse(entry.updated_at) - Date.parse(current.created_at) > 10000;

  return (
    <Surface className="flex h-full min-h-[420px] flex-col overflow-hidden">
      <div role="tablist" className="flex items-center border-b border-[var(--panel-border)] px-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'document'}
          className={`border-b-2 px-3 py-1.5 ${tab === 'document' ? 'border-[var(--brand-accent)]' : 'border-transparent'}`}
          onClick={() => setTab('document')}
        >
          <Text as="span" variant="body-sm" tone={tab === 'document' ? 'default' : 'muted'} weight="medium">Document</Text>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'file'}
          className={`border-b-2 px-3 py-1.5 ${tab === 'file' ? 'border-[var(--brand-accent)]' : 'border-transparent'}`}
          onClick={() => setTab('file')}
        >
          <Text as="span" variant="body-sm" tone={tab === 'file' ? 'default' : 'muted'} weight="medium">File{files.length ? ` (${files.length})` : ''}</Text>
        </button>
        {tab === 'file' && stale ? (
          <span
            data-testid="entry-canvas-stale"
            className="ml-auto pr-3"
          >
            <Text as="span" variant="body-sm" tone="muted">Edited since this file was made. Press Render file.</Text>
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'document' ? (
          <EntryDocumentEditor
            entry={entry}
            canEdit={canEdit}
            onSaved={updated => onBodySaved?.(updated)}
          />
        ) : (
          <div className="h-full p-0">{fileView}</div>
        )}
      </div>
    </Surface>
  );
}
