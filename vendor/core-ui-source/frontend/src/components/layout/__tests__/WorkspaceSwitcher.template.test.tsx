import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import * as wsApi from '../../../api/workspaces';
import { operationalModelsApi } from '../../../api/operationalModels';

vi.mock('../../../api/workspaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/workspaces')>();
  return {
    ...actual,
    workspacesApi: {
      ...actual.workspacesApi,
      create: vi.fn(),
    },
  };
});

vi.mock('../../../api/operationalModels', () => ({
  operationalModelsApi: {
    list: vi.fn(),
  },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({
    scope: { workspaceId: 'ws-current' },
    workspaces: [
      {
        id: 'ws-current',
        kind: 'organization',
        name: 'Current WS',
        your_role: 'admin',
      },
    ],
    workspacesLoading: false,
    setScope: vi.fn(),
    activeWorkspace: {
      id: 'ws-current',
      kind: 'organization',
      name: 'Current WS',
    },
    isPersonal: false,
  }),
}));

/** Minimal app-scope library package the wizard's "Add apps" step lists. */
const CRM_PACKAGE = {
  id: 'cp-crm',
  name: 'CRM + PM',
  description: 'Turnkey CRM and projects',
  library_package: true,
  manifest: {
    scope: 'app',
    package: { name: 'CRM + PM', description: 'Turnkey CRM', slug: 'crm-pm' },
  },

} as any;

function renderSwitcher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkspaceSwitcher />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openCreateModal() {
  fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
  const createBtn = await screen.findByRole('button', { name: /new workspace/i });
  fireEvent.click(createBtn);
}

/** Step 1 → fill name → Next → land on the app-bundle step. */
async function advanceToBundleStep(wsName = 'Acme') {
  await openCreateModal();
  fireEvent.change(await screen.findByLabelText(/^name/i), {
    target: { value: wsName },
  });
  fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
}

describe('WorkspaceSwitcher create wizard', () => {
  beforeEach(() => {
    vi.mocked(operationalModelsApi.list).mockReset();
    vi.mocked(wsApi.workspacesApi.create).mockReset();
  });

  it('lists the same app-scope packages Manage Apps offers (step 2)', async () => {
    vi.mocked(operationalModelsApi.list).mockResolvedValue([CRM_PACKAGE]);
    renderSwitcher();
    await advanceToBundleStep();
    await waitFor(() =>
      expect(screen.getByText('CRM + PM')).toBeInTheDocument(),
    );
    expect(screen.getByText('App bundles')).toBeInTheDocument();
    expect(
      screen.getByText(/workspace will start blank/i),
    ).toBeInTheDocument();
  });

  it('posts create with selected library_operational_model_ids', async () => {
    vi.mocked(operationalModelsApi.list).mockResolvedValue([CRM_PACKAGE]);
    vi.mocked(wsApi.workspacesApi.create).mockResolvedValue({
      id: 'ws1',
      kind: 'organization',
      name: 'Acme',
    });
    renderSwitcher();
    await advanceToBundleStep();
    await waitFor(() => screen.getByText('CRM + PM'));
    fireEvent.click(screen.getByText('CRM + PM'));
    fireEvent.click(
      screen.getByRole('button', { name: /^create workspace$/i }),
    );
    const createMock = vi.mocked(wsApi.workspacesApi.create);
    await waitFor(() => {
      expect(createMock).toHaveBeenCalled();
      expect(createMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          name: 'Acme',
          library_operational_model_ids: ['cp-crm'],
        }),
      );
    });
  });
});
