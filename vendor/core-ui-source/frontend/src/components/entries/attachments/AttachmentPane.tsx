import { useMemo } from 'react';
import { Download, FileSearch } from 'lucide-react';

import type { Attachment } from '../../../types';
import { Text } from '../../../ui';
import { LINE_ICON_STROKE } from '../../ui/IconWell';
import { resolveViewerKind } from './attachmentHelpers';
import { ImageViewer } from './viewers/ImageViewer';
import { PdfViewer } from './viewers/PdfViewer';
import { TextViewer } from './viewers/TextViewer';
import { DocxPreviewViewer } from './viewers/DocxPreviewViewer';
import { XlsxViewer } from './viewers/XlsxViewer';
import { PptxPreviewViewer } from './viewers/PptxPreviewViewer';
import { MediaViewer } from './viewers/MediaViewer';

/**
 * The attachment viewer body: picks the viewer for the file's kind and renders
 * it. Shared by ``AttachmentViewerModal`` (a dialog over the page) and the
 * entry canvas (a pane beside the entry), so both show a file the same way.
 */
export function AttachmentPane({
  attachment,
  onDownload,
}: {
  attachment: Attachment;
  onDownload(attachment: Attachment): void;
}) {
  const viewerKind = useMemo(() => resolveViewerKind(attachment), [attachment]);

  switch (viewerKind) {
    case 'image':
      return <ImageViewer attachment={attachment} />;
    case 'pdf':
      return <PdfViewer attachment={attachment} source="download" />;
    case 'text':
      return <TextViewer attachment={attachment} />;
    case 'docx':
      return <DocxPreviewViewer attachment={attachment} />;
    case 'xlsx':
      return <XlsxViewer attachment={attachment} />;
    case 'pptx-preview':
      return <PptxPreviewViewer attachment={attachment} />;
    case 'audio':
    case 'video':
      return <MediaViewer attachment={attachment} kind={viewerKind} />;
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Text as="span" variant="body" tone="muted"><FileSearch
            size={36}
            strokeWidth={LINE_ICON_STROKE}
          /></Text>
          <Text as="div" variant="body">
            No in-app preview for this file type.
          </Text>
          <button
            type="button"
            onClick={() => onDownload(attachment)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] bg-[var(--cta-bg)] px-3 py-1.5 text-sm font-medium text-[var(--cta-fg)] hover:bg-[var(--cta-hover)]"
          >
            <Download size={14} strokeWidth={LINE_ICON_STROKE} />
            Download to view
          </button>
        </div>
      );
  }
}
