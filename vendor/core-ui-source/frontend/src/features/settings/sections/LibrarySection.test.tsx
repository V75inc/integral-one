/**
 * LibrarySection (Settings → Operational Models) is now a slim explainer
 * panel — the full catalog lives at /models. The old card
 * list, filter input, and Import modal were retired by the
 * "settings becomes explainer" consolidation. These tests cover the
 * current contract:
 *   1. Renders the section header.
 *   2. Renders a count line when the API returns profiles.
 *   3. Renders a "Browse catalog" link pointing at /models.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../api/operationalModels', () => ({
  operationalModelsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

import { operationalModelsApi } from '../../../api/operationalModels';
import { LibrarySection } from './LibrarySection';

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LibrarySection />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const mockedList = operationalModelsApi.list as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LibrarySection (explainer)', () => {
  it('renders the section header', () => {
    mockedList.mockResolvedValueOnce([]);
    renderPanel();
    expect(screen.getByText('Operational Models')).toBeInTheDocument();
  });

  it('renders a count line when the API returns profiles', async () => {
    mockedList.mockResolvedValueOnce([
      { id: 'cp-1', name: 'A', scope: 'platform' },
      { id: 'cp-2', name: 'B', scope: 'workspace' },
    ] as unknown as never[]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/2 models available/i)).toBeInTheDocument();
    });
  });

  it('renders a "Browse catalog" link to /models', () => {
    mockedList.mockResolvedValueOnce([]);
    renderPanel();
    const link = screen.getByRole('link', { name: /browse catalog/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/models');
  });
});
