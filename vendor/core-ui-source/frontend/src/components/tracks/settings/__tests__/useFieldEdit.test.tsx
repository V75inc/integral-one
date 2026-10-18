import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFieldEdit } from '../hooks/useFieldEdit';
import { entryTypesForTrackQueryKey } from '../../../../queryKeys';
import type { EntryTypeNode } from '../../../../types';

vi.mock('../../../../api/entryTypes', () => ({
  entryTypesApi: {
    update: vi.fn(),
  },
}));

import { entryTypesApi } from '../../../../api/entryTypes';

const trackId = 'trk_1';
const et: EntryTypeNode = {
  id: 'et_1',
  name: 'note',
  track_id: trackId,
  form_schema: {
    fields: [{ key: 'priority', name: 'priority', type: 'text', order: 0 }],
    related_views: [{ view: 'feed:main', bind: {} }],
  },
};

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useFieldEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes optimistically and invalidates query keys on success', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const etKey = entryTypesForTrackQueryKey(trackId);
    client.setQueryData(etKey, [et]);
    (entryTypesApi.update as any).mockResolvedValue({ ...et, form_schema: { fields: [
      { key: 'priority', name: 'priority', type: 'text', order: 0 },
      { key: 'owner', name: 'owner', type: 'text', order: 1 },
    ] } });

    const { result } = renderHook(() => useFieldEdit(trackId), { wrapper: wrapper(client) });

    await result.current.saveFields('et_1', [
      { key: 'priority', name: 'priority', type: 'text', order: 0 },
      { key: 'owner', name: 'owner', type: 'text', order: 1 },
    ]);

    await waitFor(() => {
      expect(entryTypesApi.update).toHaveBeenCalledWith('et_1', {
        form_schema: {
          fields: [
            { key: 'priority', name: 'priority', type: 'text', order: 0 },
            { key: 'owner', name: 'owner', type: 'text', order: 1 },
          ],
          related_views: [{ view: 'feed:main', bind: {} }],
        },
      });
    });

    const cached = client.getQueryData<EntryTypeNode[]>(etKey);
    expect(cached?.[0].form_schema?.fields?.map(f => f.key)).toEqual(['priority', 'owner']);
  });

  it('rolls back on error', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const etKey = entryTypesForTrackQueryKey(trackId);
    client.setQueryData(etKey, [et]);
    (entryTypesApi.update as any).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useFieldEdit(trackId), { wrapper: wrapper(client) });

    await expect(
      result.current.saveFields('et_1', [
        { key: 'priority', name: 'priority', type: 'text', order: 0 },
        { key: 'extra', name: 'extra', type: 'text', order: 1 },
      ])
    ).rejects.toThrow();

    const cached = client.getQueryData<EntryTypeNode[]>(etKey);
    expect(cached?.[0].form_schema?.fields?.map(f => f.key)).toEqual(['priority']);
  });
});
