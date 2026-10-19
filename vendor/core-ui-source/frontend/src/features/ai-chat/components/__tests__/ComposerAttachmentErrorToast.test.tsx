/**
 * ComposerAttachmentErrorToast — oversized / rejected attachments must toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const { showToast, useAuiEventMock } = vi.hoisted(() => {
  const showToast = vi.fn();
  const useAuiEventMock = vi.fn();
  return { showToast, useAuiEventMock };
});

vi.mock('@assistant-ui/react', () => ({
  useAuiEvent: useAuiEventMock,
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

import { ComposerAttachmentErrorToast } from '../ComposerAttachmentErrorToast';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComposerAttachmentErrorToast', () => {
  it('toasts the adapter message on composer.attachmentAddError', () => {
    useAuiEventMock.mockImplementation(
      (
        _event: string,
        handler: (payload: {
          message: string;
          reason: string;
        }) => void,
      ) => {
        handler({
          message: 'Image too large (max 5 MB): big.png',
          reason: 'adapter-error',
        });
      },
    );

    render(<ComposerAttachmentErrorToast />);

    expect(useAuiEventMock).toHaveBeenCalledWith(
      'composer.attachmentAddError',
      expect.any(Function),
    );
    expect(showToast).toHaveBeenCalledWith(
      'Image too large (max 5 MB): big.png',
      'error',
    );
  });

  it('falls back to a friendly message when the payload has no text', () => {
    useAuiEventMock.mockImplementation(
      (
        _event: string,
        handler: (payload: {
          message: string;
          reason: string;
        }) => void,
      ) => {
        handler({ message: '  ', reason: 'not-accepted' });
      },
    );

    render(<ComposerAttachmentErrorToast />);

    expect(showToast).toHaveBeenCalledWith(
      'That file type is not supported.',
      'error',
    );
  });
});
