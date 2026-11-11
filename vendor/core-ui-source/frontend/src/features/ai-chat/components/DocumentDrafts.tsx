import { useState } from 'react';
import { aiChatApi } from '../../../api/aiChat';
import { MarkdownContent } from '../../../components/ui/MarkdownContent';
import { Text } from '../../../ui';
import { coerceToolResult } from '../staging/StagedChangeToolUI';

type ToolishPart = { type?: string; result?: unknown; isError?: boolean };
type DraftFormat = 'markdown' | 'docx' | 'pdf' | 'pptx';
export type DocumentDraft = { threadId: string; key: string; version: number; title: string; format: DraftFormat };

/** Only server-shaped draft results become download controls. */
export function extractDocumentDrafts(
  content?: ReadonlyArray<ToolishPart>, parts?: ReadonlyArray<ToolishPart>,
): DocumentDraft[] {
  const found: DocumentDraft[] = [];
  const seen = new Set<string>();
  for (const part of [...(content ?? []), ...(parts ?? [])]) {
    if (part.type !== 'tool-call' || part.isError) continue;
    const envelope = coerceToolResult(part.result);
    const summary = envelope?.publicSummary;
    const result = summary && typeof summary === 'object' && 'document_draft' in summary
      ? summary.document_draft as Record<string, unknown> : undefined;
    if (!result ||
        typeof result.thread_id !== 'string' || !result.thread_id.startsWith('n.ChatThread.') ||
        typeof result.key !== 'string' || !result.key || result.key.length > 128 ||
        typeof result.version !== 'number' || !Number.isSafeInteger(result.version) || result.version < 1 ||
        typeof result.format !== 'string' || !['markdown', 'docx', 'pdf', 'pptx'].includes(result.format)) continue;
    const id = `${result.thread_id}\0${result.key}\0${result.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    found.push({ threadId: result.thread_id, key: result.key, version: result.version,
      title: typeof result.title === 'string' && result.title.trim() ? result.title : 'Document',
      format: result.format as DraftFormat });
  }
  return found;
}

export function DocumentDraftCard({ draft }: { draft: DocumentDraft }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const togglePreview = async () => {
    if (preview) { setPreview(null); return; }
    setLoadingPreview(true);
    setError('');
    try {
      const data = await aiChatApi.previewDocumentDraft(draft.threadId, draft.key, draft.version);
      setPreview({ title: data.title, body: data.body });
    } catch {
      setError('Could not open this draft. It may have changed or you may no longer have access.');
    } finally { setLoadingPreview(false); }
  };
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const { blob, filename } = await aiChatApi.downloadDocumentDraft(draft.threadId, draft.key, draft.version);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Control characters are intentionally excluded from download filenames.
      // eslint-disable-next-line no-control-regex
      const base = draft.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) || 'Document';
      link.download = filename ?? `${base}.${draft.format === 'markdown' ? 'md' : draft.format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download this draft. It may have changed or you may no longer have access.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="my-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-3">
    <Text as="p" variant="body-sm" weight="medium">{draft.title}</Text>
    <Text as="p" variant="meta" tone="muted">Private conversation draft · {draft.format.toUpperCase()} · Version {draft.version}</Text>
    <button type="button" onClick={() => void togglePreview()} disabled={loadingPreview} aria-expanded={Boolean(preview)} className="mt-2 mr-4 text-sm underline disabled:opacity-50">
      {loadingPreview ? 'Opening…' : preview ? 'Close preview' : 'Preview draft'}
    </button>
    <button type="button" onClick={() => void download()} disabled={busy} className="mt-2 text-sm underline disabled:opacity-50">
      {busy ? 'Preparing…' : 'Download draft'}
    </button>
    {preview ? <section aria-label="Draft preview" className="mt-3 max-h-96 overflow-auto border-t border-[var(--border-subtle)] pt-3">
      <Text as="p" variant="meta" tone="muted">Text preview · File layout may differ</Text>
      {preview.title && preview.body.trimStart().split('\n', 1)[0].replace(/^#\s+/, '').trim() !== preview.title.trim()
        ? <Text as="p" variant="body-sm" weight="medium">{preview.title}</Text> : null}
      <MarkdownContent mutedBody={false}>{preview.body}</MarkdownContent>
    </section> : null}
    {error ? <div role="alert"><Text as="p" variant="body-sm" tone="danger">{error}</Text></div> : null}
  </div>;
}
