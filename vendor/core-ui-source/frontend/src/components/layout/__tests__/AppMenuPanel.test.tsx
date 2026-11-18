import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ activeWorkspace: null }) }));
vi.mock('../../../api', () => ({
  appsApi: {
    get: vi.fn(async () => ({ id: 'app-1', name: 'Payroll Guyana', icon: 'banknote' })),
    listTracks: vi.fn(async () => [
      { id: 't-runs', title: 'Pay Runs', icon: 'calendar-clock', position: 1 },
      { id: 't-lines', title: 'Employee Pay', nav_visible: false, position: 2 },
      { id: 't-slips', title: 'Payslips', icon: 'receipt', position: 0 },
    ]),
  },
  tracksApi: { get: vi.fn(async (id: string) => ({ id, title: 'Pay Runs', app: { id: 'app-1' } })) },
  entriesApi: { get: vi.fn(async (id: string) => ({ id, track_id: 't-runs' })) },
}));

import { AppMenuPanel, useCurrentAppId } from '../AppMenuPanel';

function wrap(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('App menu', () => {
  beforeEach(() => window.localStorage.clear());

  it('lists Home, Dashboards, the visible Tracks in order, and Settings', async () => {
    const Wrapper = wrap('/tracks/t-runs');
    render(<AppMenuPanel appId="app-1" activeTrackId="t-runs" onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('Payslips');
    const links = screen.getAllByRole('link').map(link => link.textContent);
    expect(links).toEqual(['Home', 'Dashboards', 'Payslips', 'Pay Runs', 'Settings']);
    expect(screen.queryByText('Employee Pay')).toBeNull();
    expect(screen.getByRole('link', { name: 'Pay Runs' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/apps/app-1?settings=1');
  });

  it('knows the App of an App page, a Track page and an entry page', async () => {
    expect(renderHook(() => useCurrentAppId(), { wrapper: wrap('/apps/app-9') }).result.current.appId).toBe('app-9');
    const track = renderHook(() => useCurrentAppId(), { wrapper: wrap('/tracks/t-runs') });
    await waitFor(() => expect(track.result.current.appId).toBe('app-1'));
    const entry = renderHook(() => useCurrentAppId(), { wrapper: wrap('/entries/e-1') });
    await waitFor(() => expect(entry.result.current).toEqual({ appId: 'app-1', trackId: 't-runs' }));
    expect(renderHook(() => useCurrentAppId(), { wrapper: wrap('/feed') }).result.current.appId).toBeNull();
  });

  it('answers a known Track at once on the next visit', async () => {
    const first = renderHook(() => useCurrentAppId(), { wrapper: wrap('/tracks/t-runs') });
    await waitFor(() => expect(first.result.current.appId).toBe('app-1'));
    const again = renderHook(() => useCurrentAppId(), { wrapper: wrap('/tracks/t-runs') });
    expect(again.result.current.appId).toBe('app-1');
  });
});
