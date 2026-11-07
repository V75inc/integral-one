import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from './client';
import { attachmentsApi } from './attachments';
import { errorMessageFromAxios } from './helpers';
import { publicSharingApi } from './sharing';
import { memberAssignedFormApi } from '../features/memberAssignedForm/memberAssignedFormApi';

vi.mock('./client', () => ({ default: { post: vi.fn() } }));

const limit = 5 * 1024 * 1024;
function file(name: string, type: string, size: number): File {
  const result = new File(['fixture'], name, { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

describe('Entry image upload limits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { attachment: { id: 'attachment', filename: 'small.png' } },
    });
  });

  it.each(['single', 'smart', 'chunked'] as const)(
    'rejects oversized images before the %s upload sends a request',
    async route => {
      const image = file('large.png', 'image/png', 101 * 1024 * 1024);
      const operation = route === 'single' ? attachmentsApi.uploadForEntry
        : route === 'smart' ? attachmentsApi.smartUploadForEntry
          : attachmentsApi.chunkedUploadForEntry;
      const error = await operation('entry', image).catch(e => e);
      expect(errorMessageFromAxios(error, 'Upload failed')).toBe('Image too large (maximum 5 MB).');
      expect(apiClient.post).not.toHaveBeenCalled();
    },
  );

  it.each([limit - 1, limit])('allows an image of %i bytes', async size => {
    await expect(attachmentsApi.uploadForEntry('entry', file('small.png', 'image/png', size)))
      .resolves.toMatchObject({ id: 'attachment' });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['image.bin', 'IMAGE/PNG'],
    ['PHOTO.PNG', 'application/octet-stream'],
    ['photo.heic', ''],
  ])('recognizes image MIME or filename for %s', async (name, type) => {
    await expect(attachmentsApi.uploadForEntry('entry', file(name, type, limit + 1)))
      .rejects.toThrow('Image too large');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps mixed-batch outcomes in order and uploads only eligible files', async () => {
    const document = file('report.pdf', 'application/pdf', 12 * 1024 * 1024);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {
      results: [{ attachment: { id: 'document', filename: document.name } }],
      summary: { total: 1, succeeded: 1, failed: 0 },
    } });
    const result = await attachmentsApi.uploadManyForEntry('entry', [
      file('large.png', 'image/png', limit + 1), document,
    ]);
    expect(result.results).toEqual([
      { error: 'Image too large (maximum 5 MB).', filename: 'large.png' },
      { attachment: { id: 'document', filename: 'report.pdf' } },
    ]);
    expect(result.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const body = vi.mocked(apiClient.post).mock.calls[0][1] as FormData;
    expect(body.getAll('files')).toEqual([document]);
  });

  it('does not send an all-oversized batch', async () => {
    const result = await attachmentsApi.batchUploadForEntry('entry', [file('large.png', 'image/png', limit + 1)]);
    expect(result.summary).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps the size error readable when a mixed selection exceeds the chunk threshold', async () => {
    const result = await attachmentsApi.uploadManyForEntry('entry', [
      file('large.png', 'image/png', 101 * 1024 * 1024),
      file('report.pdf', 'application/pdf', 12 * 1024 * 1024),
    ]);
    expect(result.results[0]).toEqual({ error: 'Image too large (maximum 5 MB).', filename: 'large.png' });
    expect(result.results[1]).toMatchObject({ attachment: { id: 'attachment' } });
    expect(result.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.post).mock.calls[0][0]).toBe('/entries/entry/attachments');
  });

  it('does not expose arbitrary local exception messages', () => {
    expect(errorMessageFromAxios(new Error('private diagnostics'), 'Upload failed')).toBe('Upload failed');
  });

  it('applies the same preflight to shared Entry and member file fields', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const image = file('large.png', 'image/png', limit + 1);
      await expect(publicSharingApi.uploadPublicEntryAttachment('share', 'entry', image)).rejects.toThrow('Image too large');
      await expect(memberAssignedFormApi.uploadAttachment(image, { entryId: 'entry', fieldKey: 'photo' })).rejects.toThrow('Image too large');
      expect(fetch).not.toHaveBeenCalled();
      expect(apiClient.post).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
