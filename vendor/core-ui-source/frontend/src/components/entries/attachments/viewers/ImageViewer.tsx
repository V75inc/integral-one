import type { Attachment } from '../../../../types';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';

/**
 * Native image viewer. Loads via the auth-gated download endpoint
 * (or presigned URL embedded in download_url) so private bucket
 * images render correctly without a separate auth dance.
 */
export function ImageViewer({ attachment }: { attachment: Attachment }) {
  const { url, loading, error } = useAttachmentBlob(attachment.id);
  if (loading) return <ViewerStatus state="loading" />;
  if (error || !url) return <ViewerStatus state="error" message={error} />;
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <img
        src={url}
        alt={attachment.filename || 'image'}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
