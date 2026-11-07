import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentsApi, entriesApi } from '../../../api';
import { entryTypesForTrackQueryKey, tagsForTrackQueryKey } from '../../../queryKeys';
import type { Entry, Track } from '../../../types';
import { ImageUploadSizeError, MAX_IMAGE_BYTES } from '../../../utils/imageUploadLimits';
import { useEntryExpandedForm } from '../EntryFormExpanded';

vi.mock('../../../api', () => ({
  attachmentsApi: { smartUploadForEntry: vi.fn() },
  entriesApi: { create: vi.fn(), update: vi.fn(), list: vi.fn().mockResolvedValue([]) },
  entryTypesApi: { list: vi.fn() }, linkPreviewApi: {},
  tagsApi: { list: vi.fn().mockResolvedValue([]) },
  tracksApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
}));

const track = { id: 'track', title: 'Records', operational_model_defaults: { default_entry_type: 'note' } } as Track;
const tracksList: Track[] = [];
const baseline = { id: 'entry', track_id: 'track', title: 'Original', type: 'note', custom_fields: {}, tags: [] } as unknown as Entry;
function image(size = MAX_IMAGE_BYTES + 1) {
  const file = new File(['fixture'], 'photo.png', { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
function setup(mode: 'create' | 'edit', fallback?: File) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(entryTypesForTrackQueryKey('track'), [{
    id: 'note-type', name: 'note', track_id: 'track',
    form_schema: { fields: [{ key: 'photo', name: 'Photo', type: 'files' }] },
  }]);
  client.setQueryData(tagsForTrackQueryKey('track'), []);
  const showToast = vi.fn();
  const onCreated = vi.fn();
  const createCustomFieldFallback = fallback ? () => ({ photo: [fallback] }) : undefined;
  const hook = renderHook(() => useEntryExpandedForm({
    mode, enabled: true, track, tracksList, needsTrackPicker: false,
    initialTitle: 'New record', initialEntry: mode === 'edit' ? baseline : undefined,
    showToast, onCreated, createCustomFieldFallback,
  }), { wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...hook, showToast, onCreated };
}

describe('Entry form image preflight before record writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entriesApi.create).mockResolvedValue({ ...baseline, id: 'created' });
    vi.mocked(entriesApi.update).mockResolvedValue(baseline);
    vi.mocked(attachmentsApi.smartUploadForEntry).mockImplementation(async (_, file) => {
      if (file.size > MAX_IMAGE_BYTES) throw new ImageUploadSizeError();
      return { id: 'attachment', filename: file.name };
    });
  });

  it.each(['attachment', 'file field', 'wrapped file field', 'fallback'])(
    'refuses an oversized %s without creating an Entry', async location => {
      const file = image();
      const { result, showToast, onCreated } = setup('create', location === 'fallback' ? file : undefined);
      await waitFor(() => expect(result.current.type).toBe('note'));
      act(() => {
        if (location === 'attachment') result.current.addPendingFiles([file]);
        if (location === 'file field') result.current.setFieldValues({ photo: [file] });
        if (location === 'wrapped file field') result.current.setFieldValues({ photo: [{ file }] });
      });
      await act(async () => { await result.current.handleSubmitCreate(); });
      expect(entriesApi.create).not.toHaveBeenCalled();
      expect(attachmentsApi.smartUploadForEntry).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('Image too large (maximum 5 MB).', 'error');
      expect(result.current.title).toBe('New record');
    },
  );

  it('refuses an oversized queued image before saving edits', async () => {
    const { result, showToast } = setup('edit');
    await waitFor(() => expect(result.current.title).toBe('Original'));
    act(() => { result.current.setTitle('Changed'); result.current.addPendingFiles([image()]); });
    await act(async () => { await expect(result.current.handleSubmitEdit('entry')).rejects.toThrow('Image too large'); });
    expect(entriesApi.update).not.toHaveBeenCalled();
    expect(attachmentsApi.smartUploadForEntry).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Image too large (maximum 5 MB).', 'error');
    expect(result.current.title).toBe('Changed');
  });

  it('still saves an Entry with an image exactly at the limit', async () => {
    const { result, onCreated } = setup('create');
    await waitFor(() => expect(result.current.type).toBe('note'));
    act(() => { result.current.addPendingFiles([image(MAX_IMAGE_BYTES)]); });
    await act(async () => { await result.current.handleSubmitCreate(); });
    expect(entriesApi.create).toHaveBeenCalledTimes(1);
    expect(attachmentsApi.smartUploadForEntry).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
