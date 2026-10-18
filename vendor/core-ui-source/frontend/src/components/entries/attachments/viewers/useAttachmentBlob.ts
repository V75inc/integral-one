import { useEffect, useState } from 'react';

import { attachmentsApi } from '../../../../api/attachments';

export interface AttachmentBlobState {
  blob: Blob | null;
  url: string | null;
  contentType: string;
  error: string | null;
  loading: boolean;
}

/**
 * Loads the raw download bytes for an attachment and produces an
 * object URL. The URL is revoked on unmount so we don't leak blob
 * references — important when the user pages through many files in
 * the viewer.
 *
 * ``mode`` switches between the download endpoint (raw original
 * bytes) and the preview endpoint (server-rendered PDF for office
 * docs). Both return the same shape.
 */
export function useAttachmentBlob(
  attachmentId: string,
  mode: 'download' | 'preview' = 'download'
): AttachmentBlobState {
  const [state, setState] = useState<AttachmentBlobState>({
    blob: null,
    url: null,
    contentType: '',
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setState({
      blob: null,
      url: null,
      contentType: '',
      error: null,
      loading: true,
    });

    const fetcher =
      mode === 'preview'
        ? attachmentsApi.fetchPreviewBlob
        : attachmentsApi.fetchDownloadBlob;

    fetcher(attachmentId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState({
            blob: null,
            url: null,
            contentType: '',
            error: 'Not available',
            loading: false,
          });
          return;
        }
        const { blob, contentType } = result;
        const typedBlob = contentType
          ? new Blob([blob], { type: contentType })
          : blob;
        createdUrl = URL.createObjectURL(typedBlob);
        setState({
          blob: typedBlob,
          url: createdUrl,
          contentType,
          error: null,
          loading: false,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 404 here means the file's bytes (or the attachment node) are
        // gone — most often a card rendered from an old chat transcript or
        // stale list whose attachment was deleted since. Show a plain
        // explanation instead of the raw axios error string.
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        const message =
          status === 404
            ? 'This file is no longer available — it may have been deleted.'
            : err instanceof Error
              ? err.message
              : 'Failed to load';
        setState({
          blob: null,
          url: null,
          contentType: '',
          error: message,
          loading: false,
        });
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [attachmentId, mode]);

  return state;
}
