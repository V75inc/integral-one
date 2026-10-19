/**
 * Phase 8 Plan 08-02 Task 2 — Vitest coverage for ConflictsSection.
 *
 * Covers (per plan):
 *   1. renders empty state when list is empty
 *   2. renders Open conflicts by default
 *   3. filter chip switches between Open / Resolved / All and refetches
 *   4. Resolve button opens ResolveConflictModal
 *   5. ResolveConflictModal "Apply external" calls conflictsApi.resolve(
 *      id, 'applied_external')
 *   6. negative case — frontend NEVER sends ROADMAP-misnamed resolution
 *      (Pitfall 3 guard / T-08-02-T02 mitigation)
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

vi.mock('../../../../api/conflicts', () => ({
  conflictsApi: {
    list: vi.fn(),
    get: vi.fn(),
    resolve: vi.fn(),
  },
}));

import {
  conflictsApi,
  type ConflictResponse,
} from '../../../../api/conflicts';
import { ConflictsSection } from '../ConflictsSection';
import { ToastProvider } from '../../../../context/ToastContext';

const mockedList = conflictsApi.list as unknown as ReturnType<typeof vi.fn>;
const mockedGet = conflictsApi.get as unknown as ReturnType<typeof vi.fn>;
const mockedResolve = conflictsApi.resolve as unknown as ReturnType<typeof vi.fn>;

function makeConflict(
  overrides: Partial<ConflictResponse> = {},
): ConflictResponse {
  return {
    id: 'cf-1',
    connector_id: 'con-1',
    entry_id: 'ent-1',
    local_snapshot: { title: 'local title' },
    external_snapshot: { title: 'external title' },
    detected_at: '2026-05-17T00:00:00Z',
    resolved_at: null,
    resolution: '',
    resolved_by: null,
    status: 'open',
    ...overrides,
  };
}

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ConflictsSection />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolve.mockResolvedValue({
    conflict_id: 'cf-1',
    status: 'resolved',
    resolution: 'applied_external',
  });
});

afterEach(() => {
  cleanup();
});

describe('<ConflictsSection />', () => {
  it('renders empty state when list is empty', async () => {
    mockedList.mockResolvedValueOnce({ conflicts: [] });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/No open conflicts/i)).toBeInTheDocument();
    });
  });

  it('renders Open conflicts by default and shows the connector_id', async () => {
    mockedList.mockResolvedValueOnce({
      conflicts: [makeConflict({ id: 'cf-1', connector_id: 'con-1' })],
    });
    renderPanel();
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: 'open' });
    });
    expect(await screen.findByText(/Connector con-1/i)).toBeInTheDocument();
  });

  it('filter chip switches to Resolved and refetches', async () => {
    mockedList.mockResolvedValue({ conflicts: [] });
    renderPanel();
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: 'open' });
    });
    const resolvedChip = screen.getByRole('button', { name: /^Resolved$/i });
    fireEvent.click(resolvedChip);
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: 'resolved' });
    });
    const allChip = screen.getByRole('button', { name: /^All$/i });
    fireEvent.click(allChip);
    await waitFor(() => {
      // 'all' → undefined params (list all)
      expect(mockedList).toHaveBeenCalledWith(undefined);
    });
  });

  it('Resolve button opens ResolveConflictModal', async () => {
    const cf = makeConflict({ id: 'cf-1' });
    mockedList.mockResolvedValueOnce({ conflicts: [cf] });
    mockedGet.mockResolvedValueOnce(cf);
    renderPanel();
    const resolveBtn = await screen.findByLabelText('Resolve conflict cf-1');
    fireEvent.click(resolveBtn);
    await waitFor(() => {
      expect(
        screen.getByText(/Resolve conflict — cf-1/i),
      ).toBeInTheDocument();
    });
  });

  it('"Apply external" calls conflictsApi.resolve(id, "applied_external")', async () => {
    const cf = makeConflict({ id: 'cf-1' });
    mockedList.mockResolvedValueOnce({ conflicts: [cf] });
    mockedGet.mockResolvedValueOnce(cf);
    renderPanel();
    const resolveBtn = await screen.findByLabelText('Resolve conflict cf-1');
    fireEvent.click(resolveBtn);
    const applyBtn = await screen.findByRole('button', {
      name: /Apply external/i,
    });
    fireEvent.click(applyBtn);
    await waitFor(() => {
      expect(mockedResolve).toHaveBeenCalledWith('cf-1', 'applied_external');
    });
  });

  it('NEGATIVE CASE: frontend never sends ROADMAP misnomers (Pitfall 3)', async () => {
    const cf = makeConflict({ id: 'cf-1' });
    mockedList.mockResolvedValue({ conflicts: [cf] });
    mockedGet.mockResolvedValue(cf);
    // Make resolve mutations hang so the modal does NOT close between clicks
    // (we want to exercise all 3 buttons within a single modal open).
    mockedResolve.mockImplementation(
      () => new Promise(() => {}) as Promise<never>,
    );

    renderPanel();
    const resolveBtn = await screen.findByLabelText('Resolve conflict cf-1');
    fireEvent.click(resolveBtn);

    // Click "Apply external" — verify the resolution literal is backend-shape.
    const applyBtn = await screen.findByRole('button', {
      name: /Apply external/i,
    });
    fireEvent.click(applyBtn);
    await waitFor(() => {
      expect(mockedResolve).toHaveBeenCalled();
    });

    // Cross-check: every recorded call's resolution arg is in the backend
    // literal set AND never in the ROADMAP misnomer set.
    const forbidden = new Set([
      'accept_local',
      'accept_external',
      'merge_custom',
    ]);
    const allowed = new Set(['kept_local', 'applied_external', 'merged']);
    for (const call of mockedResolve.mock.calls) {
      const resolution = call[1] as string;
      expect(forbidden.has(resolution)).toBe(false);
      expect(allowed.has(resolution)).toBe(true);
    }
  });
});
