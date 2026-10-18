import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from './client';
import { appsApi } from './apps';

describe('appsApi collaborator authority', () => {
  it('preserves own editor authority when the directory is private', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {
      collaborators: [], caller_role: 'editor', directory_visible: false,
    } });
    await expect(appsApi.getCollaboratorsDetailed('shared')).resolves.toEqual({
      collaborators: [], caller_role: 'editor', directory_visible: false,
    });
    await expect(appsApi.listCollaborators('shared')).resolves.toEqual([]);
  });
});

describe('appsApi.updateFromLibrary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues an update from the App library package', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { status: 'queued', work_item_id: 'work-123' },
    });

    await expect(appsApi.updateFromLibrary('app-123')).resolves.toEqual({
      status: 'queued',
      work_item_id: 'work-123',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/apps/app-123/update-from-library',
      {},
    );
  });
});

describe('appsApi.batchInstall', () => {
  it('allows schema installation longer than the ordinary read timeout without retries', async () => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { installed: [] } });
    await appsApi.batchInstall([{ library_cp_id: 'library' }], { include_seed_data: false });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/apps/batch-install', { items: [{ library_cp_id: 'library', include_seed_data: false }] }, { timeout: 120_000 });
  });
});
