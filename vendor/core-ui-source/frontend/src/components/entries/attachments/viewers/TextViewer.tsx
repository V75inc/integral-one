import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Attachment } from '../../../../types';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';
import { resolveAttachmentMime } from '../../../../utils/attachmentMime';
import { parseCsv } from '../../../../utils/csvParse';

/**
 * Renders text/markdown/json/csv attachments.
 *
 * Markdown gets the GFM-flavoured react-markdown treatment (already a
 * dependency for body rendering). JSON is pretty-printed. CSV and
 * generic text render as a monospaced block. Anything larger than 2 MB
 * is truncated client-side with a hint — the search index already has
 * the full body server-side.
 */

const MAX_INLINE_BYTES = 2 * 1024 * 1024;

export function TextViewer({ attachment }: { attachment: Attachment }) {
  const { blob, loading, error } = useAttachmentBlob(attachment.id);
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setTruncated(false);
    setReadError(null);
    if (!blob) return;
    const slice =
      blob.size > MAX_INLINE_BYTES ? blob.slice(0, MAX_INLINE_BYTES) : blob;
    slice
      .text()
      .then((t) => {
        setText(t);
        setTruncated(blob.size > MAX_INLINE_BYTES);
      })
      .catch((e: unknown) => {
        setReadError(e instanceof Error ? e.message : 'Could not decode text');
      });
  }, [blob]);

  if (loading) return <ViewerStatus state="loading" />;
  if (error) return <ViewerStatus state="error" message={error} />;
  if (readError) return <ViewerStatus state="error" message={readError} />;
  if (text == null) return <ViewerStatus state="loading" />;

  const mime = resolveAttachmentMime(attachment);
  const isMarkdown = mime === 'text/markdown' || mime === 'text/x-markdown';
  const isJson = mime === 'application/json';
  const isCsv = mime === 'text/csv';

  let body: React.ReactNode;
  if (isMarkdown) {
    body = (
      <article className="prose prose-sm max-w-none px-6 py-4 text-[var(--text)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </article>
    );
  } else if (isCsv) {
    const rows = parseCsv(text);
    const [head, ...rest] = rows;
    body = !head ? (
      <div className="px-4 py-3 text-xs text-[var(--text-muted)]">This file is empty.</div>
    ) : (
      <table className="w-max min-w-full border-collapse text-xs text-[var(--text)]">
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i} className="sticky top-0 whitespace-nowrap border-b border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-left font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rest.map((r, ri) => (
            <tr key={ri} className="even:bg-[var(--panel-2)]/50">
              {head.map((_, ci) => (
                <td key={ci} className="whitespace-nowrap border-b border-[var(--panel-border)] px-3 py-1.5">{r[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (isJson) {
    let formatted = text;
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Leave the raw text as-is if it's not parseable.
    }
    body = (
      <pre className="px-4 py-3 text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap break-all">
        {formatted}
      </pre>
    );
  } else {
    body = (
      <pre className="px-4 py-3 text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">
        {text}
      </pre>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--panel)]">
      {body}
      {truncated && (
        <div className="border-t border-[var(--panel-border)] bg-[var(--panel-2)]/40 px-4 py-2 text-[11px] text-[var(--text-muted)]">
          Truncated at {Math.round(MAX_INLINE_BYTES / 1024 / 1024)} MB.
          Download the file to view the rest.
        </div>
      )}
    </div>
  );
}
