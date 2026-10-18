/**
 * Phase 8 Plan 08-04 Task 2 — Vitest coverage for RetrievalConfigSection
 * (SET-06, read-only per A1).
 *
 * Covers (per plan Task 2 Step 10):
 *   1. renders Skeleton when isLoading
 *   2. renders the 4 fields when response arrives
 *   3. embedding_model_eager_load=true renders an Enabled pill;
 *      false renders Disabled
 *   4. footer note about restart is present
 *   5. read-only invariant — no <input> / <button type=submit> /
 *      mutation buttons rendered (a1: NO PATCH client method anywhere
 *      in the UI for this panel).
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
  waitFor,
  cleanup,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../api/retrievalConfig', () => ({
  retrievalConfigApi: {
    get: vi.fn(),
  },
}));

import {
  retrievalConfigApi,
  type RetrievalConfigResponse,
} from '../../../../api/retrievalConfig';
import { RetrievalConfigSection } from '../RetrievalConfigSection';

const mockedGet = retrievalConfigApi.get as unknown as ReturnType<typeof vi.fn>;

function makeConfig(
  overrides: Partial<RetrievalConfigResponse> = {},
): RetrievalConfigResponse {
  return {
    embedding_model_eager_load: true,
    retrieve_k_default: 150,
    retrieve_top_n_default: 20,
    embedding_store_backend: 'SqliteVecDriver',
    ...overrides,
  };
}

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RetrievalConfigSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('<RetrievalConfigSection />', () => {
  it('renders Skeleton while the config query is in flight', async () => {
    let resolve!: (v: RetrievalConfigResponse) => void;
    mockedGet.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    renderPanel();
    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
    // Drain the promise so the test doesn't leak the pending query.
    resolve(makeConfig());
  });

  it('renders all 4 fields when response arrives', async () => {
    mockedGet.mockResolvedValueOnce(
      makeConfig({
        retrieve_k_default: 200,
        retrieve_top_n_default: 25,
        embedding_store_backend: 'pgvector',
      }),
    );
    renderPanel();
    await waitFor(() => {
      // 200 + 25 + pgvector all visible
      expect(screen.getByText('200')).toBeInTheDocument();
    });
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('pgvector')).toBeInTheDocument();
    // ``Enabled`` pill (exact text) — distinct from the "When enabled, …"
    // hint copy which uses lowercase.
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    // Field labels (sanitized copy)
    expect(screen.getByText(/Pre-load AI model/i)).toBeInTheDocument();
    expect(screen.getByText(/Search depth/i)).toBeInTheDocument();
    expect(screen.getByText(/Results per query/i)).toBeInTheDocument();
    expect(screen.getByText(/Search backend/i)).toBeInTheDocument();
  });

  it('embedding_model_eager_load=true renders an Enabled pill', async () => {
    mockedGet.mockResolvedValueOnce(
      makeConfig({ embedding_model_eager_load: true }),
    );
    renderPanel();
    // Exact-text match — avoids the "When enabled, …" hint copy.
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
  });

  it('embedding_model_eager_load=false renders a Disabled pill', async () => {
    mockedGet.mockResolvedValueOnce(
      makeConfig({ embedding_model_eager_load: false }),
    );
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
  });

  it('section header surfaces the read-only nature of the panel', async () => {
    mockedGet.mockResolvedValueOnce(makeConfig());
    renderPanel();
    // Production copy surfaces the read-only nature in the section
    // description ("Deployment-level defaults — read-only…").
    await waitFor(() => {
      expect(
        screen.getAllByText(/read-only/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('read-only invariant — no mutation buttons / inputs rendered', async () => {
    mockedGet.mockResolvedValueOnce(makeConfig());
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/Search defaults/i).length).toBeGreaterThan(0);
    });
    // No buttons (A1: no PATCH / no Save / no Edit affordance).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // No text inputs / form fields.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
