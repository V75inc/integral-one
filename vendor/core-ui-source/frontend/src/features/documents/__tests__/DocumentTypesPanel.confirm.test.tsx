import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import { DocumentTypesPanel } from '../DocumentTypesPanel';

const mocks = vi.hoisted(() => ({ remove: vi.fn(), toast: vi.fn() }));
vi.mock('../api', () => ({ documentsApi: { deleteDocumentType: mocks.remove } }));
vi.mock('../useDocumentTypes', () => ({
  useDocumentTypes: () => ({ data: [{ id: 'type-1', title: 'Agreement', code: 'agreement' }], isLoading: false }),
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));

beforeEach(() => { vi.clearAllMocks(); mocks.remove.mockResolvedValue({}); });
afterEach(cleanup);

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ConfirmProvider><DocumentTypesPanel /></ConfirmProvider></QueryClientProvider>);
}

describe('document type confirmation', () => {
  it('does not delete when the confirmation is cancelled', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Templates using this code/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('type-1'));
  });
});
