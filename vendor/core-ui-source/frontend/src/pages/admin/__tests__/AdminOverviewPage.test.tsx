vi.mock('../adminQueryRecovery', () => ({adminQueryRecovery: {retry: 2, retryDelay: 0}}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ getOverview: vi.fn() }));

vi.mock('../../../api/admin', () => ({
  adminApi: { getOverview: mocks.getOverview },
}));

vi.mock('../../../context/CrumbsContext', () => ({
  useSetCrumbs: () => vi.fn(),
}));

import { AdminOverviewPage } from '../AdminOverviewPage';

afterEach(cleanup);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<AdminOverviewPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('presents platform totals with working directory links', async () => {
    mocks.getOverview.mockResolvedValue({
      total_users: 28,
      active_users: 24,
      inactive_users: 4,
      platform_admins: 2,
      personal_workspaces: 20,
      organization_workspaces: 5,
      total_apps: 7,
      total_tracks: 16,
    });

    renderPage();

    expect(await screen.findByText('Platform overview')).toBeInTheDocument();
    expect(await screen.findByText('28')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /people/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: /workspaces/i })).toHaveAttribute(
      'href',
      '/admin/workspaces',
    );
    expect(screen.getByRole('link', { name: /apps/i })).toHaveAttribute(
      'href',
      '/admin/apps',
    );
    expect(screen.getByRole('link', { name: /tracks/i })).toHaveAttribute(
      'href',
      '/admin/tracks',
    );
    expect(screen.getByText(/2 platform administrators/i)).toBeInTheDocument();
  });

  it('offers recovery when platform totals cannot be loaded', async () => {
    mocks.getOverview.mockRejectedValue(new Error('unavailable'));

    renderPage();

    expect(
      await screen.findByText('Platform overview is unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
