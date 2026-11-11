import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentRowList } from './AttachmentRowList';

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('./AttachmentViewerModal', () => ({
  AttachmentViewerModal: ({ attachment, onClose }: {
    attachment: { filename: string };
    onClose: () => void;
  }) => <button onClick={onClose}>Close {attachment.filename}</button>,
}));

const files = [
  { id: 'n.Attachment.one', filename: 'first.pdf', mime_type: 'application/pdf' },
  { id: 'n.Attachment.two', filename: 'report.pdf', mime_type: 'application/pdf' },
  { id: 'n.Attachment.blocked', filename: 'blocked.pdf', scan_status: 'blocked' },
];

afterEach(cleanup);

describe('attachment source links', () => {
  it('opens the exact authorized attachment once it is loaded', () => {
    const onViewerClose = vi.fn();
    const { rerender } = render(
      <AttachmentRowList attachments={[]} initialOpenId="n.Attachment.two" onViewerClose={onViewerClose} />,
    );
    rerender(
      <AttachmentRowList attachments={files} initialOpenId="n.Attachment.two" onViewerClose={onViewerClose} />,
    );
    expect(screen.queryByRole('button', { name: 'Close first.pdf' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close report.pdf' }));
    expect(onViewerClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Close report.pdf' })).toBeNull();
  });

  it('does not open a blocked attachment or a file outside the entry', () => {
    for (const id of ['n.Attachment.blocked', 'n.Attachment.other']) {
      const { unmount } = render(<AttachmentRowList attachments={files} initialOpenId={id} />);
      expect(screen.queryByRole('button', { name: /^Close / })).toBeNull();
      unmount();
    }
  });
});
