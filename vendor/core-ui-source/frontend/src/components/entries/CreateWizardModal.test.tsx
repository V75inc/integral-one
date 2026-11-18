import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateWizardModal } from './CreateWizardModal';

const mocks = vi.hoisted(() => ({ create: vi.fn(), tool: vi.fn(), toast: vi.fn(), created: vi.fn(), close: vi.fn() }));
vi.mock('../../api', () => ({ entriesApi: { create: mocks.create }, tracksApi: { get: vi.fn(), list: vi.fn() } }));
vi.mock('../../api/tools', () => ({ toolsApi: { call: mocks.tool } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));

const track = { id: 'track-1', title: 'Pay runs' } as never;
const entryType = {
  id: 'type-1',
  name: 'Pay run',
  form_schema: { fields: [], create_wizard: { steps: [{ key: 'confirm', kind: 'summary', title: 'Confirm' }] } },
} as never;
const show = () => render(<CreateWizardModal open track={track} entryType={entryType} onClose={mocks.close} onCreated={mocks.created} />);
beforeEach(() => { vi.clearAllMocks(); });

it('creates the record and reports it', async () => {
  mocks.create.mockResolvedValue({ id: 'e1' });
  show();
  fireEvent.click(await screen.findByRole('button', { name: /^Create/ }));
  await waitFor(() => expect(mocks.created).toHaveBeenCalledWith({ id: 'e1' }));
  expect(mocks.toast).toHaveBeenCalledWith('Pay run created', 'success');
});

it('shows the reason an App gave when it refuses the record', async () => {
  mocks.create.mockRejectedValue({ response: { data: { message: "This pay run can't be created yet. Alex Rivera: TIN" } } });
  show();
  fireEvent.click(await screen.findByRole('button', { name: /^Create/ }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("This pay run can't be created yet. Alex Rivera: TIN", 'error'));
  expect(mocks.created).not.toHaveBeenCalled();
});

it('falls back to a generic message when there is no reason to show', async () => {
  mocks.create.mockRejectedValue(new Error('network'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: /^Create/ }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Failed to create'), 'error'));
});
