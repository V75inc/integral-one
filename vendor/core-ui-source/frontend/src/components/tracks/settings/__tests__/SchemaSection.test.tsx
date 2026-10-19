import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SchemaSection } from '../SchemaSection';
import { ConfirmProvider } from '../../../../context/ConfirmContext';

vi.mock('../../../../api/entryTypes', () => ({
  entryTypesApi: { list: vi.fn(), update: vi.fn() },
}));
vi.mock('../../../../api/operationalModels', () => ({
  operationalModelsApi: {
    getAttachedForTrack: vi.fn(),
    detachLibraryFromTrackProfile: vi.fn(),
    revertTrackProfileCustomizations: vi.fn(),
  },
}));
vi.mock('../../../system/apiErrorNotifier', () => ({
  notifyApiFailure: vi.fn(),
}));

import { entryTypesApi } from '../../../../api/entryTypes';
import { operationalModelsApi } from '../../../../api/operationalModels';

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>{node}</ConfirmProvider>
    </QueryClientProvider>
  );
}

describe('SchemaSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders entry types and field counts', async () => {
    (entryTypesApi.list as any).mockResolvedValue([
      {
        id: 'et_1',
        name: 'note',
        form_schema: { fields: [{ key: 'priority', name: 'priority', type: 'text' }] },
      },
    ]);
    (operationalModelsApi.getAttachedForTrack as any).mockResolvedValue({
      id: 'cp_1',
      library_package: false,
    });

    wrap(<SchemaSection trackId="trk_1" canEdit />);

    await waitFor(() => {
      expect(screen.getByText(/note/i)).toBeInTheDocument();
      expect(screen.getByText(/3 fields/i)).toBeInTheDocument();
    });
  });

  it('refuses to render against a library_package OperationalModel', async () => {
    (entryTypesApi.list as any).mockResolvedValue([{ id: 'et_1', name: 'x', form_schema: { fields: [] } }]);
    (operationalModelsApi.getAttachedForTrack as any).mockResolvedValue({
      id: 'cp_lib',
      library_package: true,
    });

    const { container } = wrap(<SchemaSection trackId="trk_1" canEdit />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows divergence banner when library_merge_source_id present', async () => {
    (entryTypesApi.list as any).mockResolvedValue([
      { id: 'et_1', name: 'note', form_schema: { fields: [] } },
    ]);
    (operationalModelsApi.getAttachedForTrack as any).mockResolvedValue({
      id: 'cp_1',
      library_package: false,
      library_merge_source_id: 'lib_1',
      library_merge_source_name: 'CRM v1',
    });

    wrap(<SchemaSection trackId="trk_1" canEdit />);
    await waitFor(() => {
      expect(screen.getByText(/Customized from library/i)).toBeInTheDocument();
      expect(screen.getByText(/CRM v1/i)).toBeInTheDocument();
    });
  });
});
