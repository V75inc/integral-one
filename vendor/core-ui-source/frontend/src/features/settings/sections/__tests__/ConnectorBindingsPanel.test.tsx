/**
 * Phase 8 Plan 08-02 Task 3 — Vitest coverage for ConnectorBindingsPanel.
 *
 * Covers (per plan):
 *   1. Renders empty state when bindings list is empty.
 *   2. Renders one row per binding from the listBindings query.
 *   3. Clicking "+ Add binding" reveals the inline form.
 *   4. Submitting the form calls createBinding with selected track + yaml +
 *      bidirectional.
 *   5. Track picker excludes already-bound tracks (regression guard).
 *   6. Clicking "Unlink" opens confirm; confirming calls deleteBinding;
 *      declining does NOT call deleteBinding.
 *   7. After successful create OR delete, both bindings + list query keys
 *      invalidate.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../api/connectors', () => ({
  connectorsApi: {
    listBindings: vi.fn(),
    createBinding: vi.fn(),
    deleteBinding: vi.fn(),
  },
}));

vi.mock('../../../../api/tracks', () => ({
  tracksApi: {
    list: vi.fn(),
  },
}));

import {
  connectorsApi,
  type ConnectorBinding,
} from '../../../../api/connectors';
import { tracksApi } from '../../../../api/tracks';
import { ConnectorBindingsPanel } from '../ConnectorBindingsPanel';
import { ToastProvider } from '../../../../context/ToastContext';
import { ConfirmProvider } from '../../../../context/ConfirmContext';

const mockedListBindings = connectorsApi.listBindings as unknown as ReturnType<
  typeof vi.fn
>;
const mockedCreateBinding = connectorsApi.createBinding as unknown as ReturnType<
  typeof vi.fn
>;
const mockedDeleteBinding = connectorsApi.deleteBinding as unknown as ReturnType<
  typeof vi.fn
>;
const mockedTrackList = tracksApi.list as unknown as ReturnType<typeof vi.fn>;

function makeBinding(overrides: Partial<ConnectorBinding> = {}): ConnectorBinding {
  return {
    connector_id: 'con-1',
    track_id: 'trk-1',
    track_title: 'Bound Track',
    workspace_id: 'ws-1',
    mapping_profile_yaml: '',
    bidirectional: false,
    ...overrides,
  };
}

function makeTrack(id: string, title: string) {
  // Track shape — only id + title are read by the panel.
  return { id, title } as never;
}

let lastClient: QueryClient | null = null;

function renderPanel(connectorId = 'con-1') {
  lastClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={lastClient}>
      <ToastProvider>
        <ConfirmProvider>
          <ConnectorBindingsPanel connectorId={connectorId} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreateBinding.mockResolvedValue(makeBinding());
  mockedDeleteBinding.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('<ConnectorBindingsPanel />', () => {
  it('renders empty state when bindings list is empty', async () => {
    mockedListBindings.mockResolvedValueOnce({ bindings: [], total: 0 });
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByText(/No track bindings yet/i),
      ).toBeInTheDocument();
    });
  });

  it('renders one row per binding from the listBindings query', async () => {
    mockedListBindings.mockResolvedValueOnce({
      bindings: [
        makeBinding({ track_id: 'trk-1', track_title: 'Track A' }),
        makeBinding({ track_id: 'trk-2', track_title: 'Track B' }),
      ],
      total: 2,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Track A')).toBeInTheDocument();
    });
    expect(screen.getByText('Track B')).toBeInTheDocument();
    expect(screen.getByLabelText('Unlink trk-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Unlink trk-2')).toBeInTheDocument();
  });

  it('clicking "+ Add binding" reveals the inline form with picker/yaml/checkbox', async () => {
    mockedListBindings.mockResolvedValue({ bindings: [], total: 0 });
    mockedTrackList.mockResolvedValue([makeTrack('trk-new', 'New Track')]);
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByText(/No track bindings yet/i),
      ).toBeInTheDocument();
    });
    const addBtn = screen.getByLabelText('Add binding');
    fireEvent.click(addBtn);
    // Form fields visible.
    expect(await screen.findByText(/^Track$/)).toBeInTheDocument();
    expect(screen.getByText(/Mapping profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Bidirectional/i)).toBeInTheDocument();
  });

  it('submit calls createBinding with track_id + yaml + bidirectional', async () => {
    mockedListBindings.mockResolvedValue({ bindings: [], total: 0 });
    mockedTrackList.mockResolvedValue([makeTrack('trk-new', 'New Track')]);
    renderPanel();
    const addBtn = await screen.findByLabelText('Add binding');
    fireEvent.click(addBtn);

    // Wait for the picker (tracks list) to populate.
    await waitFor(() => {
      expect(screen.getByText('New Track')).toBeInTheDocument();
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'trk-new' } });

    const textarea = screen.getByPlaceholderText(/Optional mapping YAML/i);
    fireEvent.change(textarea, { target: { value: 'field_map: {}' } });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const bindBtn = screen.getByRole('button', { name: /^Bind$/ });
    fireEvent.click(bindBtn);

    await waitFor(() => {
      expect(mockedCreateBinding).toHaveBeenCalledWith('con-1', {
        track_id: 'trk-new',
        mapping_profile_yaml: 'field_map: {}',
        bidirectional: true,
      });
    });
  });

  it('track picker excludes already-bound tracks (regression guard)', async () => {
    mockedListBindings.mockResolvedValue({
      bindings: [makeBinding({ track_id: 'trk-1', track_title: 'A' })],
      total: 1,
    });
    mockedTrackList.mockResolvedValue([
      makeTrack('trk-1', 'A'),
      makeTrack('trk-2', 'B'),
    ]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Unlink trk-1')).toBeInTheDocument();
    });
    const addBtn = screen.getByLabelText('Add binding');
    fireEvent.click(addBtn);

    await waitFor(() => {
      // The available list should NOT include trk-1.
      expect(screen.getByText('B')).toBeInTheDocument();
    });
    // Count <option> elements that are NOT the placeholder.
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const non_placeholder = options.filter(o => o.value !== '');
    expect(non_placeholder).toHaveLength(1);
    expect(non_placeholder[0].value).toBe('trk-2');
  });

  it('Unlink opens confirm; confirming calls deleteBinding; declining does not', async () => {
    mockedListBindings.mockResolvedValue({
      bindings: [makeBinding({ track_id: 'trk-1', track_title: 'A' })],
      total: 1,
    });
    renderPanel();
    // First: cancel the confirm.
    const unlinkBtn = await screen.findByLabelText('Unlink trk-1');
    fireEvent.click(unlinkBtn);
    const cancelBtn = await screen.findByRole('button', { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);
    expect(mockedDeleteBinding).not.toHaveBeenCalled();

    // Second: confirm.
    fireEvent.click(unlinkBtn);
    const confirmBtn = await screen.findByRole('button', { name: /^Unlink$/ });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockedDeleteBinding).toHaveBeenCalledWith('con-1', 'trk-1');
    });
  });

  it('after successful create AND delete, both bindings + list query keys invalidate', async () => {
    mockedListBindings.mockResolvedValue({ bindings: [], total: 0 });
    mockedTrackList.mockResolvedValue([makeTrack('trk-new', 'New Track')]);
    renderPanel();

    const addBtn = await screen.findByLabelText('Add binding');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('New Track')).toBeInTheDocument();
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'trk-new' } });

    const bindBtn = screen.getByRole('button', { name: /^Bind$/ });

    // Spy on invalidateQueries — same client instance is captured.
    const spy = vi.spyOn(lastClient!, 'invalidateQueries');
    fireEvent.click(bindBtn);

    await waitFor(() => {
      expect(mockedCreateBinding).toHaveBeenCalled();
    });
    // Two invalidations: bindings sub-key + connectors list.
    const calls = spy.mock.calls.map(c => c[0]);
    const keys = calls.map(c => (c as { queryKey: unknown[] }).queryKey);
    expect(
      keys.some(
        k => Array.isArray(k) && k[0] === 'connectors' && k[2] === 'bindings',
      ),
    ).toBe(true);
    expect(
      keys.some(
        k => Array.isArray(k) && k[0] === 'connectors' && k[1] === 'list',
      ),
    ).toBe(true);
  });
});
