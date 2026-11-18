import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminResourceDetailPage } from '../AdminResourceDetailPage';

const mocks = vi.hoisted(() => ({ getApp: vi.fn() }));
vi.mock('../../../api/admin', () => ({ adminApi: { getApp: mocks.getApp } }));
vi.mock('../../../context/CrumbsContext', () => ({ useSetCrumbs: vi.fn() }));

afterEach(cleanup);

describe('Admin app detail', () => {
  it('shows Created as a local date and time without raw timestamp precision', async () => {
    const timestamp = '2026-10-21T14:02:31.123456Z';
    mocks.getApp.mockResolvedValue({ id: 'app-1', name: 'Example app', created_at: timestamp });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/apps/app-1']}>
          <Routes><Route path="/admin/apps/:appId" element={<AdminResourceDetailPage resourceType="app" />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(timestamp)).not.toBeInTheDocument();
  });
});
