/**
 * Surfaces composer attachment failures (oversized images, unsupported
 * types, adapter errors) as toasts. assistant-ui emits
 * ``composer.attachmentAddError`` when an AttachmentAdapter throws; without
 * a subscriber the pick silently no-ops and QA sees "missing file size warning".
 */
import { useAuiEvent } from '@assistant-ui/react';
import { useToast } from '../../../context/ToastContext';

export function ComposerAttachmentErrorToast() {
  const { showToast } = useToast();

  useAuiEvent('composer.attachmentAddError', ({ message, reason }) => {
    const text =
      (typeof message === 'string' && message.trim()) ||
      (reason === 'not-accepted'
        ? 'That file type is not supported.'
        : reason === 'no-adapter'
          ? 'No attachment handler available for that file.'
          : 'Could not attach that file.');
    showToast(text, 'error');
  });

  return null;
}
