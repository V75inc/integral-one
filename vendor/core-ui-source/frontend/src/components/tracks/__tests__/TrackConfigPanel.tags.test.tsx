import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { TrackConfigPanel } from '../TrackConfigPanel';
const api = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn() }));
vi.mock('../../../api', () => ({
  tagsApi: {
    list: async () => [{ id: 'existing', name: 'Existing' }],
    create: api.create,
  },
  entryTypesApi: { list: async () => [] },
  trackViewsApi: { list: async () => [] },
  operationalModelsApi: {},
}));
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: api.toast }),
}));
vi.mock('../../../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn(),
}));
vi.mock('../../../features/view-designer', () => ({
  isViewDesignerEnabled: () => false,
  ViewDesignerShell: () => null,
}));
vi.mock('../settings/SchemaSection', () => ({ SchemaSection: () => null }));
vi.mock('../ViewSettingsModal', () => ({ ViewSettingsModal: () => null }));
vi.mock('../CreateViewPickerModal', () => ({
  CreateViewPickerModal: () => null,
}));
beforeEach(() => vi.resetAllMocks());
async function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TrackConfigPanel trackId="track" canEdit />
    </QueryClientProvider>,
  );
  const input = await screen.findByPlaceholderText('New tag');
  const add = within(screen.getByRole('region', { name: 'Tags' })).getByRole(
    'button',
    { name: 'Add' },
  );
  return { input, add };
}
it.each([
  ['x'.repeat(81), '80 characters'],
  [' existing ', 'already exists'],
])('explains invalid tag %s and preserves the input', async (name, message) => {
  const { input, add } = await setup();
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(add);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.toast).toHaveBeenCalledWith(
    expect.stringContaining(message),
    'error',
  );
  expect(input).toHaveValue(name);
});
it('renders canonical backend errors and keeps the draft for correction', async () => {
  api.create.mockRejectedValue({
    response: { data: { message: 'A tag with this name already exists' } },
  });
  const { input, add } = await setup();
  fireEvent.change(input, { target: { value: 'New name' } });
  fireEvent.click(add);
  await waitFor(() =>
    expect(api.toast).toHaveBeenCalledWith(
      'A tag with this name already exists',
      'error',
    ),
  );
  expect(input).toHaveValue('New name');
});
it('submits a valid tag once and clears it only after success', async () => {
  let finish!: () => void;
  api.create.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { input, add } = await setup();
  fireEvent.change(input, { target: { value: ' New name ' } });
  fireEvent.click(add);
  fireEvent.click(add);
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.create).toHaveBeenCalledWith({
    track_id: 'track',
    name: 'New name',
    color: '#6B7280',
  });
  finish();
  await waitFor(() => expect(input).toHaveValue(''));
});
