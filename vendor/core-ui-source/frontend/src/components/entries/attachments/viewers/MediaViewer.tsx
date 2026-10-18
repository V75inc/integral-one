import type { Attachment } from '../../../../types';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';

/**
 * Native <audio> / <video> playback.
 *
 * Uses the object-URL from useAttachmentBlob (rather than the bare
 * download URL) so we don't depend on the browser's ability to
 * follow the auth-gated download endpoint inside a media element —
 * Safari, in particular, often won't pass cookies/headers through.
 */
export function MediaViewer({
  attachment,
  kind,
}: {
  attachment: Attachment;
  kind: 'audio' | 'video';
}) {
  const { url, loading, error, contentType } = useAttachmentBlob(attachment.id);
  if (loading) return <ViewerStatus state="loading" />;
  if (error || !url) return <ViewerStatus state="error" message={error} />;

  const type = contentType || attachment.mime_type || undefined;
  if (kind === 'audio') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <audio src={url} controls className="w-full max-w-2xl">
          <source src={url} type={type} />
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-3">
      <video
        src={url}
        controls
        className="max-h-full max-w-full"
        preload="metadata"
      >
        <source src={url} type={type} />
        Your browser does not support video playback.
      </video>
    </div>
  );
}
