import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { attachmentsApi } from '../../../api/attachments';
import { FileValue } from '../FileValue';

vi.mock('../../../api/attachments', () => ({ attachmentsApi: { get: vi.fn() } }));
vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: 'ws' } }) }));
vi.mock('../attachments/AttachmentViewerModal', () => ({ AttachmentViewerModal: ({ attachment }: { attachment: { filename: string } }) => <div role="dialog">{attachment.filename}</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const id = 'n.Attachment.1234567890abcdef';
function show(value: unknown) {
  return render(<QueryClientProvider client={new QueryClient()}><FileValue value={value} /></QueryClientProvider>);
}

it('resolves a typed file to a named authenticated preview control', async () => {
  vi.mocked(attachmentsApi.get).mockResolvedValue({ attachment: { id, filename: 'Brief.pdf' } });
  show(id);
  expect(screen.queryByText(id)).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Brief.pdf' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Brief.pdf');
});

it('does not expose IDs for unavailable or blocked references', async () => {
  vi.mocked(attachmentsApi.get).mockRejectedValue(new Error('Denied'));
  show(id);
  expect(await screen.findByText('File unavailable')).toBeVisible();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
});

it('deduplicates file references without changing their saved IDs', async () => {
  vi.mocked(attachmentsApi.get).mockResolvedValue({ attachment: { id, filename: 'Brief.pdf' } });
  show([id, { id }]);
  expect(await screen.findAllByRole('button', { name: 'Brief.pdf' })).toHaveLength(1);
  expect(attachmentsApi.get).toHaveBeenCalledWith(id);
});

it('does not offer preview access for a blocked attachment', async () => {
  vi.mocked(attachmentsApi.get).mockResolvedValue({ attachment: { id, filename: 'Blocked.pdf', scan_status: 'blocked' } });
  show(id);
  expect(await screen.findByText('File unavailable')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
});
