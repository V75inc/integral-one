import type { Attachment } from '../../../../types';
import { DocxViewer } from './DocxViewer';
import { PdfViewer } from './PdfViewer';

/**
 * Word documents are shown as the server's LibreOffice -> PDF preview, so what
 * you see keeps the document's fonts, colours, tables and page layout. The
 * conversion is cached after the first open. If it is unavailable the older
 * HTML conversion (text and basic structure only) is shown instead.
 */
export function DocxPreviewViewer({ attachment }: { attachment: Attachment }) {
  return (
    <PdfViewer
      attachment={attachment}
      source="preview"
      fallback={<DocxViewer attachment={attachment} />}
    />
  );
}
