import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { getPdfjs } from '../../../../lib/pdfjsLoader';
import { NativePdfBlobEmbed } from './NativePdfBlobEmbed';
import { ViewerStatus } from './ViewerStatus';
import { LINE_ICON_STROKE } from '../../../ui/IconWell';
import { IconButton, Surface, Text } from '../../../../ui';

type PdfDocument = Awaited<
  ReturnType<Awaited<ReturnType<typeof getPdfjs>>['getDocument']>['promise']
>;

interface BlobPdfViewerProps {
  blob: Blob | null;
  loading?: boolean;
  error?: string | null;
  /** Max height for the scroll area (wizard embeds use a fixed height). */
  maxHeight?: number | string;
}

/**
 * PDF.js viewer for an in-memory blob (public share wizard, previews, etc.).
 * Avoids ``<iframe src="blob:…">`` — unreliable across browsers/CSP.
 */
export function BlobPdfViewer({
  blob,
  loading,
  error,
  maxHeight = 420,
}: BlobPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [useNativeEmbed, setUseNativeEmbed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRenderError(null);
    setDoc(null);
    setPage(1);
    setUseNativeEmbed(false);
    if (!blob || loading || error) return;

    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setUseNativeEmbed(true);
    }, 2500);

    void blob.arrayBuffer().then(async buf => {
      try {
        const pdfjs = await getPdfjs();
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy().catch(() => undefined);
          return;
        }
        window.clearTimeout(fallbackTimer);
        setDoc(pdf);
      } catch (e) {
        if (!cancelled) {
          window.clearTimeout(fallbackTimer);
          setUseNativeEmbed(true);
          setRenderError(
            e instanceof Error ? e.message : 'PDF failed to load',
          );
        }
      }
    }).catch(e => {
      if (!cancelled) {
        window.clearTimeout(fallbackTimer);
        setUseNativeEmbed(true);
        setRenderError(
          e instanceof Error ? e.message : 'PDF failed to load',
        );
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [blob, error, loading]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({
          scale: zoom * (window.devicePixelRatio || 1),
        });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
        await p.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) {
          setRenderError(
            e instanceof Error ? e.message : 'Page failed to render',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom]);

  if (loading) return <ViewerStatus state="loading" />;
  if (error) return <ViewerStatus state="error" message={error} />;
  if (blob && useNativeEmbed) {
    return <NativePdfBlobEmbed blob={blob} height={maxHeight} title="PDF preview" />;
  }
  if (renderError && blob) {
    return <NativePdfBlobEmbed blob={blob} height={maxHeight} title="PDF preview" />;
  }
  if (!blob || !doc) return <ViewerStatus state="loading" />;

  const totalPages = doc.numPages;

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-[var(--panel-border)] px-3 py-1.5">
        <IconButton
          label="Previous page"
          size="sm"
          tone="muted"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} />
        </IconButton>
        <Text variant="meta" tone="muted" className="tabular-nums">
          {page} / {totalPages}
        </Text>
        <IconButton
          label="Next page"
          size="sm"
          tone="muted"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} />
        </IconButton>
        <span aria-hidden className="mx-1 h-3 w-px bg-[var(--panel-border)]" />
        <IconButton
          label="Zoom out"
          size="sm"
          tone="muted"
          onClick={() => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2)))}
        >
          <ZoomOut size={14} strokeWidth={LINE_ICON_STROKE} />
        </IconButton>
        <Text variant="meta" tone="muted" className="tabular-nums">
          {Math.round(zoom * 100)}%
        </Text>
        <IconButton
          label="Zoom in"
          size="sm"
          tone="muted"
          onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(2)))}
        >
          <ZoomIn size={14} strokeWidth={LINE_ICON_STROKE} />
        </IconButton>
      </div>
      <Surface
        as="div"
        tone="panel-2"
        border="none"
        radius="none"
        backgroundOpacity={40}
        className="overflow-auto p-4"
        style={{ maxHeight }}
      >
        <div className="mx-auto inline-block bg-white shadow-[var(--shadow-card)]">
          <canvas ref={canvasRef} />
        </div>
      </Surface>
    </Surface>
  );
}
