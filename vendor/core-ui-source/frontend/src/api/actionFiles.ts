/**
 * Helpers for the ``action_bar`` widget's file-producing actions.
 *
 * A tool bound to a ``produces_file: true`` action returns its output as
 * normal JSON from ``POST /api/tools/{key}`` (no route change — see
 * ``toolsApi.call``) with a ``file`` key of shape ``{filename, mime,
 * content_base64}``. Everything here is client-side base64 decoding, unlike
 * ``attachmentsApi.fetchDownloadBlob`` which streams bytes from a second
 * network request — this data already arrived in the tool-call response.
 */

export interface ActionFile {
  filename: string;
  mime: string;
  content_base64: string;
}

export function isActionFile(value: unknown): value is ActionFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.filename === 'string' &&
    typeof v.mime === 'string' &&
    typeof v.content_base64 === 'string'
  );
}

export function actionFileToBlob(file: ActionFile): Blob {
  const binary = atob(file.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: file.mime });
}

/** Wrap the decoded bytes as a real ``File`` so they can be handed to
 *  ``attachmentsApi.uploadForEntry`` unmodified (Option A: attachment
 *  persistence stays 100% client-side, reusing the existing multipart
 *  upload endpoint rather than adding a new backend route). */
export function actionFileToFile(file: ActionFile): File {
  return new File([actionFileToBlob(file)], file.filename, {
    type: file.mime,
  });
}

/** Trigger an immediate browser download of a decoded action file. */
export function downloadActionFile(file: ActionFile): void {
  const blob = actionFileToBlob(file);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
