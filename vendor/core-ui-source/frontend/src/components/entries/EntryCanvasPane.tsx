import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SpreadsheetEditor } from './SpreadsheetEditor';
import { isSpreadsheetName } from '../../utils/spreadsheetFile';

/**
 * Should an entry with a file open on the file preview instead of the text editor?
 * Yes when a file exists and either the file is the master copy (``edit_source`` is ``file``)
 * or the entry has no text body to edit (a generated payslip, an uploaded PDF).
 */
export function prefersFilePreview(entry: Entry, hasFile: boolean): boolean {
  if (!hasFile) return false;
  const fields = (entry.custom_fields || {}) as Record<string, unknown>;
  if (String(fields.edit_source || '').toLowerCase() === 'file') return true;
  return !String(entry.body || '').trim();
}

/** "6 Nov 2026, 16:15": one readable date and time, the same in every locale. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

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
  onFileSaved,
}: {
  entry: Entry;
  attachments: Attachment[];
  fileField?: string;
  /** Show the document editor tab (entry type ``canvas.editor``). */
  editable?: boolean;
  canEdit?: boolean;
  onBodySaved?(entry: Entry): void;
  /** A file was edited in the app and saved as a new version. */
  onFileSaved?(entry: Entry, file: Attachment): void;
}) {
  const { showToast } = useToast();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'document' | 'file'>(editable ? 'document' : 'file');
  // Until the person picks a tab themselves, open on what they came for: the file when the
  // file is the master copy or there is no text to edit, the text editor otherwise.
  const pickedTab = useRef(false);
  const choose = (next: 'document' | 'file') => {
    pickedTab.current = true;
    setTab(next);
  };

  const files = useMemo(
    () =>
      attachments
        .filter(a => a.source_type !== 'url')
        .slice()
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [attachments]
  );

  const preferFile = prefersFilePreview(entry, files.length > 0);
  useEffect(() => {
    if (editable && !pickedTab.current) setTab(preferFile ? 'file' : 'document');
  }, [editable, preferFile]);

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
                  {a.created_at ? ` (${formatVersionDate(a.created_at)})` : ''}
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

  // A file document (the file is the master, or there is no text) has nothing to
  // write: no text tab, except a spreadsheet, whose tab is its grid editor.
  const hasText = !!String(entry.body || '').trim();
  const spreadsheet =
    !!current && isSpreadsheetName(current.filename || '', current.mime_type || '');
  const fileDocument = preferFile && !hasText;
  const tabs: ReadonlyArray<'file' | 'document'> = fileDocument
    ? spreadsheet
      ? ['file', 'document']
      : ['file']
    : preferFile
      ? ['file', 'document']
      : ['document', 'file'];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const tabLabel = (key: 'file' | 'document') =>
    key === 'file' ? 'Preview' : fileDocument ? 'Edit' : 'Edit text';
  // Only a document built from its text can fall behind its file. The file is out
  // of date when the text changed after the file was made (a render updates the
  // entry a moment after attaching, so allow for that). Metadata updates on a file
  // document (filing details, status) never make its file stale.
  const stale =
    !preferFile &&
    hasText &&
    !!current?.created_at &&
    !!entry.updated_at &&
    Date.parse(entry.updated_at) - Date.parse(current.created_at) > 10000;

  return (
    <Surface className="flex h-full min-h-[420px] flex-col overflow-hidden">
      <div role="tablist" className="flex items-center border-b border-[var(--panel-border)] px-1">
        {tabs.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`border-b-2 px-3 py-1.5 ${activeTab === key ? 'border-[var(--brand-accent)]' : 'border-transparent'}`}
            onClick={() => choose(key)}
          >
            <Text as="span" variant="body-sm" tone={activeTab === key ? 'default' : 'muted'} weight="medium">
              {tabLabel(key)}
              {key === 'file' && files.length > 1 ? ` (${files.length})` : ''}
            </Text>
          </button>
        ))}
        {activeTab === 'file' && stale ? (
          <span
            data-testid="entry-canvas-stale"
            className="ml-auto pr-3"
          >
            <Text as="span" variant="body-sm" tone="muted">Edited since this file was made. Press Render file.</Text>
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === 'document' && preferFile && !String(entry.body || '').trim() && current && isSpreadsheetName(current.filename || '', current.mime_type || '') ? (
          <SpreadsheetEditor key={current.id} entry={entry} attachment={current} canEdit={canEdit} onSaved={(e, f) => onFileSaved?.(e, f)} />
        ) : activeTab === 'document' && preferFile && !String(entry.body || '').trim() ? (
          <div data-testid="entry-canvas-no-text" className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Text as="div" variant="body" weight="medium">There is no text to edit</Text>
            <Text as="div" variant="body-sm" tone="muted" className="max-w-md">
              This document is a file ({current?.filename || 'attached file'}), not written text.
              Download it to change it, or switch "Edited in" to Text to write it here instead.
            </Text>
            {current ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => void download(current)}>
                <Download size={12} strokeWidth={LINE_ICON_STROKE} /> Download file
              </Button>
            ) : null}
          </div>
        ) : activeTab === 'document' ? (
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
