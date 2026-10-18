import { useEffect, useState } from 'react';

import type { Attachment } from '../../../../types';
import { sanitizeHtml } from '../../../../utils/sanitizeHtml';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';

/**
 * docx → HTML renderer using mammoth.js.
 *
 * mammoth strips advanced Word-specific layout in favour of clean
 * semantic HTML; that's the right trade-off for an in-app preview
 * (users who need pixel-perfect fidelity can download the file).
 * The library is dynamically imported so we only pay the bundle cost
 * when a docx is actually opened.
 */
export function DocxViewer({ attachment }: { attachment: Attachment }) {
  const { blob, loading, error } = useAttachmentBlob(attachment.id);
  const [html, setHtml] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setConvertError(null);
    if (!blob) return;

    (async () => {
      try {
        const mammoth = await import('mammoth');
        const buf = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer: buf },
          // Keep the output minimal; the surrounding modal supplies
          // padding + typography styles.
          { styleMap: ["p[style-name='Heading 1'] => h1"] }
        );
        if (!cancelled) setHtml(result.value);
      } catch (e) {
        if (!cancelled) {
          setConvertError(
            e instanceof Error ? e.message : 'docx conversion failed'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (loading) return <ViewerStatus state="loading" />;
  if (error) return <ViewerStatus state="error" message={error} />;
  if (convertError)
    return <ViewerStatus state="error" message={convertError} />;
  if (html == null) return <ViewerStatus state="loading" />;

  return (
    <div className="h-full overflow-auto bg-[var(--panel)]">
      <article
        className="prose prose-sm mx-auto max-w-3xl px-6 py-6 text-[var(--text)]"
        // mammoth output is constructed from trusted user content but
        // limited to a small whitelist of HTML; safer than ReactMarkdown
        // for arbitrary docx because mammoth doesn't preserve raw script.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    </div>
  );
}
