import type { Attachment } from '../../../../types';
import { PdfViewer } from './PdfViewer';

/**
 * pptx is rendered via the server-side LibreOffice → PDF preview
 * pipeline; once we have the PDF, the standard PdfViewer takes over.
 *
 * Conversion is lazy and cached at a sibling storage key, so the
 * first open of a presentation takes a few seconds while LibreOffice
 * runs, and subsequent opens are immediate.
 */
export function PptxPreviewViewer({
  attachment,
}: {
  attachment: Attachment;
}) {
  return <PdfViewer attachment={attachment} source="preview" />;
}
