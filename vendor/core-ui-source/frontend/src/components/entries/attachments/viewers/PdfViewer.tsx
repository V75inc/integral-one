import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import type { Attachment } from '../../../../types';
import { getPdfjs } from '../../../../lib/pdfjsLoader';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';
import { LINE_ICON_STROKE } from '../../../ui/IconWell';

/**
 * PDF.js-backed viewer (worker bundled via Vite — see ``lib/pdfjsLoader``).
 *
 * ``source="preview"`` switches the data feed to the server-rendered
 * preview PDF (LibreOffice output cached at a sibling key). PPTX
 * uses that path; everything else uses ``"download"``.
 */

interface PdfViewerProps {
  attachment: Attachment;
  source?: 'download' | 'preview';
  /** Shown instead of the error when the PDF cannot be loaded or drawn. */
  fallback?: ReactNode;
}

type PdfDocument = Awaited<
  ReturnType<Awaited<ReturnType<typeof getPdfjs>>['getDocument']>['promise']
>;

export function PdfViewer({ attachment, source = 'download', fallback }: PdfViewerProps) {
  const { blob, loading, error } = useAttachmentBlob(
    attachment.id,
    source === 'preview' ? 'preview' : 'download'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  // Fit the page to the viewer's width until the person zooms by hand, so a
  // slide or page is not cut off when the viewer is narrower than the page.
  const [autoFit, setAutoFit] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRenderError(null);
    setDoc(null);
    setPage(1);
    if (!blob) return;

    blob.arrayBuffer().then(async (buf) => {
      try {
        const pdfjs = await getPdfjs();
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buf),
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy().catch(() => undefined);
          return;
        }
        setDoc(pdf);
      } catch (e) {
        if (!cancelled) {
          setRenderError(
            e instanceof Error ? e.message : 'PDF failed to load'
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    if (!doc || !autoFit) return undefined;
    let cancelled = false;
    doc.getPage(page).then((p) => {
      const wrap = wrapRef.current;
      if (cancelled || !wrap) return;
      const base = p.getViewport({ scale: 1 });
      const room = wrap.clientWidth - 32;
      if (room > 0 && base.width > 0) {
        setZoom(Math.min(2, Math.max(0.3, +(room / base.width).toFixed(2))));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, autoFit]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    const canvas = canvasRef.current;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({ scale: zoom * (window.devicePixelRatio || 1) });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
        task = p.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch (e) {
        // A superseded render is cancelled on purpose; that is not an error.
        const name = (e as { name?: string } | null)?.name;
        if (!cancelled && name !== 'RenderingCancelledException') {
          setRenderError(
            e instanceof Error ? e.message : 'Page failed to render'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  if (loading) return <ViewerStatus state="loading" />;
  if (error) return fallback ? <>{fallback}</> : <ViewerStatus state="error" message={error} />;
  if (renderError) return fallback ? <>{fallback}</> : <ViewerStatus state="error" message={renderError} />;
  if (!doc) return <ViewerStatus state="loading" />;

  const totalPages = doc.numPages;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1.5">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
        >
          <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} />
        </button>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
        >
          <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} />
        </button>
        <span aria-hidden className="mx-1 h-3 w-px bg-[var(--panel-border)]" />
        <button
          type="button"
          onClick={() => {
            setAutoFit(false);
            setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)));
          }}
          aria-label="Zoom out"
          className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ZoomOut size={14} strokeWidth={LINE_ICON_STROKE} />
        </button>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => {
            setAutoFit(false);
            setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)));
          }}
          aria-label="Zoom in"
          className="rounded-[var(--radius-input)] p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ZoomIn size={14} strokeWidth={LINE_ICON_STROKE} />
        </button>
      </div>
      <div ref={wrapRef} className="flex-1 overflow-auto bg-[var(--panel-2)]/40 p-4">
        <div className="mx-auto inline-block bg-white shadow-[var(--shadow-card)]">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}
