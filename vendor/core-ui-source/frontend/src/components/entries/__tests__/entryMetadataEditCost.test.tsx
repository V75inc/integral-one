import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entriesApi } from '../../../api';
import { entryTypesForTrackQueryKey, tagsForTrackQueryKey } from '../../../queryKeys';
import type { Entry, Track } from '../../../types';
import { useEntryExpandedForm } from '../EntryFormExpanded';

vi.mock('../../../api', () => ({
  attachmentsApi: {},
  entriesApi: { update: vi.fn(), list: vi.fn().mockResolvedValue([]) },
  entryTypesApi: { list: vi.fn() }, linkPreviewApi: {},
  tagsApi: { list: vi.fn().mockResolvedValue([]) },
  tracksApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
}));

const track = { id: 'track', title: 'Records' } as Track;
const tracksList: Track[] = [];
const baseline = {
  id: 'record', track_id: 'track', type: 'note', type_id: 'note-type',
  title: 'Original', body: 'Stored body', tags: [],
  custom_fields: { value: 'saved', _entry_type_slug: 'note' },
  record_revision: 7, schema_revision: 3,
} as unknown as Entry;

function setup(entry = baseline) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(entryTypesForTrackQueryKey('track'), ['note', 'other'].map(name => ({
    id: `${name}-type`, name, track_id: 'track',
    form_schema: { fields: [{ key: 'value', name: 'Value', type: 'text' }] },
  })));
  client.setQueryData(tagsForTrackQueryKey('track'), []);
  return renderHook(({current}) => useEntryExpandedForm({
    mode: 'edit', enabled: true, track, tracksList, needsTrackPicker: false,
    initialEntry: current, showToast: vi.fn(),
  }), {
    initialProps: { current: entry },
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe('Metadata editor admission cost and draft revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entriesApi.update).mockResolvedValue({ ...baseline, record_revision: 8 });
  });

  it('omits unchanged schema/custom fields and binds the already loaded draft', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    act(() => result.current.setTitle('Renamed'));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    const patch = vi.mocked(entriesApi.update).mock.calls[0][1];
    expect(patch).toMatchObject({ title: 'Renamed', expected_record_revision: 7, expected_schema_revision: 3 });
    expect(patch).not.toHaveProperty('type_id');
    expect(patch).not.toHaveProperty('custom_fields');
  });

  it('does not promote a stale draft to a background-refetched revision', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    act(() => result.current.setTitle('My draft'));
    rerender({ current: { ...baseline, record_revision: 9, schema_revision: 4 } });
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenCalledWith(baseline.id, expect.objectContaining({
      expected_record_revision: 7, expected_schema_revision: 3,
    }));
  });

  it('advances the draft revision after its own successful save', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    act(() => result.current.setTitle('First edit'));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    act(() => result.current.setTitle('Second edit'));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenNthCalledWith(2, baseline.id, expect.objectContaining({
      expected_record_revision: 8, expected_schema_revision: 3,
    }));
  });

  it('retains the original draft revision after a rejected save', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    const conflict = new Error('Record changed');
    vi.mocked(entriesApi.update).mockRejectedValueOnce(conflict);
    await act(async () => {
      await expect(result.current.handleSubmitEdit(baseline.id)).rejects.toThrow('Record changed');
    });
    rerender({ current: { ...baseline, record_revision: 9 } });
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenLastCalledWith(baseline.id, expect.objectContaining({
      expected_record_revision: 7, expected_schema_revision: 3,
    }));
  });

  it('retains actual custom-field and type changes for normal schema admission', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    act(() => result.current.setFieldValues({ value: 'changed' }));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenLastCalledWith(baseline.id, expect.objectContaining({ custom_fields: { value: 'changed' } }));
    act(() => result.current.setType('other'));
    await waitFor(() => expect(result.current.type).toBe('other'));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenLastCalledWith(baseline.id, expect.objectContaining({ type_id: 'other-type' }));
  });

  it('still clears a stored preview when its URL is removed', async () => {
    const { result } = setup({ ...baseline, custom_fields: { ...baseline.custom_fields, _link_preview: { url: 'https://example.invalid', title: 'Old' } } });
    await waitFor(() => expect(result.current.fieldValues.value).toBe('saved'));
    await act(async () => { await result.current.handleSubmitEdit(baseline.id); });
    expect(entriesApi.update).toHaveBeenLastCalledWith(baseline.id, expect.objectContaining({ custom_fields: { _link_preview: null } }));
  });
});
