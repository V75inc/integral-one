import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { attachmentsApi } from '../../../api/attachments';
import type { Entry, SavedView } from '../../../types';
import { TableWidget } from '../TableWidget';

vi.mock('../../../api/attachments', () => ({ attachmentsApi: { get: vi.fn() } }));
vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: 'ws' } }) }));
vi.mock('../../entries/attachments/AttachmentViewerModal', () => ({ AttachmentViewerModal: ({ attachment }: { attachment: { filename: string } }) => <div role="dialog">{attachment.filename}</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('renders typed file references as named controls without making ordinary text into a file', async () => {
  const id = 'n.Attachment.1234567890abcdef';
  vi.mocked(attachmentsApi.get).mockResolvedValue({ attachment: { id, filename: 'Guide.docx' } });
  const openEntry = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <TableWidget
      view={{ id: 'view', type: 'table', config: { columns: [{ field: 'custom_fields.document' }, { field: 'note' }] } } as unknown as SavedView}
      entries={[{ id: 'entry', custom_fields: { document: [id], note: id } } as unknown as Entry]}
      fields={[{ key: 'document', name: 'File', type: 'files' }, { key: 'note', name: 'Note', type: 'text' }]}
      isLoading={false}
      onEntryOpen={openEntry}
    />
  </QueryClientProvider>);
  const table = screen.getByRole('table');
  const fileButton = await within(table).findByRole('button', { name: 'Guide.docx' });
  expect(within(table).getByText(id)).toBeInTheDocument();
  fireEvent.click(fileButton);
  expect(screen.getByRole('dialog')).toHaveTextContent('Guide.docx');
  expect(openEntry).not.toHaveBeenCalled();
  const mobileEntry = screen.getByRole('button', { name: /Guide\.docx Note/ });
  expect(within(mobileEntry).queryByRole('button')).not.toBeInTheDocument();
});
